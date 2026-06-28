/**
 * app.js – IoT Dashboard MQTT Client
 * Kết nối MQTT qua WebSocket, nhận dữ liệu cảm biến (Nhiệt độ, độ ẩm, LDR)
 * và điều khiển LED (Tự động/Thủ công).
 */

// ─────────────────────────────────────────
// 1. CẤU HÌNH MQTT
// ─────────────────────────────────────────
const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';

const MQTT_OPTIONS = {
  clientId: 'iot_dashboard_' + Math.random().toString(16).slice(2, 10),
  clean: true,
  reconnectPeriod: 3000,   // tự động kết nối lại sau 3 giây
  connectTimeout: 8000,
};

// Các Topic giao tiếp
const TOPIC_TEMP        = 'esp8266/temp';
const TOPIC_HUM         = 'esp8266/hum';
const TOPIC_LDR         = 'esp8266/ldr';             // Nhận trạng thái ánh sáng (DARK / LIGHT)
const TOPIC_LED_CMD     = 'esp8266/led';             // Gửi lệnh điều khiển LED (ON / OFF)
const TOPIC_LED_STATE   = 'esp8266/led/state';       // Nhận phản hồi trạng thái LED thực tế (ON / OFF)
const TOPIC_AUTO_CMD    = 'esp8266/automode';        // Gửi lệnh bật/tắt chế độ tự động (ON / OFF)
const TOPIC_AUTO_STATE  = 'esp8266/automode/state';  // Nhận phản hồi chế độ tự động thực tế (ON / OFF)
const TOPIC_LED2_CMD    = 'esp8266/led2';            // Gửi lệnh điều khiển LED2 (ON / OFF)
const TOPIC_LED2_STATE  = 'esp8266/led2/state';      // Nhận phản hồi trạng thái LED2 thực tế (ON / OFF)
const TOPIC_AUTO2_CMD   = 'esp8266/automode2';       // Gửi lệnh bật/tắt chế độ tự động 2 (ON / OFF)
const TOPIC_AUTO2_STATE = 'esp8266/automode2/state'; // Nhận phản hồi chế độ tự động 2 thực tế (ON / OFF)

// ─────────────────────────────────────────
// 2. LẤY CÁC PHẦN TỬ DOM
// ─────────────────────────────────────────
const statusBadge     = document.getElementById('statusBadge');
const statusDot       = document.getElementById('statusDot');
const statusLabel     = document.getElementById('statusLabel');

const tempValue       = document.getElementById('tempValue');
const humValue        = document.getElementById('humValue');

// Cảm biến ánh sáng
const cardLdr         = document.getElementById('cardLdr');
const ldrValue        = document.getElementById('ldrValue');
const ldrIcon         = document.getElementById('ldrIcon');

// Điều khiển LED 1 (Ánh sáng)
const ledBulb         = document.getElementById('ledBulb');
const ledState        = document.getElementById('ledState');
const autoModeToggle  = document.getElementById('autoModeToggle');
const btnOn           = document.getElementById('btnOn');
const btnOff          = document.getElementById('btnOff');

// Điều khiển LED 2 (Điều hòa / Nhiệt độ)
const led2Bulb        = document.getElementById('led2Bulb');
const led2State       = document.getElementById('led2State');
const autoMode2Toggle = document.getElementById('autoMode2Toggle');
const btn2On          = document.getElementById('btn2On');
const btn2Off         = document.getElementById('btn2Off');

// Nhật ký & Biểu đồ
const systemLogs      = document.getElementById('systemLogs');
const btnClearLogs    = document.getElementById('btnClearLogs');

const publishLogText  = document.getElementById('publishLogText');
const lastUpdate      = document.getElementById('lastUpdate');

let historyChart = null;
let currentTemp = null;
let currentHum = null;
let tempWarningLogged = false;

// Trạng thái cũ để tránh ghi trùng log thiết bị
let lastLedStateText = "";
let lastLed2StateText = "";

