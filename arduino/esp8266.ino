#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include "secrets.h"

// ===== MQTT =====
const char* mqtt_server = "broker.hivemq.com";

// ===== PIN =====
#define LDR_PIN 16  // Chân D0 trên ESP8266 Mini (GPIO16)
#define DHT_PIN 14  // Chân D5 trên ESP8266 Mini (GPIO14)
#define DHT_TYPE DHT11
#define LED_PIN 13  // Chân D7 trên ESP8266 Mini (GPIO13)
#define LED2_PIN 4  // Chân D2 trên ESP8266 Mini (GPIO4) - LED Điều hòa

DHT dht(DHT_PIN, DHT_TYPE);

WiFiClient espClient;
PubSubClient client(espClient);

// ===== BIẾN TRẠNG THÁI =====
bool autoMode = true;       // Mặc định bật chế độ tự động theo ánh sáng (LED 1)
int lastLdrState = -1;      // Trạng thái LDR trước đó
int lastLedState = -1;      // Trạng thái LED 1 trước đó
bool lastAutoModeState = true; // Trạng thái Tự động LED 1 trước đó

bool autoMode2 = true;      // Mặc định bật chế độ tự động theo nhiệt độ (LED 2)
int lastLed2State = -1;     // Trạng thái LED 2 trước đó
bool lastAutoMode2State = true; // Trạng thái Tự động LED 2 trước đó
unsigned long lastSensorRead = 0; // Thời gian đọc cảm biến cuối cùng

// ===== NHẬN LỆNH MQTT =====
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Nhan duoc [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);

  // Điều khiển chế độ Tự động/Thủ công Đèn 1 (LDR)
  if (String(topic) == "esp8266/automode") {
    if (message == "ON") {
      autoMode = true;
      Serial.println("Che do tu dong LED 1: BAT");
    } else if (message == "OFF") {
      autoMode = false;
      Serial.println("Che do tu dong LED 1: TAT");
    }
  }
  // Điều khiển LED 1 thủ công
  else if (String(topic) == "esp8266/led") {
    if (message == "ON") {
      digitalWrite(LED_PIN, HIGH);
      Serial.println("Dieu khien tay: BAT LED 1");
    } else if (message == "OFF") {
      digitalWrite(LED_PIN, LOW);
      Serial.println("Dieu khien tay: TAT LED 1");
    }
  }
  // Điều khiển chế độ Tự động/Thủ công Đèn 2 (Nhiệt độ)
  else if (String(topic) == "esp8266/automode2") {
    if (message == "ON") {
      autoMode2 = true;
      Serial.println("Che do tu dong LED 2: BAT");
    } else if (message == "OFF") {
      autoMode2 = false;
      Serial.println("Che do tu dong LED 2: TAT");
    }
  }
  // Điều khiển LED 2 thủ công
  else if (String(topic) == "esp8266/led2") {
    if (message == "ON") {
      digitalWrite(LED2_PIN, HIGH);
      Serial.println("Dieu khien tay: BAT LED 2 (Dieu hoa)");
    } else if (message == "OFF") {
      digitalWrite(LED2_PIN, LOW);
      Serial.println("Dieu khien tay: TAT LED 2 (Dieu hoa)");
    }
  }
}

