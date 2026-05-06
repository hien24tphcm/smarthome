// ============================================================
// SmartHome Admin
// ============================================================
const API = "https://iot-smart-home-backend-production.up.railway.app/api/v1";
const POLL_INTERVAL_MS = 7000; // tự cập nhật sensor mỗi 7s

// ============================================================
// AUTH & PERMISSIONS
// ============================================================
function getToken() {
    return localStorage.getItem("access_token");
}

function getRole() {
    return localStorage.getItem("role") || "";
}

/**
 * Nếu không có token hoặc role !== 'admin' →  về login
 */
function checkAuth() {
    const token = getToken();
    const role  = getRole();
    if (!token || role !== "admin") {
        localStorage.removeItem("access_token");
        localStorage.removeItem("role");
        window.location.href = "/auth/login.html";
        return false;
    }
    return true;
}

/**
 * applyPermissions(role): Ẩn/hiện phần tử theo role (dự phòng)
 * - Nếu role không phải admin → ẩn nút cấu hình, thêm thiết bị, xóa, ...
 */
function applyPermissions(role) {
    const adminOnlyEls = document.querySelectorAll('[data-admin-only]');
    const isAdmin = role === "admin";

    adminOnlyEls.forEach(el => {
        el.style.display = isAdmin ? "" : "none";
    });

    // Ẩn các nav item admin-only nếu cần
    if (!isAdmin) {
        document.querySelectorAll('.btn-trash').forEach(btn => {
            btn.style.display = "none";
        });
    }
}

function authHeaders(extra = {}) {
    return {
        "Authorization": "Bearer " + getToken(),
        ...extra
    };
}

/** Toast notification (success | error | info) */
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return alert(message);

    const icons = {
        success: "fa-circle-check",
        error:   "fa-circle-exclamation",
        info:    "fa-circle-info"
    };
    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
    container.appendChild(div);
    setTimeout(() => {
        div.style.transition = "opacity 0.3s, transform 0.3s";
        div.style.opacity = "0";
        div.style.transform = "translateX(120%)";
        setTimeout(() => div.remove(), 300);
    }, 3200);
}

/**  icon + đơn vị  */
function detectSensorMeta(device) {
    const key = (device.name + " " + device.feed_id).toLowerCase();

    if (/(temp|nhiệt|nhiet)/.test(key))
        return { icon: "fa-temperature-half", unit: "°C", label: "Nhiệt độ" };
    if (/(humi|moist|độ ẩm|do am)/.test(key))
        return { icon: "fa-droplet", unit: "%", label: "Độ ẩm" };
    if (/(light|lux|bright|ánh sáng|anh sang)/.test(key))
        return { icon: "fa-sun", unit: "lux", label: "Ánh sáng" };
    if (/(gas|smoke|khí|khi)/.test(key))
        return { icon: "fa-smog", unit: "ppm", label: "Khí gas" };
    if (/(motion|pir|chuyển động|chuyen dong)/.test(key))
        return { icon: "fa-person-walking", unit: "", label: "Chuyển động" };
    if (/(sound|noise|âm thanh|am thanh)/.test(key))
        return { icon: "fa-volume-high", unit: "dB", label: "Âm thanh" };
    return { icon: "fa-microchip", unit: "", label: "Cảm biến" };
}

/* icon  */
function detectControllerIcon(device) {
    const key = (device.name + " " + device.feed_id).toLowerCase();
    if (/(light|lamp|led|bulb|đèn|den)/.test(key))    return "fa-lightbulb";
    if (/(fan|quạt|quat)/.test(key))                  return "fa-fan";
    if (/(pump|bơm|bom)/.test(key))                   return "fa-faucet-drip";
    if (/(ac|air|điều hoà|dieu hoa|máy lạnh)/.test(key)) return "fa-snowflake";
    if (/(door|cửa|cua|lock|khoá|khoa)/.test(key))    return "fa-door-closed";
    if (/(curtain|rèm|rem)/.test(key))                return "fa-table-cells";
    return "fa-plug";
}

/** Kiểm tra thiết bị có phải quạt không */
function isFanDevice(device) {
    const key = (device.name + " " + device.feed_id).toLowerCase();
    return /(fan|quạt|quat)/.test(key);
}

/** Xác định mức tốc độ từ giá trị speed (0-100) */
function getSpeedLevel(speed) {
    const val = Number(speed) || 0;
    if (val <= 0)  return 0;  // tắt
    if (val <= 40) return 1;  // nhỏ
    if (val <= 70) return 2;  // vừa
    return 3;                 // lớn
}

// ============================================================
// FAN MODE CONTROL
// ============================================================

// Lưu tạm mode theo device_id vì API /devices/ hiện chưa chắc trả mode
let fanModeMap = JSON.parse(localStorage.getItem("fanModeMap") || "{}");

function getFanMode(device) {
    return (device.mode || fanModeMap[device.id] || "manual").toLowerCase();
}

function saveFanMode(deviceId, mode) {
    fanModeMap[deviceId] = mode;
    localStorage.setItem("fanModeMap", JSON.stringify(fanModeMap));
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================================
// LOAD DEVICES (READ)
// ============================================================
async function loadDevices() {
    const sensorGrid = document.getElementById("sensor-grid");
    const controllerGrid = document.getElementById("controller-grid");
    if (!sensorGrid || !controllerGrid) return;

    try {
        const res = await fetch(`${API}/devices/`, {
            method: "GET",
            headers: authHeaders()
        });

        if (res.status === 401 || res.status === 403) {
            showToast("Phiên đăng nhập đã hết hạn", "error");
            localStorage.removeItem("access_token");
            localStorage.removeItem("role");
            window.location.href = "/auth/login.html";
            return;
        }

        if (!res.ok) {
            // 404 = nhà chưa có thiết bị → coi như danh sách rỗng, không phải lỗi
            if (res.status === 404) {
                renderSensors([]);
                renderControllers([]);
                return;
            }
            console.error("API ERROR:", res.status);
            showToast("Không tải được danh sách thiết bị", "error");
            return;
        }

        const devices = await res.json();
        allDevicesCache = devices;

        // Lọc theo tầng nếu đang filter
        let filtered = devices;
        if (currentFloorFilter !== "all") {
            const floorNum = Number(currentFloorFilter);
            const zoneIdsOnFloor = allZonesCache
                .filter(z => z.floor === floorNum)
                .map(z => z.id);
            filtered = devices.filter(d => zoneIdsOnFloor.includes(d.zone_id));
        }

        const sensors     = filtered.filter(d => (d.type || "").toLowerCase() === "sensor");
        const controllers = filtered.filter(d => (d.type || "").toLowerCase() === "controller");

        renderSensors(sensors);
        renderControllers(controllers);

        // Cập nhật giờ
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        const tEl = document.getElementById("last-update");
        if (tEl) tEl.innerText = `${hh}:${mm}:${ss}`;
    } catch (err) {
        console.error("loadDevices error:", err);
        showToast("Lỗi mạng khi tải thiết bị", "error");
    }
}

// ============================================================
// FETCH LOGS
// ============================================================
async function fetchLogs() {
    const tableBody = document.getElementById("log-table-body");
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                Đang tải nhật ký hoạt động...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`${API}/logs/?limit=50`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        Không thể tải nhật ký hoạt động
                    </td>
                </tr>
            `;
            return;
        }

        const logs = await res.json();

        if (!logs.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        Chưa có dữ liệu nhật ký
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = logs.map(log => {
            const desc = log.description || "";
            const type = (log.type || "").toLowerCase();

            // ===== đoán tên thiết bị từ description =====
            let deviceName = "--";

            const controllerMatch = desc.match(/Controller[: ](.+?)(\.|$)/i);
            const sensorMatch = desc.match(/Sensor[: ](.+?)(\.|$)/i);

            if (controllerMatch) {
                deviceName = controllerMatch[1];
            } else if (sensorMatch) {
                deviceName = sensorMatch[1];
            }

            // ===== đoán hành động =====
            let action = "Cập nhật";

            if (/turned on/i.test(desc)) action = "Bật";
            else if (/turned off/i.test(desc)) action = "Tắt";
            else if (/created/i.test(desc)) action = "Tạo mới";
            else if (/deleted/i.test(desc)) action = "Xóa";
            else if (/updated/i.test(desc)) action = "Cập nhật";

            // ===== trạng thái =====
            const isSuccess =
                !/fail|error|lỗi/i.test(desc);

            return `
                <tr>
                    <td>${formatTimestamp(log.timestamp)}</td>

                    <td>${escapeHtml(deviceName)}</td>

                    <td>${escapeHtml(action)}</td>

                    <td>
                        <span class="${
                            isSuccess ? "status-success" : "status-error"
                        }">
                            ${isSuccess ? "Thành công" : "Lỗi"}
                        </span>
                    </td>

                    <td>${escapeHtml(desc)}</td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("fetchLogs error:", err);

        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    Lỗi kết nối tới server
                </td>
            </tr>
        `;
    }
}

function renderSensors(sensors) {
    const grid = document.getElementById("sensor-grid");
    const countEl = document.getElementById("sensor-count");
    if (countEl) countEl.innerText = `${sensors.length} thiết bị`;

    if (sensors.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-satellite-dish"></i>
                Chưa có cảm biến nào. Hãy thêm cảm biến mới.
            </div>`;
        return;
    }

    grid.innerHTML = sensors.map(d => {
        const meta = detectSensorMeta(d);
        const value = (d.value !== null && d.value !== undefined)
            ? Number(d.value).toFixed(1).replace(/\.0$/, "")
            : "--";

        // UR-2.4: Kiểm tra ngưỡng → thêm class alert nhấp nháy đỏ
        const isAlert = checkSensorAlert(d);
        const alertClass = isAlert ? " sensor-alert" : "";

        return `
            <div class="device-card sensor-card-v2${alertClass}" data-id="${d.id}">
                <div class="card-header">
                    <div class="card-icon"><i class="fas ${meta.icon}"></i></div>
                    <div class="card-title-area">
                        <div class="card-title">${escapeHtml(d.name)}</div>
                        <div class="card-feed">${escapeHtml(d.feed_id)}</div>
                        ${getZoneLabel(d.zone_id) ? `<div class="card-zone"><i class="fas fa-map-pin"></i> ${escapeHtml(getZoneLabel(d.zone_id))}</div>` : ""}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-secondary" title="Sửa thiết bị" onclick="editDevice(${d.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-trash" title="Xoá thiết bị" onclick="deleteDevice(${d.id}, '${escapeHtml(d.name)}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="sensor-value-big">
                    <span>${value}</span>
                    <span class="unit">${meta.unit}</span>
                </div>
                <div class="sensor-meta">
                    ${isAlert
                        ? '<i class="fas fa-triangle-exclamation" style="color:var(--danger)"></i> <span style="color:var(--danger);font-weight:600">VƯỢT NGƯỠNG</span>'
                        : `<i class="fas fa-circle"></i> ${meta.label} · Live`
                    }
                </div>
            </div>
        `;
    }).join("");
}

