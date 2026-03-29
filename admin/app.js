async function loadDevices() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    const res = await fetch("http://localhost:8000/api/v1/devices/", {
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

        if (device.feed_id.includes("temp") && device.value != null) {
            temp = device.value;
        }
    
        if (device.feed_id.includes("humi") && device.value != null) {
            humi = device.value;
        }

        const div = document.createElement('div');
        div.className = "device-card";
        div.setAttribute("data-id", device.id);

        div.innerHTML = `
            <h3>${device.name}</h3>
            <p>${device.feed_id}</p>

            ${device.value !== null ? `
                <p class="sensor-value">
                    ${device.name.includes("temp") ? "🌡" : "💧"}
                    ${device.value}
                    ${device.name.includes("temp") ? "°C" : "%"}
                </p>
            ` : ""}

            <p class="device-status ${device.status === "ON" ? "status-on" : "status-off"}">
                ${device.status}
            </p>

            <div class="device-actions">
                <button class="btn-toggle" onclick="toggleDevice('${device.id}', '${device.status}')">
                    ${device.status === "ON" ? "Tắt" : "Bật"}
                </button>

                <button class="btn-delete" onclick="deleteDevice(${device.id})">
                    Xoá
                </button>
            </div>
        `;

        container.appendChild(div);
    });

    const tempElement = document.getElementById("temp-val");
    const humiElement = document.getElementById("humi-val");

    if (tempElement && temp != null) {
        tempElement.innerText = temp + "°C";
    }

    if (humiElement && humi != null) {
        humiElement.innerText = humi + "%";
    }
}

async function toggleDevice(device_id) {
    const token = localStorage.getItem("token");

    try {
        //  lấy đúng card
        const card = document.querySelector(
            `.device-card[data-id="${device_id}"]`
        );

        if (!card) {
            console.error("Không tìm thấy device card");
            return;
        }

        //  lấy status từ UI
        const statusElement = card.querySelector(".device-status");

        if (!statusElement) {
            console.error("Không tìm thấy status element");
            return;
        }

        const currentStatus = statusElement.innerText.trim();

        //  xác định action
        const action = currentStatus === "ON" ? "off" : "on";

        //  gọi API
        const res = await fetch(`http://localhost:8000/api/v1/devices/${device_id}/toggle`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token
            },
            body: JSON.stringify({ action })
        });

        if (!res.ok) {
            console.error("Toggle thất bại");
            return;
        }

        const newStatus = currentStatus === "ON" ? "OFF" : "ON";
        statusElement.innerText = newStatus;

        statusElement.classList.remove("status-on", "status-off");
        statusElement.classList.add(newStatus === "ON" ? "status-on" : "status-off");

        const btn = card.querySelector(".btn-toggle");
        if (btn) {
            btn.innerText = newStatus === "ON" ? "Tắt" : "Bật";
        }

    } catch (err) {
        console.error("Lỗi toggle:", err);
    }
    loadDevices();
}
function showAddDeviceForm() {
    const form = document.getElementById("add-device-form");
    form.style.display = form.style.display === "none" ? "block" : "none";
}

async function addDevice() {
    const token = localStorage.getItem("token");

    const nameInput = document.getElementById("device-name");
    const feedInput = document.getElementById("device-feed");
    const typeInput = document.getElementById("device-type");

    // check null 
    if (!nameInput || !feedInput || !typeInput) {
        alert("Không tìm thấy input (sai id)");
        return;
    }

    const name = nameInput.value;
    const feed_id = feedInput.value;
    const type = typeInput.value;

    if (!name || !feed_id) {
        alert("Nhập đầy đủ!");
        return;
    }

    await fetch("http://localhost:8000/api/v1/devices/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token
        },
        body: JSON.stringify({
            name,
            feed_id,
            zone_id: 1,
            type
        })
    });

    loadDevices();
}
async function deleteDevice(device_id) {
    const token = localStorage.getItem("token");

    const confirmDelete = confirm("Bạn có chắc muốn xoá thiết bị này?");
    if (!confirmDelete) return;

    const res = await fetch(`http://localhost:8000/api/v1/devices/${device_id}/`, {
        method: "DELETE",
        headers: {
            Authorization: "Bearer " + token
        }
    });

    if (res.ok) {
        alert("Xoá thành công!");
        loadDevices(); // reload lại danh sách
    } else {
        alert("Xoá thất bại!");
        console.log(await res.text());
    }
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
// 3. MODULE 2: KIỂM TRA NGƯỠNG & CẢNH BÁO
// ==========================================
function checkThresholds(currentTemp) {
    const tempCard = document.querySelector('.sensor-card.temperature');

    if (!tempCard) return; 

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
setInterval(loadDevices, 3000);