// ─────────────────────────────────────────
// 3. CẬP NHẬT UI TRẠNG THÁI KẾT NỐI
// ─────────────────────────────────────────
function setConnected() {
  statusBadge.classList.add('connected');
  statusBadge.classList.remove('disconnected');
  statusLabel.textContent = 'Đã kết nối';
  
  btnOn.disabled  = false;
  btnOff.disabled = false;
  autoModeToggle.disabled = false;
  
  btn2On.disabled  = false;
  btn2Off.disabled = false;
  autoMode2Toggle.disabled = false;

  addLog('Đã kết nối thành công tới broker MQTT!', 'success');
}

function setDisconnected() {
  statusBadge.classList.remove('connected');
  statusBadge.classList.add('disconnected');
  statusLabel.textContent = 'Mất kết nối';
  
  btnOn.disabled  = true;
  btnOff.disabled = true;
  autoModeToggle.disabled = true;
  
  btn2On.disabled  = true;
  btn2Off.disabled = true;
  autoMode2Toggle.disabled = true;

  addLog('Đang ngắt kết nối / Mất tín hiệu mạng!', 'danger');
}

function setConnecting() {
  statusBadge.classList.remove('connected', 'disconnected');
  statusLabel.textContent = 'Đang kết nối…';
  
  btnOn.disabled  = true;
  btnOff.disabled = true;
  autoModeToggle.disabled = true;
  
  btn2On.disabled  = true;
  btn2Off.disabled = true;
  autoMode2Toggle.disabled = true;

  addLog('Đang thiết lập kết nối tới broker MQTT...', 'info');
}

// ─────────────────────────────────────────
// 4. CẬP NHẬT GIÁ TRỊ CẢM BIẾN (FLASH ANIMATION)
// ─────────────────────────────────────────
function updateSensorValue(el, newValue) {
  el.textContent = newValue;
  el.classList.remove('updated');
  void el.offsetWidth; // trigger reflow
  el.classList.add('updated');
}

