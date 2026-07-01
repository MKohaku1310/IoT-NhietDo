/**
 * app.js – IoT Dashboard MQTT Client
 * Kết nối MQTT qua WebSocket, nhận dữ liệu cảm biến (Nhiệt độ, độ ẩm, Lux)
 * và điều khiển 3 LED (Tự động/Thủ công).
 */

// ─────────────────────────────────────────
// 1. CẤU HÌNH MQTT
// ─────────────────────────────────────────
const BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';

const MQTT_OPTIONS = {
  clientId: 'iot_dashboard_' + Math.random().toString(16).slice(2, 10),
  clean: true,
  reconnectPeriod: 3000,   // Tự động kết nối lại sau 3 giây
  connectTimeout: 8000,
};

// Các Topic giao tiếp MQTT
const TOPIC_TEMP        = 'esp32/temp';
const TOPIC_HUM         = 'esp32/hum';
const TOPIC_LUX         = 'esp32/lux';             // Nhận cường độ ánh sáng (lx) từ BH1750
const TOPIC_LED_CMD     = 'esp32/led';             // Gửi lệnh điều khiển LED 1 (ON / OFF)
const TOPIC_LED_STATE   = 'esp32/led/state';       // Nhận phản hồi trạng thái LED 1 thực tế (ON / OFF)
const TOPIC_AUTO_CMD    = 'esp32/automode';        // Gửi lệnh chế độ tự động LED 1 (ON / OFF)
const TOPIC_AUTO_STATE  = 'esp32/automode/state';  // Nhận phản hồi chế độ tự động LED 1 thực tế (ON / OFF)
const TOPIC_LED2_CMD    = 'esp32/led2';            // Gửi lệnh điều khiển LED 2 (ON / OFF)
const TOPIC_LED2_STATE  = 'esp32/led2/state';      // Nhận phản hồi trạng thái LED 2 thực tế (ON / OFF)
const TOPIC_AUTO2_CMD   = 'esp32/automode2';       // Gửi lệnh chế độ tự động LED 2 (ON / OFF)
const TOPIC_AUTO2_STATE = 'esp32/automode2/state'; // Nhận phản hồi chế độ tự động LED 2 thực tế (ON / OFF)
const TOPIC_LED3_CMD    = 'esp32/led3';            // Gửi lệnh điều khiển LED 3 (ON / OFF)
const TOPIC_LED3_STATE  = 'esp32/led3/state';      // Nhận phản hồi trạng thái LED 3 thực tế (ON / OFF)
const TOPIC_AUTO3_CMD   = 'esp32/automode3';       // Gửi lệnh chế độ tự động LED 3 (ON / OFF)
const TOPIC_AUTO3_STATE = 'esp32/automode3/state'; // Nhận phản hồi chế độ tự động LED 3 thực tế (ON / OFF)

// ─────────────────────────────────────────
// 2. LẤY CÁC PHẦN TỬ DOM
// ─────────────────────────────────────────
const statusBadge     = document.getElementById('statusBadge');
const statusDot       = document.getElementById('statusDot');
const statusLabel     = document.getElementById('statusLabel');

const tempValue       = document.getElementById('tempValue');
const humValue        = document.getElementById('humValue');

// Cảm biến ánh sáng BH1750
const cardLdr         = document.getElementById('cardLdr');
const ldrValue        = document.getElementById('ldrValue');
const ldrIcon         = document.getElementById('ldrIcon');

// Ambient Background (Hiệu ứng thời tiết nền)
const ambientBg       = document.getElementById('ambient-bg');

// Điều khiển LED 1 (Ánh sáng)
const ledBulb         = document.getElementById('ledBulb');
const ledState        = document.getElementById('ledState');
const btnModeAuto1    = document.getElementById('btnModeAuto1');
const btnModeManual1  = document.getElementById('btnModeManual1');
const btnOn           = document.getElementById('btnOn');
const btnOff          = document.getElementById('btnOff');