// ===== KẾT NỐI WIFI =====
void setup_wifi() {
  delay(10);
  
  // Thiết lập chế độ Station (thiết bị nhận) và xóa cấu hình cũ
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
    
    // Cứ mỗi 10 giây (20 lần delay 500ms) sẽ in ra chẩn đoán lỗi
    if (count % 20 == 0) {
      Serial.println();
      Serial.print("Trang thai WiFi hien tai: ");
      wl_status_t status = WiFi.status();
      if (status == WL_NO_SSID_AVAIL) {
        Serial.println("KHONG TIM THAY SSID (Khong thay ten Wi-Fi)!");
      } else if (status == WL_CONNECT_FAILED) {
        Serial.println("KET NOI THAT BAI (Co the sai mat khau)!");
      } else if (status == WL_IDLE_STATUS) {
        Serial.println("Dang cho trang thai ranh...");
      } else if (status == WL_DISCONNECTED) {
        Serial.println("Dang ngat ket noi hoac dang thu lai...");
      } else {
        Serial.print("Code trang thai: ");
        Serial.println(status);
      }
      Serial.print("Dang thu ket noi lai");
    }
  }
  Serial.println("\nDa ket noi WiFi!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

// ===== KẾT NỐI MQTT =====
void reconnect() {
  while (!client.connected()) {
    Serial.print("Dang ket noi MQTT...");

    // Tạo Client ID duy nhất dựa trên Chip ID của ESP8266
    String clientId = "ESP8266Client-" + String(ESP.getChipId());

    if (client.connect(clientId.c_str())) {
      Serial.println("OK!");

      // Subscribe nhận lệnh điều khiển LED và Chế độ tự động
      client.subscribe("esp8266/led");
      client.subscribe("esp8266/automode");
      client.subscribe("esp8266/led2");
      client.subscribe("esp8266/automode2");
      
      // Reset trạng thái gửi để gửi lại ngay sau khi kết nối lại
      lastLdrState = -1;
      lastLedState = -1;
      lastLed2State = -1;
      lastAutoModeState = !autoMode; 
      lastAutoMode2State = !autoMode2;
    } else {
      Serial.print("Loi, code=");
      Serial.print(client.state());
      Serial.println(" thu lai...");
      delay(2000);
    }
  }
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  pinMode(LED2_PIN, OUTPUT);
  digitalWrite(LED2_PIN, LOW);
  
  pinMode(LDR_PIN, INPUT); // Thiết lập chân cảm biến ánh sáng LDR (D0) là đầu vào

  setup_wifi();

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  dht.begin();
}

// ===== LOOP =====
void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorRead >= 2000) {
    lastSensorRead = currentMillis;

    // 1. Đọc cảm biến ánh sáng LDR (Digital DO)
    int ldrState = digitalRead(LDR_PIN);

    // 2. Chế độ tự động Đèn 1: Bật đèn khi trời tối, tắt khi trời sáng
    if (autoMode) {
      if (ldrState == HIGH) {
        digitalWrite(LED_PIN, HIGH); // Trời tối -> Bật đèn 1
      } else {
        digitalWrite(LED_PIN, LOW);  // Trời sáng -> Tắt đèn 1
      }
    }

    // 3. Đọc cảm biến nhiệt độ & độ ẩm
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();

    // Kiểm tra lỗi cảm biến DHT
    if (isnan(temp) || isnan(hum)) {
      Serial.println("Loi doc DHT!");
    } else {
      // 4. Chế độ tự động Đèn 2 (Điều hòa): Bật khi temp > 33, tắt khi temp < 30
      if (autoMode2) {
        if (temp > 33.0) {
          digitalWrite(LED2_PIN, HIGH); // Nóng -> Bật điều hòa (Đèn 2)
        } else if (temp < 30.0) {
          digitalWrite(LED2_PIN, LOW);  // Mát -> Tắt điều hòa (Đèn 2)
        }
      }

      // Gửi nhiệt độ và độ ẩm
      client.publish("esp8266/temp", String(temp).c_str());
      client.publish("esp8266/hum", String(hum).c_str());
    }

    // 5. GỬI DỮ LIỆU LÊN MQTT BROKER
    // Gửi trạng thái LDR nếu có thay đổi
    if (ldrState != lastLdrState) {
      if (ldrState == HIGH) {
        client.publish("esp8266/ldr", "DARK");
        Serial.println("Anh sang: TROI TOI");
      } else {
        client.publish("esp8266/ldr", "LIGHT");
        Serial.println("Anh sang: TROI SANG");
      }
      lastLdrState = ldrState;
    }

    // Gửi trạng thái thực tế của LED 1 nếu có thay đổi
    int currentLedState = digitalRead(LED_PIN);
    if (currentLedState != lastLedState) {
      if (currentLedState == HIGH) {
        client.publish("esp8266/led/state", "ON");
      } else {
        client.publish("esp8266/led/state", "OFF");
      }
      lastLedState = currentLedState;
    }

    // Gửi trạng thái thực tế của LED 2 nếu có thay đổi
    int currentLed2State = digitalRead(LED2_PIN);
    if (currentLed2State != lastLed2State) {
      if (currentLed2State == HIGH) {
        client.publish("esp8266/led2/state", "ON");
      } else {
        client.publish("esp8266/led2/state", "OFF");
      }
      lastLed2State = currentLed2State;
    }

    // Gửi trạng thái chế độ Tự động LED 1 nếu có thay đổi
    if (autoMode != lastAutoModeState) {
      if (autoMode) {
        client.publish("esp8266/automode/state", "ON");
      } else {
        client.publish("esp8266/automode/state", "OFF");
      }
      lastAutoModeState = autoMode;
    }

    // Gửi trạng thái chế độ Tự động LED 2 nếu có thay đổi
    if (autoMode2 != lastAutoMode2State) {
      if (autoMode2) {
        client.publish("esp8266/automode2/state", "ON");
      } else {
        client.publish("esp8266/automode2/state", "OFF");
      }
      lastAutoMode2State = autoMode2;
    }

    // Monitor ra màn hình Serial
    Serial.print("Temp: ");
    Serial.print(temp);
    Serial.print(" | Hum: ");
    Serial.print(hum);
    Serial.print(" | LDR: ");
    Serial.print(ldrState == HIGH ? "DARK" : "LIGHT");
    Serial.print(" | LED 1: ");
    Serial.print(currentLedState == HIGH ? "ON" : "OFF");
    Serial.print(" | LED 2: ");
    Serial.println(currentLed2State == HIGH ? "ON" : "OFF");
  }
}