// ─────────────────────────────────────────
// 4A. HÀM GHI NHẬT KÝ & ĐIỀU KHIỂN BIỂU ĐỒ
// ─────────────────────────────────────────
function addLog(msg, type = 'info') {
  if (!systemLogs) return;
  const time = new Date().toLocaleTimeString('vi-VN');
  
  // Tránh spam cùng một câu thông báo liên tục
  const lastLogItem = systemLogs.firstElementChild;
  if (lastLogItem) {
    const lastMsg = lastLogItem.querySelector('.log-msg').textContent;
    if (lastMsg === msg) return;
  }
  
  const logItem = document.createElement('div');
  logItem.className = `log-item log-item--${type}`;
  logItem.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-msg">${msg}</span>
  `;
  systemLogs.insertBefore(logItem, systemLogs.firstChild);
  
  while (systemLogs.children.length > 50) {
    systemLogs.removeChild(systemLogs.lastChild);
  }
}

function initChart() {
  const ctx = document.getElementById('historyChart');
  if (!ctx) return;
  
  historyChart = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Nhiệt độ (°C)',
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.05)',
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          data: [],
          tension: 0.3,
          fill: true,
          yAxisID: 'yTemp'
        },
        {
          label: 'Độ ẩm (%)',
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.05)',
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          data: [],
          tension: 0.3,
          fill: true,
          yAxisID: 'yHum'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        yTemp: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Nhiệt độ (°C)',
            color: '#ef4444',
            font: { weight: 'bold' }
          },
          min: 15,
          max: 45
        },
        yHum: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Độ ẩm (%)',
            color: '#0ea5e9',
            font: { weight: 'bold' }
          },
          min: 20,
          max: 100,
          grid: {
            drawOnChartArea: false
          }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: {
              family: "'Inter', sans-serif",
              weight: '600'
            }
          }
        }
      }
    }
  });
}

function addChartPoint(timeLabel, temp, hum) {
  if (!historyChart) return;
  if (temp === null || hum === null) return;
  
  const labels = historyChart.data.labels;
  const tempData = historyChart.data.datasets[0].data;
  const humData = historyChart.data.datasets[1].data;
  
  if (labels.length > 0 && labels[labels.length - 1] === timeLabel) {
    tempData[tempData.length - 1] = temp;
    humData[humData.length - 1] = hum;
  } else {
    labels.push(timeLabel);
    tempData.push(temp);
    humData.push(hum);
    
    if (labels.length > 15) {
      labels.shift();
      tempData.shift();
      humData.shift();
    }
  }
  historyChart.update('none');
}

// ─────────────────────────────────────────
// 5. CẬP NHẬT GIAO DIỆN ÁNH SÁNG LDR
// ─────────────────────────────────────────
const SUN_SVG = `<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
const MOON_SVG = `<path d="M12 3a9 9 0 1 0 9 9 9.75 9.75 0 0 0-9-9Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;

function updateLdrUI(state) {
  if (state === 'DARK') {
    ldrValue.textContent = 'Trời tối';
    cardLdr.classList.add('dark-mode');
    ldrIcon.innerHTML = MOON_SVG;
  } else {
    ldrValue.textContent = 'Trời sáng';
    cardLdr.classList.remove('dark-mode');
    ldrIcon.innerHTML = SUN_SVG;
  }
  
  // Flash animation
  ldrValue.classList.remove('updated');
  void ldrValue.offsetWidth;
  ldrValue.classList.add('updated');
}

// ─────────────────────────────────────────
// 6. CẬP NHẬT TRẠNG THÁI LED (PHẢN HỒI THỰC TẾ)
// ─────────────────────────────────────────
function updateLedUI(state) {
  if (state === 'ON') {
    ledBulb.classList.add('on');
    ledBulb.classList.remove('off');
    ledState.classList.add('on');
    ledState.classList.remove('off');
    ledState.textContent = '💡 Đèn ĐANG BẬT';
  } else {
    ledBulb.classList.add('off');
    ledBulb.classList.remove('on');
    ledState.classList.add('off');
    ledState.classList.remove('on');
    ledState.textContent = '🌑 Đèn ĐANG TẮT';
  }
}

function updateLed2UI(state) {
  if (state === 'ON') {
    led2Bulb.classList.add('on');
    led2Bulb.classList.remove('off');
    led2State.classList.add('on');
    led2State.classList.remove('off');
    led2State.textContent = '❄️ ĐANG BẬT';
  } else {
    led2Bulb.classList.add('off');
    led2Bulb.classList.remove('on');
    led2State.classList.add('off');
    led2State.classList.remove('on');
    led2State.textContent = '🌑 ĐANG TẮT';
  }
}

// ─────────────────────────────────────────
// 7. GỬI LỆNH ĐIỀU KHIỂN
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 7. GỬI LỆNH ĐIỀU KHIỂN
// ─────────────────────────────────────────
// Gửi lệnh điều khiển LED 1
function sendLed(command) {
  if (!client || !client.connected) {
    publishLogText.textContent = '⚠️ Chưa kết nối MQTT – không thể gửi lệnh!';
    addLog('Chưa kết nối MQTT – không thể gửi lệnh điều khiển Đèn 1!', 'warning');
    return;
  }

  client.publish(TOPIC_LED_CMD, command, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Gửi thất bại: ${err.message}`;
      addLog(`Gửi lệnh Đèn 1 thất bại: ${err.message}`, 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `✅ Đã gửi lệnh "${command}" → ${TOPIC_LED_CMD} [${time}]`;
      addLog(`Đã gửi lệnh "${command}" tới Đèn 1`, 'info');
    }
  });
}

