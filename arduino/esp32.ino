#include <Wire.h>
#include <BH1750.h>
#include <DHT.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include "secrets.h"

// ===== CẤU HÌNH CÁC CHÂN KẾT NỐI (ESP32-C3) =====
#define SDA_PIN     8   // Chân I2C SDA
#define SCL_PIN     9   // Chân I2C SCL
#define DHT_PIN     10  // Chân dữ liệu DHT11
#define DHT_TYPE    DHT11

#define LED_LIGHT   0   // LED 1: Đèn chiếu sáng tự động theo ánh sáng
#define LED_TEMP    2   // LED 2: Đèn cảnh báo khi nhiệt độ cao
#define LED_HUMID   4   // LED 3: Quạt thông gió cảnh báo khi độ ẩm cao

// ===== NGƯỠNG ĐIỀU KHIỂN TỰ ĐỘNG =====
#define LUX_THRESHOLD     50.0   // Dưới 50 lx coi là tối -> Tự động bật đèn 1
#define TEMP_THRESHOLD    32.0   // Trên 32 độ C -> Tự động bật đèn 2 (cảnh báo nhiệt độ)
#define HUMID_THRESHOLD   80.0   // Trên 80% -> Tự động bật đèn 3 (cảnh báo độ ẩm)

// ===== KHỞI TẠO ĐỐI TƯỢNG CẢM BIẾN & KẾT NỐI =====
BH1750 lightMeter(0x23);
DHT dht(DHT_PIN, DHT_TYPE);

WiFiClient espClient;
PubSubClient client(espClient);
const char* mqtt_server = "broker.hivemq.com";

// ===== CÁC BIẾN TRẠNG THÁI HỆ THỐNG =====
bool autoMode = true;       // Chế độ tự động LED 1 (Mặc định: BẬT)
bool autoMode2 = true;      // Chế độ tự động LED 2 (Mặc định: BẬT)
bool autoMode3 = true;      // Chế độ tự động LED 3 (Mặc định: BẬT)

// Lưu trạng thái trước đó để tránh gửi trùng lặp lên MQTT
int lastLedState = -1;
int lastLed2State = -1;
int lastLed3State = -1;

bool lastAutoModeState = true;
bool lastAutoMode2State = true;
bool lastAutoMode3State = true;

unsigned long lastRead = 0;
const unsigned long READ_INTERVAL = 2000; // Đọc cảm biến và gửi dữ liệu mỗi 2 giây

// ===== HÀM KẾT NỐI WIFI =====
void setup_wifi() {
  delay(10);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  Serial.println();
  Serial.print("Dang ket noi den Wi-Fi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);

  int count = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    count++;
    
    if (count % 20 == 0) {
      Serial.println();
      Serial.print("Trang thai WiFi hien tai: ");
      wl_status_t status = WiFi.status();
      if (status == WL_NO_SSID_AVAIL) {
        Serial.println("KHONG TIM THAY SSID!");
      } else if (status == WL_CONNECT_FAILED) {
        Serial.println("KET NOI THAT BAI (Sai mat khau)!");
      } else {
        Serial.print("Code trang thai: ");
        Serial.println(status);
      }
      Serial.print("Dang thu ket noi lai");
    }
  }
  Serial.println("\nDa ket noi WiFi!");
  Serial.print("Dia chi IP: ");
  Serial.println(WiFi.localIP());
}