// Điều khiển LED 2 (Điều hòa / Nhiệt độ)
const led2Bulb        = document.getElementById('led2Bulb');
const led2State       = document.getElementById('led2State');
const btnModeAuto2    = document.getElementById('btnModeAuto2');
const btnModeManual2  = document.getElementById('btnModeManual2');
const btn2On          = document.getElementById('btn2On');
const btn2Off         = document.getElementById('btn2Off');

// Điều khiển LED 3 (Quạt Thông Gió / Độ ẩm)
const led3Bulb        = document.getElementById('led3Bulb');
const led3State       = document.getElementById('led3State');
const btnModeAuto3    = document.getElementById('btnModeAuto3');
const btnModeManual3  = document.getElementById('btnModeManual3');
const btn3On          = document.getElementById('btn3On');
const btn3Off         = document.getElementById('btn3Off');

// Nhật ký & Biểu đồ
const systemLogs      = document.getElementById('systemLogs');
const btnClearLogs    = document.getElementById('btnClearLogs');

const publishLogText  = document.getElementById('publishLogText');
const lastUpdate      = document.getElementById('lastUpdate');

let tempChart = null;
let humChart = null;
let currentTemp = null;
let currentHum = null;
let tempWarningLogged = false;

// Trạng thái cũ để tránh ghi trùng log thiết bị
let lastLedStateText = "";
let lastLed2StateText = "";
let lastLed3StateText = "";

// ─────────────────────────────────────────
// 3. CẬP NHẬT UI TRẠNG THÁI KẾT NỐI & CHẾ ĐỘ
// ─────────────────────────────────────────
function updateModeUI(deviceNum, mode) {
  if (deviceNum === 1) {
    if (mode === 'auto') {
      btnModeAuto1.classList.add('active');
      btnModeManual1.classList.remove('active');
      btnOn.disabled = true;
      btnOff.disabled = true;
      btnOn.classList.add('btn-locked');
      btnOff.classList.add('btn-locked');
    } else {
      btnModeAuto1.classList.remove('active');
      btnModeManual1.classList.add('active');
      if (statusBadge.classList.contains('connected')) {
        btnOn.disabled = false;
        btnOff.disabled = false;
      }
      btnOn.classList.remove('btn-locked');
      btnOff.classList.remove('btn-locked');
    }
  } else if (deviceNum === 2) {
    if (mode === 'auto') {
      btnModeAuto2.classList.add('active');
      btnModeManual2.classList.remove('active');
      btn2On.disabled = true;
      btn2Off.disabled = true;
      btn2On.classList.add('btn-locked');
      btn2Off.classList.add('btn-locked');
    } else {
      btnModeAuto2.classList.remove('active');
      btnModeManual2.classList.add('active');
      if (statusBadge.classList.contains('connected')) {
        btn2On.disabled = false;
        btn2Off.disabled = false;
      }
      btn2On.classList.remove('btn-locked');
      btn2Off.classList.remove('btn-locked');
    }
  } else if (deviceNum === 3) {
    if (mode === 'auto') {
      btnModeAuto3.classList.add('active');
      btnModeManual3.classList.remove('active');
      btn3On.disabled = true;
      btn3Off.disabled = true;
      btn3On.classList.add('btn-locked');
      btn3Off.classList.add('btn-locked');
    } else {
      btnModeAuto3.classList.remove('active');
      btnModeManual3.classList.add('active');
      if (statusBadge.classList.contains('connected')) {
        btn3On.disabled = false;
        btn3Off.disabled = false;
      }
      btn3On.classList.remove('btn-locked');
      btn3Off.classList.remove('btn-locked');
    }
  }
}

