async function loadDevices() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    const res = await fetch("http://localhost:8000/api/v1/devices", {
        headers: {
            Authorization: "Bearer " + token
        }
    });

    const devices = await res.json();
    console.log(devices);

    const container = document.querySelector('.device-grid');

    if (!container) return;

    container.innerHTML = ""; // clear cũ

    devices.forEach(device => {
        const div = document.createElement('div');
        div.className = "device-card";

        div.innerHTML = `
            <h3>${device.name}</h3>
            <p>${device.feed_id}</p>
            <button onclick="toggleDevice('${device.id}')">Toggle</button>
        `;

        container.appendChild(div);
    });
}

async function toggleDevice(device_id, currentStatus) {
    const token = localStorage.getItem("token");

    const action = currentStatus === "ON" ? "off" : "on";

    await fetch(`http://localhost:8000/api/v1/devices/${device_id}/toggle`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
        },
        body: JSON.stringify({ action })
    });
}
// ==========================================
// 1. XỬ LÝ ĐIỀU HƯỚNG SIDEBAR (Chuyển trang)
// ==========================================
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.page');
const pageTitle = document.getElementById('page-title');

navItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Xóa trạng thái cũ
        navItems.forEach(nav => nav.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));

        // Kích hoạt trang mới
        this.classList.add('active');
        const targetId = "page-" + this.getAttribute('href').substring(1);
        document.getElementById(targetId).classList.add('active');
        
        // Cập nhật tiêu đề trên Header
        pageTitle.innerText = this.innerText.trim();
    });
});

// ==========================================
// 2. MODULE 1: CẬP NHẬT THỜI GIAN THỰC (Real-time)
// ==========================================
function updateRealtimeData() {
    // Giả lập lấy dữ liệu từ Redis/Adafruit IO
    const mockTemp = (24 + Math.random() * 2).toFixed(1);
    const mockHumi = (60 + Math.random() * 5).toFixed(0);

    const tempElement = document.getElementById('temp-val');
    const humiElement = document.getElementById('humi-val');

    if(tempElement) tempElement.innerText = mockTemp + "°C";
    if(humiElement) humiElement.innerText = mockHumi + "%";

    // Kiểm tra ngưỡng (Module 2)
    checkThresholds(mockTemp);
}
// Chạy cập nhật mỗi 3 giây
setInterval(updateRealtimeData, 3000);

// ==========================================
// 3. MODULE 2: KIỂM TRA NGƯỠNG & CẢNH BÁO
// ==========================================
function checkThresholds(currentTemp) {
    const tempCard = document.querySelector('.sensor-card.temperature');

    if (!tempCard) return; // 🔥 FIX crash

    const limit = 25.5;

    if (currentTemp > limit) {
        tempCard.classList.add('warning');
    } else {
        tempCard.classList.remove('warning');
    }
}

// ==========================================
// 4. MODULE 5: VẼ BIỂU ĐỒ (Dùng Chart.js)
// ==========================================
function initChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['10h', '11h', '12h', '13h', '14h'],
            datasets: [{
                label: 'Nhiệt độ phòng khách',
                data: [22, 23, 25, 27, 26],
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                fill: true
            }]
        }
    });
}
// Khởi tạo biểu đồ khi trang load xong
window.onload = () => {
    initChart();
    loadDevices();
};