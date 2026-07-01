# IoT Dashboard – Giám Sát Nhiệt Độ, Độ Ẩm & Ánh Sáng

Dự án giám sát và điều khiển thiết bị thông qua giao thức **MQTT** và chip **ESP32-C3** thời gian thực, tích hợp giao diện Web Dashboard trực quan và chuyên nghiệp.

---

## Web Dashboard Trực Tuyến

Bạn có thể quét mã QR dưới đây bằng điện thoại hoặc nhấp vào đường link để truy cập giao diện điều khiển từ xa:

**Link trang web:** [https://mkohaku1310.github.io/IoT-NhietDo/](https://mkohaku1310.github.io/IoT-NhietDo/)

### Quét mã QR để truy cập nhanh:
![Mã QR Truy Cập Web Dashboard](qrcode.png)

---

## Tính Năng Chính
- **Giám sát thời gian thực:** Cập nhật thông số Nhiệt độ, Độ ẩm (DHT11) và Cường độ ánh sáng dạng số Lux (BH1750).
- **Điều khiển thiết bị:**
  - **Đèn 1 (LED 1):** Tự động bật/tắt theo ánh sáng môi trường (dưới 50 lx) hoặc điều khiển thủ công qua Web.
  - **Đèn điều hòa (LED 2):** Tự động bật khi nhiệt độ > 32°C và hỗ trợ điều khiển thủ công.
  - **Quạt thông gió (LED 3):** Tự động bật khi độ ẩm > 80% và hỗ trợ điều khiển thủ công.
- **Biểu đồ trực quan:** Biểu đồ lịch sử hiển thị song song Nhiệt độ & Độ ẩm sử dụng **Chart.js**.
- **Nhật ký hệ thống:** Lưu vết và cảnh báo trực tiếp (nền sáng nhã nhặn), lọc trùng lặp tránh spam.

---

## Cấu Trúc Mã Nguồn
- `index.html`, `style.css`, `app.js`: Mã nguồn giao diện Web Dashboard (đã được cấu hình tự động nhận dạng chip và kết nối MQTT).
- `arduino/esp32.ino`: Mã nguồn C++ chạy trên vi điều khiển ESP32-C3.
- `arduino/secrets.h.example`: File mẫu hướng dẫn cấu hình thông tin kết nối WiFi cá nhân.

---

## Hướng Dẫn Nạp Code ESP32-C3
1. Tạo một file tên là `secrets.h` nằm trong thư mục `arduino/` (bạn có thể copy từ file `secrets.h.example`).
2. Điền thông tin WiFi của bạn vào:
   ```cpp
   const char* ssid = "Tên_WiFi_Của_Bạn";
   const char* password = "Mật_Khẩu_WiFi";
   ```
3. Mở file `esp32.ino` bằng Arduino IDE, cài đặt các thư viện cần thiết (`WiFi`, `PubSubClient`, `DHT`, `BH1750`) và tiến hành nạp code lên board ESP32-C3.