function setConnected() {
  statusBadge.classList.add('connected');
  statusBadge.classList.remove('disconnected');
  statusLabel.textContent = 'Đã kết nối';
  
  btnModeAuto1.disabled = false;
  btnModeManual1.disabled = false;
  btnModeAuto2.disabled = false;
  btnModeManual2.disabled = false;
  btnModeAuto3.disabled = false;
  btnModeManual3.disabled = false;

  // Khôi phục trạng thái nút bấm thủ công theo chế độ hiện tại
  const isAuto1 = btnModeAuto1.classList.contains('active');
  btnOn.disabled  = isAuto1;
  btnOff.disabled = isAuto1;
  
  const isAuto2 = btnModeAuto2.classList.contains('active');
  btn2On.disabled  = isAuto2;
  btn2Off.disabled = isAuto2;

  const isAuto3 = btnModeAuto3.classList.contains('active');
  btn3On.disabled  = isAuto3;
  btn3Off.disabled = isAuto3;

  addLog('Đã kết nối thành công tới broker MQTT!', 'success');
}

function setDisconnected() {
  statusBadge.classList.remove('connected');
  statusBadge.classList.add('disconnected');
  statusLabel.textContent = 'Mất kết nối';
  
  btnOn.disabled  = true;
  btnOff.disabled = true;
  btnModeAuto1.disabled = true;
  btnModeManual1.disabled = true;
  
  btn2On.disabled  = true;
  btn2Off.disabled = true;
  btnModeAuto2.disabled = true;
  btnModeManual2.disabled = true;

  btn3On.disabled  = true;
  btn3Off.disabled = true;
  btnModeAuto3.disabled = true;
  btnModeManual3.disabled = true;

  addLog('Đang ngắt kết nối / Mất tín hiệu mạng!', 'danger');
}

function setConnecting() {
  statusBadge.classList.remove('connected', 'disconnected');
  statusLabel.textContent = 'Đang kết nối…';
  
  btnOn.disabled  = true;
  btnOff.disabled = true;
  btnModeAuto1.disabled = true;
  btnModeManual1.disabled = true;
  
  btn2On.disabled  = true;
  btn2Off.disabled = true;
  btnModeAuto2.disabled = true;
  btnModeManual2.disabled = true;

  btn3On.disabled  = true;
  btn3Off.disabled = true;
  btnModeAuto3.disabled = true;
  btnModeManual3.disabled = true;

  addLog('Đang thiết lập kết nối tới broker MQTT...', 'info');
}