// ===== HÀM NHẬN LỆNH ĐIỀU KHIỂN TỪ MQTT =====
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Nhan duoc tin nhan tu [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  // --- Điều khiển LED 1 (Đèn chiếu sáng) ---
  if (String(topic) == "esp32/automode") {
    autoMode = (message == "ON");
    Serial.print("Che do tu dong LED 1: ");
    Serial.println(autoMode ? "BAT" : "TAT");
  } 
  else if (String(topic) == "esp32/led") {
    if (!autoMode) { // Chỉ cho phép điều khiển thủ công khi Chế độ tự động TẮT
      if (message == "ON") {
        digitalWrite(LED_LIGHT, HIGH);
        Serial.println("Dieu khien tay: BAT LED 1");
      } else if (message == "OFF") {
        digitalWrite(LED_LIGHT, LOW);
        Serial.println("Dieu khien tay: TAT LED 1");
      }
    }
  }

  // --- Điều khiển LED 2 (Cảnh báo Nhiệt độ) ---
  else if (String(topic) == "esp32/automode2") {
    autoMode2 = (message == "ON");
    Serial.print("Che do tu dong LED 2: ");
    Serial.println(autoMode2 ? "BAT" : "TAT");
  } 
  else if (String(topic) == "esp32/led2") {
    if (!autoMode2) {
      if (message == "ON") {
        digitalWrite(LED_TEMP, HIGH);
        Serial.println("Dieu khien tay: BAT LED 2");
      } else if (message == "OFF") {
        digitalWrite(LED_TEMP, LOW);
        Serial.println("Dieu khien tay: TAT LED 2");
      }
    }
  }

  // --- Điều khiển LED 3 (Cảnh báo Độ ẩm) ---
  else if (String(topic) == "esp32/automode3") {
    autoMode3 = (message == "ON");
    Serial.print("Che do tu dong LED 3: ");
    Serial.println(autoMode3 ? "BAT" : "TAT");
  } 
  else if (String(topic) == "esp32/led3") {
    if (!autoMode3) {
      if (message == "ON") {
        digitalWrite(LED_HUMID, HIGH);
        Serial.println("Dieu khien tay: BAT LED 3 (Quat)");
      } else if (message == "OFF") {
        digitalWrite(LED_HUMID, LOW);
        Serial.println("Dieu khien tay: TAT LED 3 (Quat)");
      }
    }
  }
}

// ===== HÀM KẾT NỐI LẠI MQTT BROKER =====
void reconnect() {
  while (!client.connected()) {
    Serial.print("Dang ket noi MQTT...");
    // Tạo Client ID duy nhất dựa trên Chip MAC address của ESP32
    uint64_t chipMac = ESP.getEfuseMac();
    String clientId = "ESP32Client-" + String((uint32_t)chipMac, HEX);

    if (client.connect(clientId.c_str())) {
      Serial.println("OK!");

      // Đăng ký nhận tin nhắn từ các topic điều khiển
      client.subscribe("esp32/led");
      client.subscribe("esp32/automode");
      client.subscribe("esp32/led2");
      client.subscribe("esp32/automode2");
      client.subscribe("esp32/led3");
      client.subscribe("esp32/automode3");
      
      // Khởi động lại các trạng thái gửi để lập tức đồng bộ trạng thái thực tế lên Web
      lastLedState = -1;
      lastLed2State = -1;
      lastLed3State = -1;
      lastAutoModeState = !autoMode; 
      lastAutoMode2State = !autoMode2;
      lastAutoMode3State = !autoMode3;
    } else {
      Serial.print("Loi, code=");
      Serial.print(client.state());
      Serial.println(" thu lai sau 2 giay...");
      delay(2000);
    }
  }
}

// ===== CẤU HÌNH BAN ĐẦU (SETUP) =====
void setup() {
  Serial.begin(115200);

  // Cấu hình các chân LED là đầu ra (Output)
  pinMode(LED_LIGHT, OUTPUT);
  pinMode(LED_TEMP, OUTPUT);
  pinMode(LED_HUMID, OUTPUT);
  digitalWrite(LED_LIGHT, LOW);
  digitalWrite(LED_TEMP, LOW);
  digitalWrite(LED_HUMID, LOW);

  // Khởi tạo giao tiếp I2C cho cảm biến BH1750
  Wire.begin(SDA_PIN, SCL_PIN);

  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("BH1750 khoi tao thanh cong!");
  } else {
    Serial.println("Loi: Khong tim thay cam bien BH1750!");
  }

  // Khởi tạo cảm biến DHT11
  dht.begin();

  // Kết nối WiFi và cấu hình MQTT Client
  setup_wifi();
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  Serial.println("He thong nha thong minh mini da san sang hoat dong!");
}