// Gửi lệnh điều khiển LED 2 (Điều hòa)
function sendLed2(command) {
  if (!client || !client.connected) {
    publishLogText.textContent = '⚠️ Chưa kết nối MQTT – không thể gửi lệnh!';
    addLog('Chưa kết nối MQTT – không thể gửi lệnh điều khiển Đèn 2!', 'warning');
    return;
  }

  client.publish(TOPIC_LED2_CMD, command, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Gửi thất bại: ${err.message}`;
      addLog(`Gửi lệnh Đèn 2 thất bại: ${err.message}`, 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `✅ Đã gửi lệnh "${command}" → ${TOPIC_LED2_CMD} [${time}]`;
      addLog(`Đã gửi lệnh "${command}" tới Đèn 2 (Điều hòa)`, 'info');
    }
  });
}

// Gửi lệnh Chế độ Tự động LED 1
function sendAutoMode(state) {
  if (!client || !client.connected) return;
  
  const payload = state ? 'ON' : 'OFF';
  client.publish(TOPIC_AUTO_CMD, payload, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Cập nhật chế độ tự động thất bại!`;
      addLog('Cập nhật chế độ tự động Đèn 1 thất bại!', 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `⚙️ Đã chuyển Chế độ Tự động LED 1 thành "${payload}" [${time}]`;
      addLog(`Đã chuyển Chế độ Tự động Đèn 1 thành: ${payload}`, 'info');
    }
  });
}