function renderControllers(controllers) {
    const grid = document.getElementById("controller-grid");
    const countEl = document.getElementById("controller-count");
    if (countEl) countEl.innerText = `${controllers.length} thiết bị`;

    if (controllers.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-plug"></i>
                Chưa có controller nào. Hãy thêm thiết bị điều khiển.
            </div>`;
        return;
    }

    grid.innerHTML = controllers.map(d => {
        const icon = detectControllerIcon(d);
        const isOn = String(d.status).toUpperCase() === "ON";
        const fan  = isFanDevice(d);
        const speedLv = fan ? getSpeedLevel(d.speed) : 0;
        const fanMode = fan ? getFanMode(d) : "manual";
        const isAutoMode = fanMode === "auto";

        // Thanh điều chỉnh tốc độ quạt (chỉ hiện cho quạt)
        const modeHtml = fan ? `
            <div class="fan-mode-control" data-device-id="${d.id}">
                <div class="speed-label"><i class="fas fa-robot"></i> Chế độ</div>
                <div class="speed-buttons">
                    <button class="speed-btn ${fanMode === 'manual' ? 'active med' : ''}"
                            onclick="setFanMode(${d.id}, 'manual', this)">
                        <i class="fas fa-hand-pointer"></i> Thủ công
                    </button>
                    <button class="speed-btn ${fanMode === 'auto' ? 'active high' : ''}"
                            onclick="setFanMode(${d.id}, 'auto', this)">
                        <i class="fas fa-robot"></i> Auto
                    </button>
                </div>
            </div>
        ` : "";
    
        const speedHtml = fan ? `
            <div class="fan-speed-control ${isAutoMode ? 'disabled-control' : ''}" data-device-id="${d.id}">
                <div class="speed-label">
                    <i class="fas fa-gauge-high"></i> Tốc độ
                    ${isAutoMode ? '<span style="font-size:12px;opacity:.75;"> · đang tự động</span>' : ''}
                </div>
                <div class="speed-buttons">
                    <button class="speed-btn ${speedLv === 1 ? 'active low' : ''}"
                            ${isAutoMode ? 'disabled' : ''}
                            onclick="setFanSpeed(${d.id}, 33, this)" title="Nhỏ">
                        <i class="fas fa-wind"></i> Nhỏ
                    </button>
                    <button class="speed-btn ${speedLv === 2 ? 'active med' : ''}"
                            ${isAutoMode ? 'disabled' : ''}
                            onclick="setFanSpeed(${d.id}, 66, this)" title="Vừa">
                        <i class="fas fa-wind"></i> Vừa
                    </button>
                    <button class="speed-btn ${speedLv === 3 ? 'active high' : ''}"
                            ${isAutoMode ? 'disabled' : ''}
                            onclick="setFanSpeed(${d.id}, 100, this)" title="Lớn">
                        <i class="fas fa-wind"></i> Lớn
                    </button>
                </div>
            </div>
        ` : "";

        return `
            <div class="device-card controller-card ${fan ? 'fan-card' : ''}" data-id="${d.id}">
                <div class="card-header">
                    <div class="card-icon ${fan && isOn ? 'fan-spinning' : ''}"><i class="fas ${icon}"></i></div>
                    <div class="card-title-area">
                        <div class="card-title">${escapeHtml(d.name)}</div>
                        <div class="card-feed">${escapeHtml(d.feed_id)}</div>
                        ${getZoneLabel(d.zone_id) ? `<div class="card-zone"><i class="fas fa-map-pin"></i> ${escapeHtml(getZoneLabel(d.zone_id))}</div>` : ""}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn-secondary" title="Sửa thiết bị" onclick="editDevice(${d.id})">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="btn-trash" title="Xoá thiết bị" onclick="deleteDevice(${d.id}, '${escapeHtml(d.name)}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="controller-state">
                    <div class="state-label ${isOn ? 'state-on' : 'state-off'}">
                        <i class="fas fa-power-off"></i>
                        <span>${isOn ? 'BẬT' : 'TẮT'}</span>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" ${isOn ? 'checked' : ''}
                               onchange="toggleDevice(${d.id}, this)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                ${speedHtml}
                ${modeHtml}
            </div>
        `;
    }).join("");
}

// ============================================================
// TOGGLE DEVICE 
// ============================================================
async function toggleDevice(deviceId, checkboxEl) {
    const action = checkboxEl.checked ? "on" : "off";
    checkboxEl.disabled = true;

    try {
        const res = await fetch(`${API}/devices/${deviceId}/toggle?action=${action}`, {
            method: "POST",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("Toggle thất bại:", errText);
            showToast(`Không thể ${action === "on" ? "bật" : "tắt"} thiết bị`, "error");
            // rollback UI
            checkboxEl.checked = !checkboxEl.checked;
            return;
        }

        // Cập nhật UI ngay
        const card = checkboxEl.closest(".device-card");
        const stateLabel = card.querySelector(".state-label");
        const isOn = checkboxEl.checked;
        stateLabel.classList.toggle("state-on", isOn);
        stateLabel.classList.toggle("state-off", !isOn);
        stateLabel.querySelector("span").innerText = isOn ? "BẬT" : "TẮT";

        showToast(`Đã ${isOn ? "bật" : "tắt"} thiết bị`, "success");
    } catch (err) {
        console.error("toggleDevice error:", err);
        showToast("Lỗi kết nối khi điều khiển", "error");
        checkboxEl.checked = !checkboxEl.checked;
    } finally {
        checkboxEl.disabled = false;
    }
}

// ============================================================
// FAN SPEED CONTROL
// ============================================================
async function setFanSpeed(deviceId, speed, btnEl) {
    if (fanModeMap[deviceId] === "auto") {
        showToast("Quạt đang ở chế độ Auto, hãy chuyển sang Thủ công để chỉnh tốc độ", "info");
        return;
    }

    const speedControl = btnEl.closest(".fan-speed-control");
    const allBtns = speedControl.querySelectorAll(".speed-btn");

    // Disable tất cả nút trong lúc gọi API
    allBtns.forEach(b => b.disabled = true);

    try {
        const res = await fetch(`${API}/devices/${deviceId}/speed?speed=${speed}`, {
            method: "POST",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("setFanSpeed error:", errText);
            showToast("Không thể đổi tốc độ quạt", "error");
            return;
        }

        // Cập nhật UI: bỏ active cũ, thêm active mới
        allBtns.forEach(b => b.classList.remove("active", "low", "med", "high"));
        const levelClass = speed <= 40 ? "low" : speed <= 70 ? "med" : "high";
        btnEl.classList.add("active", levelClass);

        const labels = { 33: "Nhỏ", 66: "Vừa", 100: "Lớn" };
        showToast(`Đã chỉnh quạt mức ${labels[speed] || speed}`, "success");

        // Nếu quạt đang tắt → tự bật lên
        const card = btnEl.closest(".device-card");
        const checkbox = card.querySelector(".toggle-switch input");
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            const stateLabel = card.querySelector(".state-label");
            stateLabel.classList.remove("state-off");
            stateLabel.classList.add("state-on");
            stateLabel.querySelector("span").innerText = "BẬT";
            // Bật icon quay
            const iconEl = card.querySelector(".card-icon");
            if (iconEl) iconEl.classList.add("fan-spinning");
        }

    } catch (err) {
        console.error("setFanSpeed error:", err);
        showToast("Lỗi kết nối khi chỉnh tốc độ", "error");
    } finally {
        allBtns.forEach(b => b.disabled = false);
    }
}

async function setFanMode(deviceId, mode, btnEl) {
    const modeControl = btnEl.closest(".fan-mode-control");
    const allModeBtns = modeControl.querySelectorAll(".speed-btn");

    allModeBtns.forEach(b => b.disabled = true);

    try {
        const res = await fetch(`${API}/devices/${deviceId}/mode?mode=${mode}`, {
            method: "POST",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("setFanMode error:", errText);
            showToast("Không thể đổi chế độ quạt", "error");
            return;
        }

        saveFanMode(deviceId, mode);

        allModeBtns.forEach(b => b.classList.remove("active", "low", "med", "high"));
        btnEl.classList.add("active", mode === "auto" ? "high" : "med");

        showToast(
            mode === "auto"
                ? "Đã chuyển quạt sang chế độ Auto"
                : "Đã chuyển quạt sang chế độ Thủ công",
            "success"
        );

        await loadDevices();

    } catch (err) {
        console.error("setFanMode error:", err);
        showToast("Lỗi kết nối khi đổi chế độ quạt", "error");
    } finally {
        allModeBtns.forEach(b => b.disabled = false);
    }
}

// ============================================================
// MODAL THÊM THIẾT BỊ
// ============================================================
function openAddDeviceModal() {
    document.getElementById("add-device-modal").classList.add("active");
    document.getElementById("device-preset").value = "";
    document.getElementById("modal-error").innerText = "";
    loadZonesForModal();
}

function onDevicePresetChange() {
    // Chỉ cần reset lỗi khi chọn lại
    document.getElementById("modal-error").innerText = "";
}
function closeAddDeviceModal() {
    document.getElementById("add-device-modal").classList.remove("active");
}

// Đóng modal khi click ra ngoài
document.addEventListener("click", (e) => {
    const overlay = document.getElementById("add-device-modal");
    if (e.target === overlay) closeAddDeviceModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAddDeviceModal();
});

async function loadZonesForModal() {
    const select = document.getElementById("device-zone");
    if (!select) return;
    select.innerHTML = `<option value="">-- Đang tải zones... --</option>`;

    try {
        const res = await fetch(`${API}/zones/`, { headers: authHeaders() });
        if (!res.ok) {
            select.innerHTML = `<option value="1">Zone mặc định (id=1)</option>`;
            return;
        }
        const zones = await res.json();
        allZonesCache = zones;

        if (!zones.length) {
            select.innerHTML = `<option value="">-- Chưa có khu vực, hãy tạo trong mục Quản lý Khu vực --</option>`;
            return;
        }

        // Nhóm theo tầng → optgroup
        const floors = [...new Set(zones.map(z => z.floor))].sort((a, b) => a - b);
        let html = '<option value="">-- Chọn khu vực --</option>';
        floors.forEach(floor => {
            const rooms = zones.filter(z => z.floor === floor);
            html += `<optgroup label="Tầng ${floor}">`;
            rooms.forEach(z => {
                html += `<option value="${z.id}">${escapeHtml(z.room)}</option>`;
            });
            html += `</optgroup>`;
        });
        select.innerHTML = html;
    } catch (err) {
        console.error("loadZones error:", err);
        select.innerHTML = `<option value="1">Zone mặc định (id=1)</option>`;
    }
}

// ============================================================
// ADD DEVICE (CREATE)
// ============================================================
async function addDevice() {
    const errBox    = document.getElementById("modal-error");
    const presetVal = document.getElementById("device-preset").value;
    const zoneVal   = document.getElementById("device-zone").value;

    errBox.innerText = "";

    if (!presetVal) {
        errBox.innerText = "Vui lòng chọn thiết bị.";
        return;
    }

    const [feed_id, name, type] = presetVal.split("|");

    const zone_id = parseInt(zoneVal, 10);
    if (!zone_id) {
        errBox.innerText = "Vui lòng chọn Khu vực (Zone).";
        return;
    }

    try {
        const res = await fetch(`${API}/devices/`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ name, feed_id, zone_id, type, status: "OFF" })
        });

        if (!res.ok) {
            const errText = await res.text();
            errBox.innerText = "Không thể thêm thiết bị. " + errText;
            return;
        }

        showToast("Đã thêm thiết bị thành công", "success");
        closeAddDeviceModal();
        loadDevices();
    } catch (err) {
        console.error("addDevice error:", err);
        errBox.innerText = "Lỗi kết nối tới server.";
    }
}

// ============================================================
// DELETE DEVICE
// ============================================================
async function deleteDevice(deviceId, deviceName = "") {
    const ok = confirm(`Bạn có chắc muốn xoá thiết bị "${deviceName}"?\nHành động này không thể hoàn tác.`);
    if (!ok) return;

    try {
        const res = await fetch(`${API}/devices/${deviceId}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        if (res.ok) {
            showToast(`Đã xoá thiết bị "${deviceName}"`, "success");
            loadDevices();
        } else {
            const errText = await res.text();
            console.error("Delete failed:", errText);
            showToast("Xoá thất bại", "error");
        }
    } catch (err) {
        console.error("deleteDevice error:", err);
        showToast("Lỗi kết nối khi xoá", "error");
    }
}


// ============================================================
// THRESHOLDS MODULE
// ============================================================

let allDevicesCache = [];
let allThresholdsCache = [];
let allZonesCache = [];

let thresholdSensorMap = JSON.parse(localStorage.getItem("thresholdSensorMap") || "{}");
let thresholdTargetMap = JSON.parse(localStorage.getItem("thresholdTargetMap") || "{}");

let currentFloorFilter = "all";

/** Tìm zone name từ zone_id */
function getZoneLabel(zoneId) {
    const z = allZonesCache.find(zone => zone.id === zoneId);
    return z ? `Tầng ${z.floor} – ${z.room}` : "";
}

/**
 * Load sensor + controller vào select box
 */

async function loadThresholdDevices() {
    try {
        const res = await fetch(`${API}/devices/`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            showToast("Không tải được danh sách thiết bị", "error");
            return;
        }

        const devices = await res.json();
        allDevicesCache = devices;

        const sensors = devices.filter(
            d => (d.type || "").toLowerCase() === "sensor"
        );

        const controllers = devices.filter(
            d => (d.type || "").toLowerCase() === "controller"
        );

        const sensorSelect = document.getElementById("threshold-sensor");
        const targetSelect = document.getElementById("threshold-target-device");

        if (sensorSelect) {
            sensorSelect.innerHTML = `
                <option value="">-- Chọn cảm biến --</option>
                ${sensors.map(d => `
                    <option value="${d.id}">
                        ${escapeHtml(d.name)}
                    </option>
                `).join("")}
            `;
        }

        if (targetSelect) {
            targetSelect.innerHTML = `
                <option value="">-- Chọn thiết bị phản ứng --</option>
                ${controllers.map(d => `
                    <option value="${d.id}">
                        ${escapeHtml(d.name)}
                    </option>
                `).join("")}
            `;
        }

    } catch (err) {
        console.error("loadThresholdDevices error:", err);
        showToast("Lỗi mạng khi tải thiết bị", "error");
    }
}

/*
 * Lưu threshold mới
 */
// thêm vào bên trong saveThreshold()
async function saveThreshold() {
    const name = document.getElementById("threshold-name")?.value.trim();
    const sensorId = document.getElementById("threshold-sensor").value;
    const value = document.getElementById("threshold-value").value;
    const condition = document.getElementById("threshold-condition").value;
    const targetDeviceId = document.getElementById("threshold-target-device").value;
    const action = document.getElementById("threshold-action").value;

    if (!name || !sensorId || value === "" || !targetDeviceId) {
        showToast("Vui lòng nhập tên setting, cảm biến, ngưỡng và thiết bị phản ứng", "error");
        return;
    }

    const payload = {
        name,
        action: String(action).toUpperCase(),
        value: Number(value),
        condition: condition === "true",
        target_device_id: Number(targetDeviceId),
        type: "threshold"
    };

    try {
        const res = await fetch(`${API}/settings/thresholds`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(errText);
            showToast("Không thể lưu ngưỡng", "error");
            return;
        }

        const createdThreshold = await res.json();
        const settingId = createdThreshold.setting_id || createdThreshold.id;

        const ok = await initSettingDevice(settingId, sensorId, "threshold");
        if (!ok) return;

        thresholdSensorMap[settingId] = Number(sensorId);
        thresholdTargetMap[settingId] = Number(targetDeviceId);

        localStorage.setItem("thresholdSensorMap", JSON.stringify(thresholdSensorMap));
        localStorage.setItem("thresholdTargetMap", JSON.stringify(thresholdTargetMap));

        showToast("Đã tạo setting ngưỡng và gắn thiết bị thành công", "success");

        document.getElementById("threshold-name").value = "";
        document.getElementById("threshold-value").value = "";

        await loadThresholdsCache();
        await loadThresholds();
        await loadDevices();

    } catch (err) {
        console.error("saveThreshold error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}


/**
 * Load danh sách thresholds
 */
async function loadThresholds() {
    const tbody = document.getElementById("threshold-table-body");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7">Đang tải dữ liệu...</td></tr>`;

    try {
        const res = await fetch(`${API}/settings/thresholds`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="7">Chưa có dữ liệu</td></tr>`;
            return;
        }

        const thresholds = await res.json();
        allThresholdsCache = thresholds;

        if (!thresholds.length) {
            tbody.innerHTML = `<tr><td colspan="7">Chưa có ngưỡng nào</td></tr>`;
            return;
        }

        tbody.innerHTML = thresholds.map(item => {
            const settingId = item.setting_id || item.id;

            const sensorId =
                item.sensor_id ||
                item.device_id ||
                thresholdSensorMap[settingId];

            const targetId =
                item.target_device_id ||
                thresholdTargetMap[settingId];

            const sensor = sensorId
                ? allDevicesCache.find(d => d.id == sensorId)
                : null;

            const target = targetId
                ? allDevicesCache.find(d => d.id == targetId)
                : null;

            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>

                    <td>${sensor ? escapeHtml(sensor.name) : "--"}</td>

                    <td>${item.condition ? "≥" : "≤"} ${item.value}</td>

                    <td>${target ? escapeHtml(target.name) : "N/A"}</td>

                    <td>
                        ${String(item.action).toUpperCase() === "ON" ? "Bật" : "Tắt"}
                    </td>

                    <td>
                        <button class="btn-secondary" onclick="editThreshold(${settingId})" title="Sửa ngưỡng">
                            <i class="fas fa-pen"></i>
                        </button>
                    </td>

                    <td>
                        <button class="btn-trash" onclick="deleteThreshold(${settingId})" title="Xóa ngưỡng">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("loadThresholds error:", err);
        tbody.innerHTML = `<tr><td colspan="7">Lỗi tải dữ liệu</td></tr>`;
    }
}



/**
 * Xóa threshold
 */
async function deleteThreshold(settingId) {
    if (!confirm("Bạn có chắc muốn xóa ngưỡng này?")) return;

    try {
        const res = await fetch(
            `${API}/settings/${settingId}`,
            {
                method: "DELETE",
                headers: authHeaders()
            }
        );

        if (!res.ok) {
            const errText = await res.text();
            console.error(errText);
            showToast("Không thể xóa ngưỡng", "error");
            return;
        }

        delete thresholdSensorMap[settingId];
        delete thresholdTargetMap[settingId];

        localStorage.setItem("thresholdSensorMap", JSON.stringify(thresholdSensorMap));
        localStorage.setItem("thresholdTargetMap", JSON.stringify(thresholdTargetMap));

        showToast("Đã xóa ngưỡng thành công", "success");

        loadThresholds();
        loadThresholdsCache();
        loadDevices();

    } catch (err) {
        console.error("deleteThreshold error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}

async function loadThresholdsCache() {
    try {
        const res = await fetch(`${API}/settings/thresholds`, {
            method: "GET",
            headers: authHeaders()
        });

        if (res.ok) {
            allThresholdsCache = await res.json();
        } else {
            console.warn("loadThresholdsCache failed:", res.status);
            allThresholdsCache = [];
        }
    } catch (err) {
        console.error("loadThresholdsCache error:", err);
        allThresholdsCache = [];
    }
}

/**
 * Kiểm tra sensor có đang vượt ngưỡng nào không
 * So sánh value với danh sách thresholds đã cache
 */
function checkSensorAlert(sensor) {
    if (sensor.value === null || sensor.value === undefined) return false;

    const val = Number(sensor.value);

    for (const t of allThresholdsCache) {
        const settingId = t.setting_id || t.id;
        const mappedSensorId = t.sensor_id || t.device_id || thresholdSensorMap[settingId];

        const sameSensor =
            String(mappedSensorId) === String(sensor.id) ||
            (!mappedSensorId && t.name === sensor.name);
        if (!sameSensor) continue;

        if (t.condition && val >= Number(t.value)) return true;
        if (!t.condition && val <= Number(t.value)) return true;
    }

    return false;
}

// ============================================================
// INIT THRESHOLDS
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
    await loadThresholdDevices();
    await loadThresholds();
});
// ============================================================
// ĐIỀU HƯỚNG SIDEBAR (Chuyển trang)
// ============================================================
const navItems = document.querySelectorAll('.nav-item');
const pages    = document.querySelectorAll('.page');
const pageTitle = document.getElementById('page-title');

navItems.forEach(item => {
    item.addEventListener('click', function (e) {
        e.preventDefault();
        navItems.forEach(nav => nav.classList.remove('active'));
        pages.forEach(p => p.classList.remove('active'));
        this.classList.add('active');
        const targetId = "page-" + this.getAttribute('href').substring(1);
        const target = document.getElementById(targetId);
        if (target) target.classList.add('active');
        pageTitle.innerText = this.innerText.trim();
    });
});

// ============================================================
// FORMAT TIME
// ============================================================
function formatTimestamp(timestamp) {
    if (!timestamp) return "--";

    const date = new Date(timestamp);

    date.setHours(date.getHours() + 7);

    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");

    const dd = String(date.getDate()).padStart(2, "0");
    const MM = String(date.getMonth() + 1).padStart(2, "0");

    return `${hh}:${mm}:${ss} ${dd}/${MM}`;
}



// REPORTS - CHART NHIỆT ĐỘ / ĐỘ ẨM
let mainChartInstance = null;

/** Tìm sensor  */
function findSensorByKeyword(devices, keywords = []) {
    return devices.find(device => {
        if ((device.type || "").toLowerCase() !== "sensor") return false;

        const text = `${device.name} ${device.feed_id}`.toLowerCase();
        return keywords.some(keyword => text.includes(keyword));
    });
}

/** Format thời gian HH:mm */
function formatChartTime(timestamp) {
    const date = new Date(timestamp);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

/** Lấy history của sensor */
async function getSensorHistory(deviceId, limit = 20) {
    const res = await fetch(`${API}/devices/${deviceId}/history?limit=${limit}`, {
        method: "GET",
        headers: authHeaders()
    });

    if (!res.ok) {
        console.error("Không lấy được history:", deviceId);
        return [];
    }

    return await res.json();
}

/** Load biểu đồ báo cáo */
async function loadReportChart() {
    const canvas = document.getElementById("mainChart");
    if (!canvas) return;

    try {
        const res = await fetch(`${API}/devices/`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            console.error("Không lấy được devices");
            return;
        }

        const devices = await res.json();

        const tempSensor = findSensorByKeyword(devices, [
            "temp", "nhiệt", "nhiet", "temperature"
        ]);

        const humiSensor = findSensorByKeyword(devices, [
            "humi", "humidity", "độ ẩm", "do am", "moist"
        ]);

        if (!tempSensor && !humiSensor) {
            canvas.parentElement.innerHTML =
                `<div class="empty-state">
                    <i class="fas fa-chart-line"></i>
                    Không tìm thấy cảm biến nhiệt độ / độ ẩm
                </div>`;
            return;
        }

        const [tempHistory, humiHistory] = await Promise.all([
            tempSensor ? getSensorHistory(tempSensor.id, 20) : [],
            humiSensor ? getSensorHistory(humiSensor.id, 20) : []
        ]);

        tempHistory.reverse();
        humiHistory.reverse();

        const sourceLabels = tempHistory.length ? tempHistory : humiHistory;
        const labels = sourceLabels.map(item =>
            formatChartTime(item.timestamp)
        );

        const datasets = [];

        if (tempHistory.length) {
            datasets.push({
                label: "Nhiệt độ (°C)",
                data: tempHistory.map(item => item.value),
                borderColor: "#ef4444",
                backgroundColor: "rgba(239,68,68,0.12)",
                fill: true,
                tension: 0.35,
                borderWidth: 2
            });
        }

        if (humiHistory.length) {
            datasets.push({
                label: "Độ ẩm (%)",
                data: humiHistory.map(item => item.value),
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59,130,246,0.10)",
                fill: true,
                tension: 0.35,
                borderWidth: 2
            });
        }

        // destroy chart cũ nếu có
        if (mainChartInstance) {
            mainChartInstance.destroy();
        }

        const ctx = canvas.getContext("2d");

        mainChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels,
                datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: {
                            color: "#cbd5e1"
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: "#94a3b8"
                        },
                        grid: {
                            color: "rgba(255,255,255,0.05)"
                        }
                    },
                    y: {
                        ticks: {
                            color: "#94a3b8"
                        },
                        grid: {
                            color: "rgba(255,255,255,0.05)"
                        }
                    }
                }
            }
        });

    } catch (err) {
        console.error("loadReportChart error:", err);
        showToast("Không tải được biểu đồ báo cáo", "error");
    }
}

async function loadReportSummary() {
    const days = document.getElementById("report-days")?.value || 7;
    const kpiGrid = document.getElementById("report-kpi-grid");
    const deviceTable = document.getElementById("report-device-table");
    const automationTable = document.getElementById("report-automation-table");

    if (!kpiGrid) return;

    kpiGrid.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-spinner fa-spin"></i> Đang tải báo cáo...
        </div>
    `;

    try {
        const res = await fetch(`${API}/report/summary?days=${days}`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error("loadReportSummary error:", errText);
            showToast("Không tải được báo cáo tổng quan", "error");
            return;
        }

        const data = await res.json();

        renderReportKPIs(data);
        renderReportDevices(data.devices || []);
        renderReportAutomations(data.automations || []);

    } catch (err) {
        console.error("loadReportSummary error:", err);
        showToast("Lỗi kết nối khi tải báo cáo", "error");
    }
}

function renderReportKPIs(data) {
    const grid = document.getElementById("report-kpi-grid");
    if (!grid) return;

    const items = [
        { label: "Tổng tầng", value: data.total_floors, icon: "fa-layer-group" },
        { label: "Tổng phòng", value: data.total_zones, icon: "fa-door-open" },
        { label: "Tổng thiết bị", value: data.total_devices, icon: "fa-microchip" },
        { label: "Cảm biến", value: data.total_sensors, icon: "fa-satellite-dish" },
        { label: "Controller", value: data.total_controllers, icon: "fa-toggle-on" },
        { label: "Đang bật", value: data.devices_on, icon: "fa-power-off" },
        { label: "Đang tắt", value: data.devices_off, icon: "fa-circle" },
        { label: "Lịch hẹn", value: data.total_schedules, icon: "fa-calendar-alt" },
        { label: "Ngưỡng", value: data.total_thresholds, icon: "fa-exclamation-triangle" },
        { label: "Nhật ký", value: data.total_logs_in_period, icon: "fa-history" }
    ];

    grid.innerHTML = items.map(item => `
        <div class="report-kpi-card">
            <div class="report-kpi-icon">
                <i class="fas ${item.icon}"></i>
            </div>
            <div>
                <div class="report-kpi-value">${item.value ?? 0}</div>
                <div class="report-kpi-label">${item.label}</div>
            </div>
        </div>
    `).join("");
}

function renderReportDevices(devices) {
    const tbody = document.getElementById("report-device-table");
    if (!tbody) return;

    if (!devices.length) {
        tbody.innerHTML = `<tr><td colspan="5">Chưa có thiết bị nào</td></tr>`;
        return;
    }

    tbody.innerHTML = devices.map(d => `
        <tr>
            <td>${escapeHtml(d.name)}</td>
            <td>${escapeHtml(d.type)}</td>
            <td>
                <span class="${String(d.status).toUpperCase() === 'ON' ? 'status-success' : 'status-error'}">
                    ${String(d.status).toUpperCase()}
                </span>
            </td>
            <td>Tầng ${d.floor} - ${escapeHtml(d.room)}</td>
            <td>${d.current_value ?? "--"}</td>
        </tr>
    `).join("");
}

function renderReportAutomations(automations) {
    const tbody = document.getElementById("report-automation-table");
    if (!tbody) return;

    if (!automations.length) {
        tbody.innerHTML = `<tr><td colspan="9">Chưa có tự động hóa nào</td></tr>`;
        return;
    }

    tbody.innerHTML = automations.map(a => `
        <tr>
            <td>${escapeHtml(a.name)}</td>

            <td>${escapeHtml(a.type)}</td>

            <td>${escapeHtml(a.action)}</td>

            <td>${formatDateOnly(a.date_start)}</td>

            <td>${formatDateOnly(a.date_end)}</td>

            <td>${escapeHtml(a.time_start || "--")}</td>

            <td>${formatTimerMinutes(a.timer)}</td>

            <td>${a.trigger_count ?? 0}</td>

            <td>${escapeHtml(a.applied_devices || "--")}</td>
        </tr>
    `).join("");
}

function downloadFileFromReport(url, filename) {
    fetch(url, {
        method: "GET",
        headers: authHeaders()
    })
        .then(res => {
            if (!res.ok) throw new Error("Download failed");
            return res.blob();
        })
        .then(blob => {
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
        })
        .catch(err => {
            console.error(err);
            showToast("Không thể tải file báo cáo", "error");
        });
}

function getReportDays() {
    return document.getElementById("report-days")?.value || 7;
}

function downloadReportPDF() {
    const days = getReportDays();
    downloadFileFromReport(
        `${API}/report/pdf?days=${days}`,
        `SmartHome_Report_${days}_days.pdf`
    );
}

function downloadSensorCSV() {
    const days = getReportDays();
    downloadFileFromReport(
        `${API}/report/csv/sensors?days=${days}`,
        `SmartHome_Sensors_${days}_days.csv`
    );
}

function downloadLogsCSV() {
    const days = getReportDays();
    downloadFileFromReport(
        `${API}/report/csv/logs?days=${days}`,
        `SmartHome_Logs_${days}_days.csv`
    );
}

// ============================================================
// SCHEDULER MODULE
// ============================================================

// Lưu mapping setting_id → device_id (vì API không trả về trong list)
let scheduleDeviceMap = JSON.parse(localStorage.getItem("scheduleDeviceMap") || "{}");

function saveScheduleDeviceMap(settingId, deviceId) {
    scheduleDeviceMap[settingId] = Number(deviceId);
    localStorage.setItem("scheduleDeviceMap", JSON.stringify(scheduleDeviceMap));
}

/**
 * Load danh sách controller vào dropdown lịch
 */
async function loadScheduleDevices() {
    const select = document.getElementById("schedule-device");
    if (!select) return;

    // Dùng cache nếu đã có, nếu chưa thì fetch
    let devices = allDevicesCache;
    if (!devices.length) {
        try {
            const res = await fetch(`${API}/devices/`, {
                method: "GET",
                headers: authHeaders()
            });
            if (res.ok) {
                devices = await res.json();
                allDevicesCache = devices;
            }
        } catch (err) {
            console.error("loadScheduleDevices error:", err);
        }
    }

    const controllers = devices.filter(
        d => (d.type || "").toLowerCase() === "controller"
    );

    select.innerHTML = `
        <option value="">-- Chọn thiết bị điều khiển --</option>
        ${controllers.map(d => `
            <option value="${d.id}">
                ${escapeHtml(d.name)}
            </option>
        `).join("")}
    `;
}

/************************************OOOOOOOOOOO */

/**
 * Lưu schedule mới 
 */

async function saveSchedule() {
    const name = document.getElementById("schedule-name")?.value.trim();
    const deviceId = document.getElementById("schedule-device").value;
    const dateStart = document.getElementById("schedule-date-start")?.value;
    const dateEnd = document.getElementById("schedule-date-end")?.value;
    const timeVal  = document.getElementById("schedule-time").value;
    const timerVal = document.getElementById("schedule-timer")?.value;
    const action   = document.getElementById("schedule-action").value;

    if (!name || !deviceId || !dateStart || !timeVal) {
        showToast("Vui lòng nhập tên setting, thiết bị, ngày bắt đầu và thời gian", "error");
        return;
    }

    if (dateEnd && dateEnd < dateStart) {
        showToast("Ngày kết thúc không được nhỏ hơn ngày bắt đầu", "error");
        return;
    }

    const timer = timerVal ? Number(timerVal) : null;

    if (timer !== null && (Number.isNaN(timer) || timer <= 0)) {
        showToast("Thời lượng phải là số phút lớn hơn 0", "error");
        return;
    }

    const payload = {
        name,
        action: String(action).toUpperCase(),
        date_start: dateStart,
        date_end: dateEnd || null,
        time_start: timeVal.length === 5 ? timeVal + ":00" : timeVal,
        timer,
        type: "schedule"
    };

    try {
        const res = await fetch(`${API}/settings/schedules`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(errText);
            showToast("Không thể tạo lịch hẹn giờ", "error");
            return;
        }

        const created = await res.json();
        const settingId = created.setting_id || created.id;

        const ok = await initSettingDevice(settingId, deviceId, "schedule");
        if (!ok) return;

        saveScheduleDeviceMap(settingId, deviceId);

        showToast("Đã tạo setting lịch và gắn thiết bị thành công", "success");

        document.getElementById("schedule-name").value = "";
        document.getElementById("schedule-device").value = "";
        document.getElementById("schedule-date-start").value = "";
        document.getElementById("schedule-date-end").value = "";
        document.getElementById("schedule-time").value = "";
        document.getElementById("schedule-timer").value = "";

        await loadSchedules();

    } catch (err) {
        console.error("saveSchedule error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}

/**
 * Load danh sách schedules 
 */
async function loadSchedules() {
    const tbody = document.getElementById("schedule-table-body");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="10">
                <i class="fas fa-spinner fa-spin"></i> Đang tải lịch hẹn giờ...
            </td>
        </tr>
    `;

    try {
        const res = await fetch(`${API}/settings/schedules`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            tbody.innerHTML = `
                <tr><td colspan="10">Chưa có dữ liệu</td></tr>
            `;
            return;
        }

        const schedules = await res.json();
        console.log("loadSchedules data:", schedules);

        if (!schedules.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="empty-state">
                        <i class="fas fa-clock"></i>
                        Chưa có lịch hẹn giờ nào
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = schedules.map(item => {
            // Tìm device qua mapping local (vì API không trả target_device_id)
            const settingId = item.setting_id || item.id;
            const mappedDeviceId = item.target_device_id || item.device_id || scheduleDeviceMap[settingId];
            const target = mappedDeviceId
                ? allDevicesCache.find(d => d.id == mappedDeviceId)
                : null;

            const timeDisplay = item.time_start || item.time || "--:--";
            const statusInfo = getScheduleStatus(timeDisplay);

            const schedZone = target ? getZoneLabel(target.zone_id) : "";
            const deviceDisplay = target ? escapeHtml(target.name) : "--";
            const deviceIcon = target ? detectControllerIcon(target) : "fa-calendar-check";

            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>

                    <td>
                        <i class="fas ${deviceIcon}"></i>
                        ${deviceDisplay}
                        ${schedZone ? `<div class="cell-zone">${escapeHtml(schedZone)}</div>` : ""}
                    </td>

                    <td>${formatDateOnly(item.date_start)}</td>

                    <td>${formatDateOnly(item.date_end)}</td>

                    <td>
                        <i class="fas fa-clock"></i>
                        <strong>${escapeHtml(timeDisplay)}</strong>
                    </td>

                    <td>${formatTimerMinutes(item.timer)}</td>

                    <td>
                        <span class="${String(item.action).toUpperCase() === 'ON' ? 'status-success' : 'status-error'}">
                            <i class="fas fa-power-off"></i>
                            ${String(item.action).toUpperCase() === "ON" ? "Bật" : "Tắt"}
                        </span>
                    </td>

                    <td>
                        <span class="${statusInfo.class}">
                            <i class="fas ${statusInfo.icon}"></i>
                            ${statusInfo.label}
                        </span>
                    </td>

                    <td>
                        <button class="btn-secondary" onclick="editSchedule(${settingId})" title="Sửa lịch">
                            <i class="fas fa-pen"></i>
                        </button>
                    </td>

                    <td>
                        <button class="btn-trash" onclick="deleteSchedule(${settingId})" title="Xóa lịch">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("loadSchedules error:", err);
        tbody.innerHTML = `
            <tr><td colspan="10">Lỗi tải dữ liệu</td></tr>
        `;
    }
}
function formatDateOnly(dateStr) {
    if (!dateStr) return "--";

    const s = String(dateStr).slice(0, 10);
    const parts = s.split("-");

    if (parts.length !== 3) return escapeHtml(s);

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTimerMinutes(timer) {
    if (timer === null || timer === undefined || timer === "") return "--";

    const mins = Number(timer);

    if (Number.isNaN(mins) || mins <= 0) return "--";

    if (mins < 60) return `${mins} phút`;

    const h = Math.floor(mins / 60);
    const m = mins % 60;

    if (m === 0) return `${h} giờ`;

    return `${h} giờ ${m} phút`;
}

/**
 * Xác định trạng thái lịch: Đang đợi / Đã chạy
 */
function getScheduleStatus(timeStr) {
    if (!timeStr) {
        return { label: "Không rõ", class: "status-error", icon: "fa-question-circle" };
    }

    const now = new Date();
    const [hh, mm] = timeStr.split(":").map(Number);

    const scheduleMins = hh * 60 + mm;
    const currentMins  = now.getHours() * 60 + now.getMinutes();

    if (currentMins >= scheduleMins) {
        return { label: "Đã chạy", class: "status-success", icon: "fa-circle-check" };
    } else {
        return { label: "Đang đợi", class: "status-warning", icon: "fa-hourglass-half" };
    }
}

/**
 * Xóa schedule 
 */
async function deleteSchedule(settingId) {
    if (!confirm("Bạn có chắc muốn xóa lịch hẹn giờ này?")) return;

    try {
        const res = await fetch(`${API}/settings/${settingId}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(errText);
            showToast("Không thể xóa lịch", "error");
            return;
        }

        // Xóa mapping local
        delete scheduleDeviceMap[settingId];
        localStorage.setItem("scheduleDeviceMap", JSON.stringify(scheduleDeviceMap));

        showToast("Đã xóa lịch hẹn giờ", "success");
        loadSchedules();

    } catch (err) {
        console.error("deleteSchedule error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}






// ============================================================
// MEMBERS MODULE
// ============================================================

// Lưu danh sách email thành viên đã tra cứu 
let membersList = JSON.parse(localStorage.getItem("membersList") || "[]");

/**
 * Thêm member mới 
 */
async function addMember() {
    const fname    = document.getElementById("member-fname").value.trim();
    const lname    = document.getElementById("member-lname").value.trim();
    const email    = document.getElementById("member-email").value.trim();
    const password = document.getElementById("member-password").value;
    const type     = document.getElementById("member-role").value;

    if (!fname || !lname || !email || !password) {
        showToast("Vui lòng nhập đầy đủ thông tin", "error");
        return;
    }

    // Lấy home_id từ JWT admin hiện tại
    let homeId = null;

    try {
        const token = getToken();
        const jwtData = JSON.parse(atob(token.split(".")[1]));

        console.log("JWT:", jwtData);

        homeId = jwtData.home_id || null;

        // Nếu JWT không có home_id thì gọi API lấy info admin theo email
        if (!homeId && jwtData.sub) {
            const meRes = await fetch(
                `${API}/users/${encodeURIComponent(jwtData.sub)}`,
                {
                    method: "GET",
                    headers: authHeaders()
                }
            );

            if (meRes.ok) {
                const meData = await meRes.json();
                homeId = meData.home_id || null;
            }
        }

        console.log("homeId:", homeId);

    } catch (err) {
        console.error("Không đọc được home_id từ JWT:", err);
    }

    if (!homeId) {
        showToast("Không xác định được Home ID. Vui lòng đăng nhập lại.", "error");
        return;
    }

    const body = {
        fname,
        lname,
        email,
        password,
        type,
        home_id: Number(homeId)
    };

    console.log("BODY gửi lên:", body);

    try {
        const res = await fetch(`${API}/users/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        let data = null;
        const text = await res.text();

        try {
            data = text ? JSON.parse(text) : null;
        } catch (_) {
            data = null;
        }

        if (!res.ok) {
            console.error("addMember RESPONSE:", res.status, text);

            let msg = "Không thể tạo thành viên";

            if (data && data.detail) {
                msg = data.detail;
            } else if (res.status === 500) {
                msg = "Backend bị lỗi 500 khi tạo thành viên. Kiểm tra Railway Logs hoặc email có thể đã tồn tại.";
            } else if (res.status === 422) {
                msg = "Dữ liệu gửi lên không đúng định dạng.";
            }

            showToast(String(msg), "error");
            return;
        }

        const newUser = data;

        showToast(
            `Đã thêm thành viên ${newUser.fname || fname} ${newUser.lname || lname}`,
            "success"
        );

        if (!membersList.includes(email)) {
            membersList.push(email);
            localStorage.setItem("membersList", JSON.stringify(membersList));
        }

        document.getElementById("member-fname").value = "";
        document.getElementById("member-lname").value = "";
        document.getElementById("member-email").value = "";
        document.getElementById("member-password").value = "";

        await loadMembers();

    } catch (err) {
        console.error("addMember error:", err);

        showToast(
            "Không gọi được API tạo thành viên. Nếu Console báo CORS + 500 thì lỗi nằm ở backend.",
            "error"
        );
    }
}

/**
 * Load danh sách members 
 */
async function loadMembers() {
    const tbody = document.getElementById("member-table-body");
    if (!tbody) return;

    if (!membersList.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <i class="fas fa-users"></i>
                    Chưa có thành viên. Hãy thêm thành viên mới bằng form bên trên.
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="empty-state">
                <i class="fas fa-spinner fa-spin"></i> Đang tra cứu thành viên...
            </td>
        </tr>`;

    const results = [];
    for (const email of membersList) {
        try {
            const res = await fetch(`${API}/users/${encodeURIComponent(email)}`, {
                method: "GET",
                headers: authHeaders()
            });
            if (res.ok) {
                results.push(await res.json());
            }
        } catch (err) {
            console.warn("Không tìm được:", email);
        }
    }

    if (!results.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    <i class="fas fa-users"></i>
                    Không tìm thấy thành viên nào
                </td>
            </tr>`;
        return;
    }

    tbody.innerHTML = results.map(u => {
        const roleBadge = (u.type || "").toLowerCase() === "admin"
            ? '<span class="role-badge role-admin"><i class="fas fa-crown"></i> Admin</span>'
            : '<span class="role-badge role-member"><i class="fas fa-user"></i> Member</span>';

        const statusBadge = u.status
            ? '<span class="status-success"><i class="fas fa-circle-check"></i> Hoạt động</span>'
            : '<span class="status-error"><i class="fas fa-circle-xmark"></i> Vô hiệu</span>';

        return `
            <tr>
                <td>${u.id}</td>
                <td>${escapeHtml(u.fname)} ${escapeHtml(u.lname)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
            </tr>`;
    }).join("");
}


/**
 * exportLogsToPDF(): 
 */
function exportLogsToPDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        showToast("Thư viện jsPDF chưa tải xong", "error");
        return;
    }

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // Header
    doc.setFillColor(11, 18, 32);
    doc.rect(0, 0, 297, 35, "F");

    doc.setTextColor(56, 189, 248);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("SMARTHOME", 14, 16);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text("Bao cao Nhat ky Hoat dong", 14, 26);

    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    const now = new Date();
    doc.text(
        `Xuat luc: ${now.toLocaleString("vi-VN")}`,
        283, 16, { align: "right" }
    );
    doc.text(
        `Nguoi xuat: Admin`,
        283, 23, { align: "right" }
    );

    // Lấy dữ liệu từ bảng HTML
    const table = document.querySelector("#page-history .log-table");
    if (!table) {
        showToast("Không tìm thấy bảng nhật ký", "error");
        return;
    }

    const headers = [];
    table.querySelectorAll("thead th").forEach(th => {
        headers.push(th.innerText.trim());
    });

    const rows = [];
    table.querySelectorAll("tbody tr").forEach(tr => {
        const cells = [];
        tr.querySelectorAll("td").forEach(td => {
            cells.push(td.innerText.trim());
        });
        if (cells.length === headers.length) {
            rows.push(cells);
        }
    });

    if (!rows.length) {
        showToast("Bảng nhật ký đang trống", "error");
        return;
    }

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: 40,
        theme: "grid",
        headStyles: {
            fillColor: [30, 41, 59],
            textColor: [56, 189, 248],
            fontStyle: "bold",
            fontSize: 9,
            halign: "left"
        },
        bodyStyles: {
            fillColor: [15, 23, 42],
            textColor: [203, 213, 225],
            fontSize: 8.5,
            cellPadding: 4
        },
        alternateRowStyles: {
            fillColor: [26, 37, 64]
        },
        styles: {
            lineColor: [56, 189, 248],
            lineWidth: 0.15,
            overflow: "linebreak"
        },
        margin: { left: 14, right: 14 },
        didDrawPage: (data) => {
            // Footer mỗi trang
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text(
                `Trang ${data.pageNumber} / ${pageCount}`,
                283, 200, { align: "right" }
            );
            doc.text("SmartHome Admin System", 14, 200);
        }
    });

    doc.save(`SmartHome_NhatKy_${now.toISOString().slice(0, 10)}.pdf`);
    showToast("Da xuat file PDF thanh cong!", "success");
}

// ============================================================
// ZONES MODULE
// ============================================================

/**
 * Load tất cả zones → cache + render accordion + populate floor filter
 */
async function loadZones() {
    try {
        const res = await fetch(`${API}/zones/`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            allZonesCache = [];
            renderZonesAccordion([]);
            populateFloorFilter([]);
            return;
        }

        const zones = await res.json();
        allZonesCache = zones;
        renderZonesAccordion(zones);
        populateFloorFilter(zones);
    } catch (err) {
        console.error("loadZones error:", err);
        allZonesCache = [];
    }
}

/**
 * Render zones dạng accordion nhóm theo tầng
 */
function renderZonesAccordion(zones) {
    const container = document.getElementById("zones-accordion");
    if (!container) return;

    if (!zones.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-building"></i>
                Chưa có khu vực nào. Hãy tạo khu vực mới bằng form bên trên.
            </div>`;
        return;
    }

    // Nhóm theo tầng
    const floors = [...new Set(zones.map(z => z.floor))].sort((a, b) => a - b);

    container.innerHTML = floors.map(floor => {
        const rooms = zones.filter(z => z.floor === floor);
        // Đếm thiết bị trên tầng này
        const devicesOnFloor = allDevicesCache.filter(d => {
            const z = allZonesCache.find(zone => zone.id === d.zone_id);
            return z && z.floor === floor;
        });

        return `
            <div class="zone-floor-group">
                <div class="zone-floor-header" onclick="this.parentElement.classList.toggle('open')">
                    <div class="zone-floor-title">
                        <i class="fas fa-layer-group"></i>
                        <span>Tầng ${floor}</span>
                        <span class="badge">${rooms.length} phòng</span>
                        <span class="badge" style="background:rgba(16,185,129,0.12);color:var(--success);">${devicesOnFloor.length} thiết bị</span>
                    </div>
                    <div class="zone-floor-actions">
                        <button class="btn-trash" title="Xóa cả tầng ${floor}" onclick="event.stopPropagation(); deleteFloor(${floor})">
                            <i class="fas fa-trash"></i>
                        </button>
                        <i class="fas fa-chevron-down zone-chevron"></i>
                    </div>
                </div>
                <div class="zone-floor-body">
                    ${rooms.map(z => {
                        const devCount = allDevicesCache.filter(d => d.zone_id === z.id).length;
                        return `
                            <div class="zone-room-item">
                                <div class="zone-room-info">
                                    <i class="fas fa-door-open"></i>
                                    <span class="zone-room-name">${escapeHtml(z.room)}</span>
                                    <span class="zone-device-count">${devCount} thiết bị</span>
                                </div>
                                <div style="display:flex;gap:8px;">
                                    <button class="btn-secondary" title="Sửa phòng" onclick="editZone(${z.id})">
                                        <i class="fas fa-pen"></i>
                                    </button>

                                    <button class="btn-trash" title="Xóa phòng" onclick="deleteZone(${z.id}, '${escapeHtml(z.room)}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        `;
    }).join("");
}

/**
 * Populate floor filter dropdown trên Dashboard
 */
function populateFloorFilter(zones) {
    const select = document.getElementById("floor-filter");
    if (!select) return;

    const floors = [...new Set(zones.map(z => z.floor))].sort((a, b) => a - b);
    select.innerHTML = `
        <option value="all"><i class="fas fa-globe"></i> Tất cả khu vực</option>
        ${floors.map(f => `<option value="${f}" ${currentFloorFilter == f ? "selected" : ""}>Tầng ${f}</option>`).join("")}
    `;
}

/**
 * Xử lý filter theo tầng trên Dashboard
 */
function filterByFloor(value) {
    currentFloorFilter = value;
    loadDevices();
}

/**
 * Tạo zone mới → POST /api/v1/zones/
 */
async function createZone() {
    const floorInput = document.getElementById("zone-floor");
    const roomInput  = document.getElementById("zone-room");

    const floor = parseInt(floorInput.value, 10);
    const room  = roomInput.value.trim();

    if (isNaN(floor) || floor < 0) {
        showToast("Vui lòng nhập số tầng hợp lệ", "error");
        return;
    }
    if (!room) {
        showToast("Vui lòng nhập tên phòng", "error");
        return;
    }

    try {
        const res = await fetch(`${API}/zones/`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ floor, room })
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(errText);
            showToast("Không thể tạo khu vực", "error");
            return;
        }

        showToast(`Đã tạo: Tầng ${floor} – ${room}`, "success");
        floorInput.value = "";
        roomInput.value = "";
        await loadZones();

    } catch (err) {
        console.error("createZone error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}

/**
 * Xóa 1 zone → DELETE /api/v1/zones/{zone_id}
 */
async function deleteZone(zoneId, roomName = "") {
    if (!confirm(`Xóa phòng "${roomName}"?\n(Chỉ xóa được nếu phòng không còn thiết bị)`)) return;

    try {
        const res = await fetch(`${API}/zones/${zoneId}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.detail || "Không thể xóa phòng (có thể còn thiết bị)", "error");
            return;
        }

        showToast(`Đã xóa phòng "${roomName}"`, "success");
        await loadZones();

    } catch (err) {
        console.error("deleteZone error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}

/**
 * Xóa cả tầng → DELETE /api/v1/zones/floor/{floor}
 */
async function deleteFloor(floor) {
    if (!confirm(`Xóa TẤT CẢ phòng trên Tầng ${floor}?\n(Chỉ xóa được nếu không còn thiết bị nào)`)) return;

    try {
        const res = await fetch(`${API}/zones/floor/${floor}`, {
            method: "DELETE",
            headers: authHeaders()
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            showToast(errData.detail || "Không thể xóa tầng (có thể còn thiết bị)", "error");
            return;
        }

        showToast(`Đã xóa tất cả phòng trên Tầng ${floor}`, "success");
        await loadZones();

    } catch (err) {
        console.error("deleteFloor error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}
window.addMember = addMember;
// ============================================================
// EDIT / INIT HELPERS
// ============================================================

function ensureEditModal() {
    if (document.getElementById("edit-modal")) return;

    const style = document.createElement("style");
    style.innerHTML = `
        .edit-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            background: rgba(2, 6, 23, 0.72);
            display: none;
            align-items: center;
            justify-content: center;
            padding: 24px;
        }

        .edit-modal-overlay.active {
            display: flex;
        }

        .edit-modal-box {
            width: min(760px, 96vw);
            max-height: 92vh;
            overflow-y: auto;
            background: #0f172a;
            border: 1px solid rgba(56, 189, 248, .25);
            border-radius: 18px;
            box-shadow: 0 24px 80px rgba(0,0,0,.5);
            color: #e5e7eb;
        }

        .edit-modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 18px 22px;
            border-bottom: 1px solid rgba(148, 163, 184, .16);
        }

        .edit-modal-header h3 {
            margin: 0;
            color: #38bdf8;
            font-size: 20px;
        }

        .edit-modal-close {
            border: none;
            background: rgba(239,68,68,.14);
            color: #fca5a5;
            border-radius: 10px;
            padding: 8px 12px;
            cursor: pointer;
        }

        .edit-modal-body {
            padding: 20px 22px;
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 16px;
        }

        .edit-modal-field.full {
            grid-column: 1 / -1;
        }

        .edit-modal-field label {
            display: block;
            margin-bottom: 8px;
            color: #cbd5e1;
            font-weight: 600;
            font-size: 14px;
        }

        .edit-modal-field input,
        .edit-modal-field select {
            width: 100%;
            padding: 12px 14px;
            background: #020617;
            color: #e5e7eb;
            border: 1px solid rgba(148, 163, 184, .25);
            border-radius: 12px;
            outline: none;
        }

        .edit-modal-field input:focus,
        .edit-modal-field select:focus {
            border-color: #38bdf8;
            box-shadow: 0 0 0 3px rgba(56,189,248,.12);
        }

        .edit-modal-error {
            grid-column: 1 / -1;
            min-height: 20px;
            color: #fca5a5;
            font-size: 14px;
        }

        .edit-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            padding: 16px 22px 22px;
            border-top: 1px solid rgba(148, 163, 184, .16);
        }

        @media (max-width: 720px) {
            .edit-modal-body {
                grid-template-columns: 1fr;
            }

            .edit-modal-field.full {
                grid-column: auto;
            }
        }
    `;
    document.head.appendChild(style);

    const modal = document.createElement("div");
    modal.id = "edit-modal";
    modal.className = "edit-modal-overlay";
    modal.innerHTML = `
        <div class="edit-modal-box">
            <div class="edit-modal-header">
                <h3 id="edit-modal-title">Chỉnh sửa</h3>

                <button class="edit-modal-close" type="button" onclick="closeEditModal()">
                    <i class="fas fa-xmark"></i>
                </button>
            </div>

            <form id="edit-modal-form">
                <div class="edit-modal-body" id="edit-modal-body"></div>

                <div class="edit-modal-footer">
                    <button class="btn-ghost" type="button" onclick="closeEditModal()">
                        Huỷ
                    </button>

                    <button class="btn-primary" type="submit">
                        <i class="fas fa-save"></i> Lưu thay đổi
                    </button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", e => {
        if (e.target === modal) closeEditModal();
    });
}

function closeEditModal() {
    const modal = document.getElementById("edit-modal");
    if (modal) modal.classList.remove("active");
}

function openEditModal({ title, fields, onSubmit }) {
    ensureEditModal();

    const modal = document.getElementById("edit-modal");
    const titleEl = document.getElementById("edit-modal-title");
    const body = document.getElementById("edit-modal-body");
    const form = document.getElementById("edit-modal-form");

    titleEl.innerText = title;

    body.innerHTML = fields.map(field => {
        const fullClass = field.full ? " full" : "";
        const required = field.required ? "required" : "";
        const min = field.min !== undefined ? `min="${field.min}"` : "";
        const max = field.max !== undefined ? `max="${field.max}"` : "";
        const step = field.step !== undefined ? `step="${field.step}"` : "";
        const placeholder = field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : "";
        const value = field.value ?? "";

        let control = "";

        if (field.type === "select") {
            control = `
                <select id="${field.id}" ${required}>
                    ${(field.options || []).map(opt => `
                        <option value="${escapeHtml(opt.value)}" ${String(opt.value) === String(value) ? "selected" : ""}>
                            ${escapeHtml(opt.label)}
                        </option>
                    `).join("")}
                </select>
            `;
        } else {
            control = `
                <input
                    id="${field.id}"
                    type="${field.type || "text"}"
                    value="${escapeHtml(value)}"
                    ${required}
                    ${min}
                    ${max}
                    ${step}
                    ${placeholder}
                />
            `;
        }

        return `
            <div class="edit-modal-field${fullClass}">
                <label for="${field.id}">${field.label}</label>
                ${control}
            </div>
        `;
    }).join("") + `<div class="edit-modal-error" id="edit-modal-error"></div>`;

    form.onsubmit = async e => {
        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        const errBox = document.getElementById("edit-modal-error");

        errBox.innerText = "";
        submitBtn.disabled = true;

        const values = {};
        fields.forEach(field => {
            const el = document.getElementById(field.id);
            values[field.id] = el ? el.value : "";
        });

        try {
            await onSubmit(values, errBox);
        } finally {
            submitBtn.disabled = false;
        }
    };

    modal.classList.add("active");
}

function getZoneOptions() {
    return allZonesCache
        .slice()
        .sort((a, b) => a.floor - b.floor || String(a.room).localeCompare(String(b.room)))
        .map(z => ({
            value: z.id,
            label: `Tầng ${z.floor} - ${z.room}`
        }));
}

function getDeviceOptions(type) {
    return allDevicesCache
        .filter(d => !type || String(d.type).toLowerCase() === type)
        .map(d => ({
            value: d.id,
            label: `${d.name}${getZoneLabel(d.zone_id) ? " · " + getZoneLabel(d.zone_id) : ""}`
        }));
}

function normalizeDateInput(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
}

function normalizeTimeInput(value) {
    if (!value) return "";
    return String(value).slice(0, 5);
}

async function initSettingDevice(settingId, deviceId, settingKind = "setting") {
    const res = await fetch(`${API}/settings/${settingId}/apply/${deviceId}`, {
        method: "POST",
        headers: authHeaders()
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error(`initSettingDevice ${settingKind} failed:`, errText);
        showToast(`Cập nhật ${settingKind} thành công nhưng gắn thiết bị thất bại`, "error");
        return false;
    }

    return true;
}

// ============================================================
// EDIT ZONE
// Sửa được: floor, room
// ============================================================
async function editZone(zoneId) {
    const zone = allZonesCache.find(z => z.id == zoneId);

    if (!zone) {
        showToast("Không tìm thấy khu vực", "error");
        return;
    }

    openEditModal({
        title: "Chỉnh sửa khu vực",

        fields: [
            {
                id: "floor",
                label: "Số tầng",
                type: "number",
                value: zone.floor,
                min: 0,
                required: true
            },
            {
                id: "room",
                label: "Tên phòng",
                type: "text",
                value: zone.room,
                required: true
            }
        ],

        onSubmit: async (values, errBox) => {
            const payload = {
                floor: Number(values.floor),
                room: values.room.trim()
            };

            if (Number.isNaN(payload.floor) || payload.floor < 0 || !payload.room) {
                errBox.innerText = "Tầng hoặc tên phòng không hợp lệ";
                return;
            }

            const res = await fetch(`${API}/zones/${zoneId}`, {
                method: "PUT",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                errBox.innerText = await res.text();
                return;
            }

            closeEditModal();
            showToast("Đã cập nhật khu vực", "success");

            await loadZones();
            await loadDevices();
        }
    });
}

// ============================================================
// EDIT DEVICE
// Sửa được: name, feed_id, zone_id
// Không sửa type vì BE update device không nhận type
// ============================================================
async function editDevice(deviceId) {
    const device = allDevicesCache.find(d => d.id == deviceId);

    if (!device) {
        showToast("Không tìm thấy thiết bị", "error");
        return;
    }

    if (!allZonesCache.length) {
        await loadZones();
    }

    openEditModal({
        title: "Chỉnh sửa thiết bị",

        fields: [
            {
                id: "name",
                label: "Tên thiết bị",
                type: "text",
                value: device.name,
                required: true
            },
            {
                id: "feed_id",
                label: "Feed ID",
                type: "text",
                value: device.feed_id,
                required: true
            },
            {
                id: "zone_id",
                label: "Khu vực",
                type: "select",
                value: device.zone_id,
                required: true,
                options: getZoneOptions(),
                full: true
            }
        ],

        onSubmit: async (values, errBox) => {
            const payload = {
                name: values.name.trim(),
                feed_id: values.feed_id.trim(),
                zone_id: Number(values.zone_id)
            };

            if (!payload.name || !payload.feed_id || !payload.zone_id) {
                errBox.innerText = "Tên thiết bị, feed ID hoặc khu vực không hợp lệ";
                return;
            }

            const res = await fetch(`${API}/devices/${deviceId}`, {
                method: "PUT",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                errBox.innerText = await res.text();
                return;
            }

            closeEditModal();
            showToast("Đã cập nhật thiết bị", "success");

            await loadDevices();
            await loadThresholdDevices();
            await loadScheduleDevices();
        }
    });
}

// ============================================================
// EDIT THRESHOLD
// Sửa được:
// name, sensor áp dụng, target device, value, condition, action
// ============================================================
async function editThreshold(settingId) {
    let item = allThresholdsCache.find(t => (t.setting_id || t.id) == settingId);

    if (!item) {
        try {
            const res = await fetch(`${API}/settings/thresholds/${settingId}`, {
                method: "GET",
                headers: authHeaders()
            });

            if (res.ok) {
                item = await res.json();
            }
        } catch (_) {}
    }

    if (!item) {
        showToast("Không tìm thấy ngưỡng", "error");
        return;
    }

    if (!allDevicesCache.length) {
        await loadDevices();
    }

    const oldSensorId =
        item.sensor_id ||
        item.device_id ||
        thresholdSensorMap[settingId] ||
        "";

    const oldTargetId =
        item.target_device_id ||
        thresholdTargetMap[settingId] ||
        "";

    openEditModal({
        title: "Chỉnh sửa ngưỡng tự động",

        fields: [
            {
                id: "name",
                label: "Tên setting",
                type: "text",
                value: item.name,
                required: true,
                full: true
            },
            {
                id: "sensor_id",
                label: "Cảm biến áp dụng",
                type: "select",
                value: oldSensorId,
                required: true,
                options: getDeviceOptions("sensor")
            },
            {
                id: "target_device_id",
                label: "Thiết bị phản ứng",
                type: "select",
                value: oldTargetId,
                required: true,
                options: getDeviceOptions("controller")
            },
            {
                id: "value",
                label: "Giá trị ngưỡng",
                type: "number",
                value: item.value,
                step: "0.1",
                required: true
            },
            {
                id: "condition",
                label: "Điều kiện",
                type: "select",
                value: String(Boolean(item.condition)),
                required: true,
                options: [
                    { value: "true", label: "Lớn hơn hoặc bằng" },
                    { value: "false", label: "Nhỏ hơn hoặc bằng" }
                ]
            },
            {
                id: "action",
                label: "Hành động",
                type: "select",
                value: String(item.action || "ON").toUpperCase(),
                required: true,
                options: [
                    { value: "ON", label: "Bật" },
                    { value: "OFF", label: "Tắt" }
                ]
            }
        ],

        onSubmit: async (values, errBox) => {
            const sensorId = Number(values.sensor_id);

            const payload = {
                name: values.name.trim(),
                action: values.action,
                value: Number(values.value),
                condition: values.condition === "true",
                target_device_id: Number(values.target_device_id),
                type: "threshold"
            };

            if (
                !payload.name ||
                Number.isNaN(payload.value) ||
                !sensorId ||
                !payload.target_device_id
            ) {
                errBox.innerText = "Thông tin ngưỡng không hợp lệ";
                return;
            }

            const res = await fetch(`${API}/settings/thresholds/${settingId}`, {
                method: "PUT",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                errBox.innerText = await res.text();
                return;
            }

            const ok = await initSettingDevice(settingId, sensorId, "threshold");
            if (!ok) return;

            thresholdSensorMap[settingId] = sensorId;
            thresholdTargetMap[settingId] = payload.target_device_id;

            localStorage.setItem("thresholdSensorMap", JSON.stringify(thresholdSensorMap));
            localStorage.setItem("thresholdTargetMap", JSON.stringify(thresholdTargetMap));

            closeEditModal();
            showToast("Đã cập nhật ngưỡng", "success");

            await loadThresholdsCache();
            await loadThresholds();
            await loadDevices();
        }
    });
}

// ============================================================
// EDIT SCHEDULE
// Sửa được:
// name, device áp dụng, date_start, date_end, time_start, timer, action
// ============================================================
async function editSchedule(settingId) {
    let item = null;

    try {
        const res = await fetch(`${API}/settings/schedules/${settingId}`, {
            method: "GET",
            headers: authHeaders()
        });

        if (res.ok) {
            item = await res.json();
        }
    } catch (err) {
        console.warn("Không lấy được schedule chi tiết:", err);
    }

    if (!item) {
        showToast("Không tìm thấy lịch", "error");
        return;
    }

    if (!allDevicesCache.length) {
        await loadDevices();
    }

    const oldDeviceId =
        item.target_device_id ||
        item.device_id ||
        scheduleDeviceMap[settingId] ||
        "";

    openEditModal({
        title: "Chỉnh sửa lịch hẹn giờ",

        fields: [
            {
                id: "name",
                label: "Tên setting",
                type: "text",
                value: item.name,
                required: true,
                full: true
            },
            {
                id: "device_id",
                label: "Thiết bị áp dụng",
                type: "select",
                value: oldDeviceId,
                required: true,
                options: getDeviceOptions("controller"),
                full: true
            },
            {
                id: "date_start",
                label: "Ngày bắt đầu",
                type: "date",
                value: normalizeDateInput(item.date_start) || new Date().toISOString().slice(0, 10),
                required: true
            },
            {
                id: "date_end",
                label: "Ngày kết thúc",
                type: "date",
                value: normalizeDateInput(item.date_end),
                placeholder: "Để trống nếu không có"
            },
            {
                id: "time_start",
                label: "Giờ bắt đầu",
                type: "time",
                value: normalizeTimeInput(item.time_start),
                required: true
            },
            {
                id: "timer",
                label: "Timer / thời lượng phút",
                type: "number",
                value: item.timer ?? "",
                min: 1,
                placeholder: "VD: 30"
            },
            {
                id: "action",
                label: "Hành động bắt đầu",
                type: "select",
                value: String(item.action || "ON").toUpperCase(),
                required: true,
                options: [
                    { value: "ON", label: "Bật" },
                    { value: "OFF", label: "Tắt" }
                ]
            }
        ],

        onSubmit: async (values, errBox) => {
            const deviceId = Number(values.device_id);

            const payload = {
                name: values.name.trim(),
                action: values.action,
                date_start: values.date_start,
                date_end: values.date_end || null,
                time_start: values.time_start.length === 5
                    ? values.time_start + ":00"
                    : values.time_start,
                timer: values.timer ? Number(values.timer) : null,
                type: "schedule"
            };

            if (
                !payload.name ||
                !deviceId ||
                !payload.date_start ||
                !payload.time_start ||
                !["ON", "OFF"].includes(payload.action)
            ) {
                errBox.innerText = "Thông tin lịch không hợp lệ";
                return;
            }

            if (payload.date_end && payload.date_end < payload.date_start) {
                errBox.innerText = "Ngày kết thúc không được nhỏ hơn ngày bắt đầu";
                return;
            }

            if (payload.timer !== null && (Number.isNaN(payload.timer) || payload.timer <= 0)) {
                errBox.innerText = "Timer phải là số phút lớn hơn 0";
                return;
            }

            const res = await fetch(`${API}/settings/schedules/${settingId}`, {
                method: "PUT",
                headers: authHeaders({ "Content-Type": "application/json" }),
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                errBox.innerText = await res.text();
                return;
            }

            const ok = await initSettingDevice(settingId, deviceId, "schedule");
            if (!ok) return;

            saveScheduleDeviceMap(settingId, deviceId);

            closeEditModal();
            showToast("Đã cập nhật lịch", "success");

            await loadSchedules();
        }
    });
}
// ============================================================
// INIT
// ============================================================
window.addEventListener("load", async () => {
    // Kiểm tra quyền
    if (!checkAuth()) return;
    applyPermissions(getRole());

    // Load zones + thresholds cache TRƯỚC (cần cho device cards + cảnh báo)
    await Promise.all([loadZones(), loadThresholdsCache()]);

    loadReportChart();
    loadReportSummary();
    await loadDevices();

    const scheduleDateStartInput = document.getElementById("schedule-date-start");
    if (scheduleDateStartInput && !scheduleDateStartInput.value) {
        scheduleDateStartInput.value = new Date().toISOString().slice(0, 10);
    }

    // Sau khi devices đã load → scheduler + logs + members
    fetchLogs();
    loadScheduleDevices();
    loadSchedules();
    loadMembers();
});
// Polling
setInterval(loadDevices, POLL_INTERVAL_MS);
setInterval(loadReportChart, 10000);
setInterval(loadReportSummary, 30000);
//setInterval(loadThresholdsCache, 30000);