// ===== VÒNG LẶP CHÍNH (LOOP) =====
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  if (millis() - lastRead >= READ_INTERVAL) {
    lastRead = millis();

    // ----- ĐỌC DỮ LIỆU CẢM BIẾN -----
    float lux = lightMeter.readLightLevel();
    float temp = dht.readTemperature();
    float humid = dht.readHumidity();

    // ----- KIỂM TRA & GỬI DỮ LIỆU NHIỆT ĐỘ - ĐỘ ẨM -----
    if (isnan(temp) || isnan(humid)) {
      Serial.println("Loi doc du lieu tu DHT11!");
    } else {
      Serial.print("Nhiet do: ");
      Serial.print(temp);
      Serial.print(" C | Do am: ");
      Serial.print(humid);
      Serial.println(" %");

      // Gửi giá trị nhiệt độ và độ ẩm lên MQTT
      client.publish("esp32/temp", String(temp, 1).c_str());
      client.publish("esp32/hum", String(humid, 1).c_str());
    }

    // ----- KIỂM TRA & GỬI DỮ LIỆU ÁNH SÁNG BH1750 -----
    if (isnan(lux) || lux < 0) {
      Serial.println("Loi doc du lieu tu BH1750!");
    } else {
      Serial.print("Anh sang: ");
      Serial.print(lux);
      Serial.println(" lx");

      // Gửi giá trị cường độ ánh sáng lên MQTT
      client.publish("esp32/lux", String(lux, 1).c_str());
    }

    // ----- LOGIC ĐIỀU KHIỂN & ĐỒNG BỘ TRẠNG THÁI LÊN MQTT -----

    // 1. Logic cho LED 1 (Đèn chiếu sáng tự động theo ánh sáng)
    if (autoMode) {
      if (lux >= 0 && lux < LUX_THRESHOLD) {
        digitalWrite(LED_LIGHT, HIGH); // Trời tối -> Bật đèn
      } else {
        digitalWrite(LED_LIGHT, LOW);  // Trời sáng -> Tắt đèn
      }
    }
    
    // Gửi trạng thái thực tế của LED 1 lên MQTT nếu thay đổi
    int currentLedState = digitalRead(LED_LIGHT);
    if (currentLedState != lastLedState) {
      client.publish("esp32/led/state", currentLedState == HIGH ? "ON" : "OFF");
      lastLedState = currentLedState;
    }
    // Gửi trạng thái Chế độ tự động LED 1 nếu thay đổi
    if (autoMode != lastAutoModeState) {
      client.publish("esp32/automode/state", autoMode ? "ON" : "OFF");
      lastAutoModeState = autoMode;
    }

    // 2. Logic cho LED 2 (Cảnh báo Nhiệt độ)
    if (autoMode2) {
      if (!isnan(temp) && temp > TEMP_THRESHOLD) {
        digitalWrite(LED_TEMP, HIGH); // Nhiệt độ cao -> Bật còi/đèn cảnh báo
      } else {
        digitalWrite(LED_TEMP, LOW);
      }
    }

    // Gửi trạng thái thực tế của LED 2 lên MQTT nếu thay đổi
    int currentLed2State = digitalRead(LED_TEMP);
    if (currentLed2State != lastLed2State) {
      client.publish("esp32/led2/state", currentLed2State == HIGH ? "ON" : "OFF");
      lastLed2State = currentLed2State;
    }
    // Gửi trạng thái Chế độ tự động LED 2 nếu thay đổi
    if (autoMode2 != lastAutoMode2State) {
      client.publish("esp32/automode2/state", autoMode2 ? "ON" : "OFF");
      lastAutoMode2State = autoMode2;
    }

    // 3. Logic cho LED 3 (Cảnh báo Độ ẩm)
    if (autoMode3) {
      if (!isnan(humid) && humid > HUMID_THRESHOLD) {
        digitalWrite(LED_HUMID, HIGH); // Độ ẩm quá cao -> Bật quạt thông gió
      } else {
        digitalWrite(LED_HUMID, LOW);
      }
    }

    // Gửi trạng thái thực tế của LED 3 lên MQTT nếu thay đổi
    int currentLed3State = digitalRead(LED_HUMID);
    if (currentLed3State != lastLed3State) {
      client.publish("esp32/led3/state", currentLed3State == HIGH ? "ON" : "OFF");
      lastLed3State = currentLed3State;
    }
    // Gửi trạng thái Chế độ tự động LED 3 nếu thay đổi
    if (autoMode3 != lastAutoMode3State) {
      client.publish("esp32/automode3/state", autoMode3 ? "ON" : "OFF");
      lastAutoMode3State = autoMode3;
    }

    Serial.println("-------------------------");
  }
}