// ─────────────────────────────────────────
// 4. CẬP NHẬT GIÁ TRỊ CẢM BIẾN (HIỆU ỨNG NHẤP NHÁY)
// ─────────────────────────────────────────
function updateSensorValue(el, newValue) {
  el.textContent = newValue;
  el.classList.remove('updated');
  void el.offsetWidth; // Trigger reflow để kích hoạt lại animation
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
  const tempCtx = document.getElementById('tempChart');
  const humCtx = document.getElementById('humChart');
  if (!tempCtx || !humCtx) return;
  
  // Biểu đồ Nhiệt độ
  tempChart = new Chart(tempCtx.getContext('2d'), {
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
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          beginAtZero: false,
          title: {
            display: true,
            text: 'Nhiệt độ (°C)',
            color: '#ef4444',
            font: { weight: 'bold' }
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

  // Biểu đồ Độ ẩm
  humChart = new Chart(humCtx.getContext('2d'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Độ ẩm (%)',
          borderColor: '#0ea5e9',
          backgroundColor: 'rgba(14, 165, 233, 0.05)',
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 5,
          data: [],
          tension: 0.3,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          beginAtZero: false,
          title: {
            display: true,
            text: 'Độ ẩm (%)',
            color: '#0ea5e9',
            font: { weight: 'bold' }
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
  if (!tempChart || !humChart) return;
  
  // Cập nhật biểu đồ nhiệt độ
  if (temp !== null) {
    const tempLabels = tempChart.data.labels;
    const tempDataset = tempChart.data.datasets[0].data;
    
    if (tempLabels.length > 0 && tempLabels[tempLabels.length - 1] === timeLabel) {
      tempDataset[tempDataset.length - 1] = temp;
    } else {
      tempLabels.push(timeLabel);
      tempDataset.push(temp);
      if (tempLabels.length > 15) {
        tempLabels.shift();
        tempDataset.shift();
      }
    }
    tempChart.update('none');
  }
  
  // Cập nhật biểu đồ độ ẩm
  if (hum !== null) {
    const humLabels = humChart.data.labels;
    const humDataset = humChart.data.datasets[0].data;
    
    if (humLabels.length > 0 && humLabels[humLabels.length - 1] === timeLabel) {
      humDataset[humDataset.length - 1] = hum;
    } else {
      humLabels.push(timeLabel);
      humDataset.push(hum);
      if (humLabels.length > 15) {
        humLabels.shift();
        humDataset.shift();
      }
    }
    humChart.update('none');
  }
}

// ─────────────────────────────────────────
// 5. CẬP NHẬT GIAO DIỆN ÁNH SÁNG LUX
// ─────────────────────────────────────────
const SUN_SVG = `<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
const MOON_SVG = `<path d="M12 3a9 9 0 1 0 9 9 9.75 9.75 0 0 0-9-9Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;

function updateLdrUI(lux) {
  updateSensorValue(ldrValue, lux.toFixed(1));
  
  // Cập nhật chủ đề Sáng/Tối cho card dựa trên ngưỡng 50 lx
  if (lux < 50.0) {
    cardLdr.classList.add('dark-mode');
    ldrIcon.innerHTML = MOON_SVG;
  } else {
    cardLdr.classList.remove('dark-mode');
    ldrIcon.innerHTML = SUN_SVG;
  }
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
    ledState.textContent = '💡 ĐANG BẬT';
  } else {
    ledBulb.classList.add('off');
    ledBulb.classList.remove('on');
    ledState.classList.add('off');
    ledState.classList.remove('on');
    ledState.textContent = '🌑 ĐANG TẮT';
  }
}

// Hiệu ứng hạt tuyết rơi (Đèn điều hòa bật)
let snowInterval = null;

function startSnowing() {
  if (snowInterval) return;
  if (!ambientBg) return;
  ambientBg.classList.add('snowing');
  snowInterval = setInterval(() => {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    const flakes = ['❄', '❅', '❆', '•'];
    snowflake.textContent = flakes[Math.floor(Math.random() * flakes.length)];
    
    const startX = Math.random() * 100;
    const size = Math.random() * 0.8 + 0.6;
    const duration = Math.random() * 5 + 5;
    const opacity = Math.random() * 0.7 + 0.3;
    
    snowflake.style.left = `${startX}vw`;
    snowflake.style.fontSize = `${size}rem`;
    snowflake.style.animationDuration = `${duration}s`;
    snowflake.style.opacity = opacity;
    
    ambientBg.appendChild(snowflake);
    
    setTimeout(() => {
      snowflake.remove();
    }, duration * 1000);
  }, 250);
}

function stopSnowing() {
  if (!snowInterval) return;
  clearInterval(snowInterval);
  snowInterval = null;
  if (ambientBg) {
    ambientBg.classList.remove('snowing');
    const snowflakes = ambientBg.querySelectorAll('.snowflake');
    snowflakes.forEach(s => s.remove());
  }
}

function updateLed2UI(state) {
  if (state === 'ON') {
    led2Bulb.classList.add('on');
    led2Bulb.classList.remove('off');
    led2State.classList.add('on');
    led2State.classList.remove('off');
    led2State.textContent = '❄️ ĐANG BẬT';
    startSnowing();
  } else {
    led2Bulb.classList.add('off');
    led2Bulb.classList.remove('on');
    led2State.classList.add('off');
    led2State.classList.remove('on');
    led2State.textContent = '🌑 ĐANG TẮT';
    stopSnowing();
  }
}

function updateLed3UI(state) {
  if (state === 'ON') {
    led3Bulb.classList.add('on');
    led3Bulb.classList.remove('off');
    led3State.classList.add('on');
    led3State.classList.remove('off');
    led3State.textContent = '🌀 ĐANG BẬT';
  } else {
    led3Bulb.classList.add('off');
    led3Bulb.classList.remove('on');
    led3State.classList.add('off');
    led3State.classList.remove('on');
    led3State.textContent = '🌑 ĐANG TẮT';
  }
}

// ─────────────────────────────────────────
// 7. GỬI LỆNH ĐIỀU KHIỂN ĐẾN BROKER MQTT
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

// Gửi lệnh điều khiển LED 3 (Quạt thông gió)
function sendLed3(command) {
  if (!client || !client.connected) {
    publishLogText.textContent = '⚠️ Chưa kết nối MQTT – không thể gửi lệnh!';
    addLog('Chưa kết nối MQTT – không thể gửi lệnh điều khiển Đèn 3!', 'warning');
    return;
  }

  client.publish(TOPIC_LED3_CMD, command, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Gửi thất bại: ${err.message}`;
      addLog(`Gửi lệnh Đèn 3 thất bại: ${err.message}`, 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `✅ Đã gửi lệnh "${command}" → ${TOPIC_LED3_CMD} [${time}]`;
      addLog(`Đã gửi lệnh "${command}" tới Đèn 3 (Quạt thông gió)`, 'info');
    }
  });
}

// Gửi lệnh bật/tắt Chế độ tự động LED 1
function sendAutoMode(state) {
  if (!client || !client.connected) return;
  
  const payload = state ? 'ON' : 'OFF';
  client.publish(TOPIC_AUTO_CMD, payload, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Cập nhật tự động LED 1 thất bại!`;
      addLog('Cập nhật chế độ tự động Đèn 1 thất bại!', 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `⚙️ Đã chuyển Chế độ Tự động LED 1 thành "${payload}" [${time}]`;
      addLog(`Đã chuyển Chế độ Tự động Đèn 1 thành: ${payload}`, 'info');
    }
  });
}

// Gửi lệnh bật/tắt Chế độ tự động LED 2 (Điều hòa)
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

// Gửi lệnh bật/tắt Chế độ tự động LED 3 (Quạt Thông Gió)
function sendAutoMode3(state) {
  if (!client || !client.connected) return;
  
  const payload = state ? 'ON' : 'OFF';
  client.publish(TOPIC_AUTO3_CMD, payload, { qos: 1 }, (err) => {
    if (err) {
      publishLogText.textContent = `❌ Cập nhật tự động Quạt thông gió thất bại!`;
      addLog('Cập nhật tự động Quạt thông gió thất bại!', 'danger');
    } else {
      const time = new Date().toLocaleTimeString('vi-VN');
      publishLogText.textContent = `⚙️ Đã chuyển Tự động Quạt thông gió thành "${payload}" [${time}]`;
      addLog('Đã chuyển Tự động Quạt thông gió thành: ' + payload, 'info');
    }
  });
}

// Cập nhật nhãn thời gian cập nhật lần cuối
function updateTimestamp() {
  lastUpdate.textContent = new Date().toLocaleTimeString('vi-VN');
}

// ─────────────────────────────────────────
// 8. KHỞI TẠO MQTT CLIENT & BIỂU ĐỒ LỊCH SỬ
// ─────────────────────────────────────────
initChart();
setConnecting();

const client = mqtt.connect(BROKER_URL, MQTT_OPTIONS);

// --- Sự kiện: Kết nối thành công ---
client.on('connect', () => {
  console.log('[MQTT] Connected to', BROKER_URL);
  setConnected();

  // Đăng ký nhận toàn bộ các topic trạng thái của hệ thống
  const topicsToSubscribe = [
    TOPIC_TEMP,
    TOPIC_HUM,
    TOPIC_LUX,
    TOPIC_LED_STATE,
    TOPIC_AUTO_STATE,
    TOPIC_LED2_STATE,
    TOPIC_AUTO2_STATE,
    TOPIC_LED3_STATE,
    TOPIC_AUTO3_STATE
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

// --- Sự kiện: Nhận tin nhắn ---
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
        
        // Hiệu ứng nền màu đỏ nhạt khi nhiệt độ quá cao
        if (ambientBg) {
          if (temp >= 33.0) {
            ambientBg.classList.add('high-temp');
          } else {
            ambientBg.classList.remove('high-temp');
          }
        }
        
        // Ghi nhật ký cảnh báo nhiệt độ cao (>33 độ C)
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

    case TOPIC_LUX:
      const lux = parseFloat(payload);
      if (!isNaN(lux)) {
        updateLdrUI(lux);
        updateTimestamp();
      }
      break;

    case TOPIC_LED_STATE:
      updateLedUI(payload);
      if (lastLedStateText !== payload) {
        addLog(`💡 Đèn Chiếu Sáng (LED 1) đã chuyển sang: ${payload === 'ON' ? 'BẬT' : 'TẮT'}`, 'info');
        lastLedStateText = payload;
      }
      break;

    case TOPIC_AUTO_STATE:
      updateModeUI(1, payload === 'ON' ? 'auto' : 'manual');
      break;

    case TOPIC_LED2_STATE:
      updateLed2UI(payload);
      if (lastLed2StateText !== payload) {
        addLog(`❄️ Đèn Điều Hòa (LED 2) đã chuyển sang: ${payload === 'ON' ? 'BẬT' : 'TẮT'}`, payload === 'ON' ? 'success' : 'info');
        lastLed2StateText = payload;
      }
      break;

    case TOPIC_AUTO2_STATE:
      updateModeUI(2, payload === 'ON' ? 'auto' : 'manual');
      break;

    case TOPIC_LED3_STATE:
      updateLed3UI(payload);
      if (lastLed3StateText !== payload) {
        addLog(`🌀 Quạt Thông Gió (LED 3) đã chuyển sang: ${payload === 'ON' ? 'BẬT' : 'TẮT'}`, payload === 'ON' ? 'success' : 'info');
        lastLed3StateText = payload;
      }
      break;

    case TOPIC_AUTO3_STATE:
      updateModeUI(3, payload === 'ON' ? 'auto' : 'manual');
      break;
  }
});

// --- Quản lý các trạng thái lỗi và mất kết nối ---
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

// Sự kiện nút bấm Bật/Tắt thủ công LED 1
btnOn.addEventListener('click',  () => sendLed('ON'));
btnOff.addEventListener('click', () => sendLed('OFF'));

// Sự kiện đổi chế độ tự động/thủ công LED 1
btnModeAuto1.addEventListener('click', () => {
  sendAutoMode(true);
  updateModeUI(1, 'auto');
});
btnModeManual1.addEventListener('click', () => {
  sendAutoMode(false);
  updateModeUI(1, 'manual');
});

// Sự kiện nút bấm Bật/Tắt thủ công LED 2
btn2On.addEventListener('click',  () => sendLed2('ON'));
btn2Off.addEventListener('click', () => sendLed2('OFF'));

// Sự kiện đổi chế độ tự động/thủ công LED 2
btnModeAuto2.addEventListener('click', () => {
  sendAutoMode2(true);
  updateModeUI(2, 'auto');
});
btnModeManual2.addEventListener('click', () => {
  sendAutoMode2(false);
  updateModeUI(2, 'manual');
});

// Sự kiện nút bấm Bật/Tắt thủ công LED 3
btn3On.addEventListener('click',  () => sendLed3('ON'));
btn3Off.addEventListener('click', () => sendLed3('OFF'));

// Sự kiện đổi chế độ tự động/thủ công LED 3
btnModeAuto3.addEventListener('click', () => {
  sendAutoMode3(true);
  updateModeUI(3, 'auto');
});
btnModeManual3.addEventListener('click', () => {
  sendAutoMode3(false);
  updateModeUI(3, 'manual');
});

// Nút xóa nhật ký hoạt động
if (btnClearLogs) {
  btnClearLogs.addEventListener('click', () => {
    systemLogs.innerHTML = '';
    addLog('Nhật ký hệ thống đã được xóa sạch.', 'info');
  });
}