// Gửi lệnh Chế độ Tự động LED 2 (Điều hòa)
function sendAutoMode2(state) {
  if (!client || !client.connected) return;
  
  const payload = state ? 'ON' : 'OFF';
  client.publish(TOPIC_AUTO2_CMD, payload, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Cập nhật tự động điều hòa thất bại!`;
      addLog('Cập nhật tự động Điều hòa thất bại!', 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `⚙️ Đã chuyển Tự động Điều hòa thành "${payload}" [${time}]`;
      addLog(`Đã chuyển Tự động Điều hòa thành: ${payload}`, 'info');
    }
  });
}

// Cập nhật thời gian nhận tin nhắn cuối
function updateTimestamp() {
  lastUpdate.textContent = new Date().toLocaleTimeString('vi-VN');
}

// ─────────────────────────────────────────
// 8. KHỞI TẠO MQTT CLIENT & BIỂU ĐỒ
// ─────────────────────────────────────────
initChart();
setConnecting();

const client = mqtt.connect(BROKER_URL, MQTT_OPTIONS);

// --- Kết nối thành công ---
client.on('connect', () => {
  console.log('[MQTT] Connected to', BROKER_URL);
  setConnected();

  // Đăng ký nhận toàn bộ các topic trạng thái của ESP8266
  const topicsToSubscribe = [
    TOPIC_TEMP,
    TOPIC_HUM,
    TOPIC_LDR,
    TOPIC_LED_STATE,
    TOPIC_AUTO_STATE,
    TOPIC_LED2_STATE,
    TOPIC_AUTO2_STATE
  ];

  client.subscribe(topicsToSubscribe, { qos: 0 }, (err) => {
    if (err) {
      console.error('[MQTT] Subscribe error:', err);
      addLog('Đăng ký nhận tin nhắn MQTT thất bại!', 'danger');
    } else {
      console.log('[MQTT] Subscribed to all state topics');
      addLog('Đăng ký thành công các chủ đề giám sát.', 'success');
    }
  });
});

// --- Nhận tin nhắn ---
client.on('message', (topic, message) => {
  const payload = message.toString().trim();
  console.log(`[MQTT] ${topic} → ${payload}`);

  switch (topic) {
    case TOPIC_TEMP:
      const temp = parseFloat(payload);
      if (!isNaN(temp)) {
        currentTemp = temp;
        updateSensorValue(tempValue, temp.toFixed(1));
        updateTimestamp();
        addChartPoint(new Date().toLocaleTimeString('vi-VN'), currentTemp, currentHum);
        
        // Log cảnh báo nhiệt độ cao (>33 độ C)
        if (temp > 33.0) {
          if (!tempWarningLogged) {
            addLog(`⚠️ CẢNH BÁO: Nhiệt độ vượt ngưỡng nguy hiểm (${temp.toFixed(1)}°C)!`, 'danger');
            tempWarningLogged = true;
          }
        } else if (temp < 30.0) {
          if (tempWarningLogged) {
            addLog(`Nhiệt độ đã hạ xuống mức an toàn (${temp.toFixed(1)}°C).`, 'success');
            tempWarningLogged = false;
          }
        }
      }
      break;

    case TOPIC_HUM:
      const hum = parseFloat(payload);
      if (!isNaN(hum)) {
        currentHum = hum;
        updateSensorValue(humValue, hum.toFixed(1));
        updateTimestamp();
        addChartPoint(new Date().toLocaleTimeString('vi-VN'), currentTemp, currentHum);
      }
      break;

    case TOPIC_LDR:
      updateLdrUI(payload);
      updateTimestamp();
      break;

    case TOPIC_LED_STATE:
      updateLedUI(payload);
      if (lastLedStateText !== payload) {
        addLog(`💡 Đèn Chiếu Sáng (LED 1) đã chuyển sang: ${payload === 'ON' ? 'BẬT' : 'TẮT'}`, 'info');
        lastLedStateText = payload;
      }
      break;

    case TOPIC_AUTO_STATE:
      // Đồng bộ checkbox tự động trên web với ESP8266
      const autoChecked = (payload === 'ON');
      if (autoModeToggle.checked !== autoChecked) {
        autoModeToggle.checked = autoChecked;
        addLog(`⚙️ Chế độ tự động Đèn 1 đã chuyển thành: ${payload}`, 'info');
      }
      break;

    case TOPIC_LED2_STATE:
      updateLed2UI(payload);
      if (lastLed2StateText !== payload) {
        addLog(`❄️ Đèn Điều Hòa (LED 2) đã chuyển sang: ${payload === 'ON' ? 'BẬT' : 'TẮT'}`, payload === 'ON' ? 'success' : 'info');
        lastLed2StateText = payload;
      }
      break;

    case TOPIC_AUTO2_STATE:
      // Đồng bộ checkbox tự động 2 trên web với ESP8266
      const auto2Checked = (payload === 'ON');
      if (autoMode2Toggle.checked !== auto2Checked) {
        autoMode2Toggle.checked = auto2Checked;
        addLog(`⚙️ Chế độ tự động Điều hòa đã chuyển thành: ${payload}`, 'info');
      }
      break;
  }
});

// --- Quản lý kết nối ---
client.on('offline', () => {
  console.warn('[MQTT] Offline');
  setDisconnected();
});

client.on('reconnect', () => {
  console.log('[MQTT] Reconnecting…');
  setConnecting();
});

client.on('error', (err) => {
  console.error('[MQTT] Error:', err);
  setDisconnected();
});

client.on('close', () => {
  console.log('[MQTT] Connection closed');
  setDisconnected();
});

// ─────────────────────────────────────────
// 9. GẮN SỰ KIỆN ĐIỀU KHIỂN TRÊN WEB
// ─────────────────────────────────────────
// Nút bấm Bật/Tắt LED 1
btnOn.addEventListener('click',  () => sendLed('ON'));
btnOff.addEventListener('click', () => sendLed('OFF'));

// Checkbox Tự động bật đèn 1 khi trời tối
autoModeToggle.addEventListener('change', (e) => {
  sendAutoMode(e.target.checked);
});

// Nút bấm Bật/Tắt LED 2
btn2On.addEventListener('click',  () => sendLed2('ON'));
btn2Off.addEventListener('click', () => sendLed2('OFF'));

// Checkbox Tự động bật đèn 2 khi nhiệt độ cao
autoMode2Toggle.addEventListener('change', (e) => {
  sendAutoMode2(e.target.checked);
});

// Nút xóa nhật ký
if (btnClearLogs) {
  btnClearLogs.addEventListener('click', () => {
    systemLogs.innerHTML = '';
    addLog('Nhật ký hệ thống đã được xóa sạch.', 'info');
  });
}
