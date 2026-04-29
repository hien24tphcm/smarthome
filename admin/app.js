// ============================================================
// SmartHome Admin
// ============================================================
const API = "http://localhost:8000/api/v1";
const POLL_INTERVAL_MS = 7000; // tự cập nhật sensor mỗi 7s

// ============================================================
// AUTH & PERMISSIONS
// ============================================================
function getToken() {
    return localStorage.getItem("token");
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
        localStorage.removeItem("token");
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
            localStorage.removeItem("token");
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
        const sensors     = devices.filter(d => (d.type || "").toLowerCase() === "sensor");
        const controllers = devices.filter(d => (d.type || "").toLowerCase() === "controller");

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
                    </div>
                    <button class="btn-trash" title="Xoá thiết bị" onclick="deleteDevice(${d.id}, '${escapeHtml(d.name)}')">
                        <i class="fas fa-trash"></i>
                    </button>
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
        return `
            <div class="device-card controller-card" data-id="${d.id}">
                <div class="card-header">
                    <div class="card-icon"><i class="fas ${icon}"></i></div>
                    <div class="card-title-area">
                        <div class="card-title">${escapeHtml(d.name)}</div>
                        <div class="card-feed">${escapeHtml(d.feed_id)}</div>
                    </div>
                    <button class="btn-trash" title="Xoá thiết bị" onclick="deleteDevice(${d.id}, '${escapeHtml(d.name)}')">
                        <i class="fas fa-trash"></i>
                    </button>
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
// MODAL THÊM THIẾT BỊ
// ============================================================
function openAddDeviceModal() {
    document.getElementById("add-device-modal").classList.add("active");
    document.getElementById("device-name").value  = "";
    document.getElementById("device-feed").value  = "";
    document.getElementById("modal-error").innerText = "";
    loadZonesForModal();
    setTimeout(() => document.getElementById("device-name").focus(), 100);
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
            // Nếu chưa có zone, vẫn cho phép gõ tay (fallback)
            select.innerHTML = `<option value="1">Zone mặc định (id=1)</option>`;
            return;
        }
        const zones = await res.json();
        if (!zones.length) {
            select.innerHTML = `<option value="1">Zone mặc định (id=1)</option>`;
            return;
        }
        select.innerHTML = zones.map(z =>
            `<option value="${z.id}">Tầng ${z.floor} – ${escapeHtml(z.room)}</option>`
        ).join("");
    } catch (err) {
        console.error("loadZones error:", err);
        select.innerHTML = `<option value="1">Zone mặc định (id=1)</option>`;
    }
}

// ============================================================
// ADD DEVICE (CREATE)
// ============================================================
async function addDevice() {
    const errBox  = document.getElementById("modal-error");
    const name    = document.getElementById("device-name").value.trim();
    const feed_id = document.getElementById("device-feed").value.trim();
    const type    = document.getElementById("device-type").value;
    const zoneVal = document.getElementById("device-zone").value;

    errBox.innerText = "";

    if (!name || !feed_id) {
        errBox.innerText = "Vui lòng nhập đầy đủ Tên thiết bị và Feed Key.";
        return;
    }
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
    const sensorId = document.getElementById("threshold-sensor").value;
    const value = document.getElementById("threshold-value").value;
    const condition = document.getElementById("threshold-condition").value;
    const targetDeviceId = document.getElementById("threshold-target-device").value;
    const action = document.getElementById("threshold-action").value;

    if (!sensorId || !value || !targetDeviceId) {
        showToast("Vui lòng nhập đầy đủ thông tin", "error");
        return;
    }

    const sensor = allDevicesCache.find(d => d.id == sensorId);

    const payload = {
        name: sensor ? sensor.name : "Threshold Rule",
        action: String(action).toUpperCase(),
        value: Number(value),
        condition: condition === "true",
        target_device_id: Number(targetDeviceId),
        type: "threshold"
    };

    try {
        const res = await fetch(`${API}/settings/thresholds`, {
            method: "POST",
            headers: authHeaders({
                "Content-Type": "application/json"
            }),
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error(errText);
            showToast("Không thể lưu ngưỡng", "error");
            return;
        }

        // lấy threshold vừa tạo
        const createdThreshold = await res.json();

        console.log("CREATED THRESHOLD =", createdThreshold);

        const settingId =
            createdThreshold.setting_id ||
            createdThreshold.id;

        console.log("SETTING ID =", settingId);
        console.log("SENSOR ID =", sensorId);


        const applyRes = await fetch(
            `${API}/settings/${settingId}/apply/${sensorId}`,
            {
                method: "POST",
                headers: authHeaders()
            }
        );

        if (!applyRes.ok) {
            const errText = await applyRes.text();
            console.error(errText);
            showToast("Tạo ngưỡng thành công nhưng APPLY thất bại", "error");
            return;
        }

        showToast("Đã tạo và áp dụng ngưỡng thành công", "success");

        document.getElementById("threshold-value").value = "";

        await loadThresholds();

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

    tbody.innerHTML = `
        <tr>
            <td colspan="5">Đang tải dữ liệu...</td>
        </tr>
    `;

    try {
        const res = await fetch(`${API}/settings/thresholds`, {
            method: "GET",
            headers: authHeaders()
        });

        if (!res.ok) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">Chưa có dữ liệu</td>
                </tr>
            `;
            return;
        }

        const thresholds = await res.json();

        if (!thresholds.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5">Chưa có ngưỡng nào</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = thresholds.map(item => {
            const target = allDevicesCache.find(
                d => d.id == item.target_device_id
            );

            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>
                        ${item.condition ? "≥" : "≤"} ${item.value}
                    </td>
                    <td>
                        ${target ? escapeHtml(target.name) : "N/A"}
                    </td>
                    <td>
                        ${String(item.action).toUpperCase() === "ON"
                            ? "Bật"
                            : "Tắt"}
                    </td>
                    <td>
                        <button
                            class="btn-trash"
                            onclick="deleteThreshold(${item.setting_id})"
                        >
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("loadThresholds error:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5">Lỗi tải dữ liệu</td>
            </tr>
        `;
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

        showToast("Đã xóa ngưỡng thành công", "success");
        loadThresholds();

    } catch (err) {
        console.error("deleteThreshold error:", err);
        showToast("Lỗi kết nối server", "error");
    }
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

// ============================================================
// SCHEDULER MODULE
// ============================================================

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

/**
 * Lưu schedule mới 
 */
async function saveSchedule() {
    const deviceId = document.getElementById("schedule-device").value;
    const timeVal  = document.getElementById("schedule-time").value; // "HH:MM"
    const action   = document.getElementById("schedule-action").value;

    if (!deviceId || !timeVal) {
        showToast("Vui lòng chọn thiết bị và thời gian", "error");
        return;
    }

    // Tìm tên thiết bị từ cache
    const device = allDevicesCache.find(d => d.id == deviceId);

    // API ScheduleCreate cần: name, action, date_start (YYYY-MM-DD), time_start (HH:MM:SS)
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const payload = {
        name: device ? device.name : "Schedule",
        action: String(action).toUpperCase(),
        date_start: today,
        time_start: timeVal + ":00",          // "HH:MM:SS"
        target_device_id: Number(deviceId),
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

        // Apply cho thiết bị
        const applyRes = await fetch(
            `${API}/settings/${settingId}/apply/${deviceId}`,
            {
                method: "POST",
                headers: authHeaders()
            }
        );

        if (!applyRes.ok) {
            showToast("Tạo lịch thành công nhưng APPLY thất bại", "error");
        } else {
            showToast("Đã tạo và áp dụng lịch hẹn giờ", "success");
        }

        document.getElementById("schedule-time").value = "";
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
            <td colspan="5">
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
                <tr><td colspan="5">Chưa có dữ liệu</td></tr>
            `;
            return;
        }

        const schedules = await res.json();

        if (!schedules.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        <i class="fas fa-clock"></i>
                        Chưa có lịch hẹn giờ nào
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = schedules.map(item => {
            const target = allDevicesCache.find(
                d => d.id == item.target_device_id
            );

            // Xác định trạng thái dựa trên thời gian
            const timeDisplay = item.time_start || item.time || "--:--";
            const statusInfo = getScheduleStatus(timeDisplay);

            return `
                <tr>
                    <td>
                        <i class="fas ${target ? detectControllerIcon(target) : 'fa-plug'}"></i>
                        ${target ? escapeHtml(target.name) : "N/A"}
                    </td>
                    <td>
                        <i class="fas fa-clock"></i>
                        <strong>${escapeHtml(timeDisplay)}</strong>
                    </td>
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
                        <button
                            class="btn-trash"
                            onclick="deleteSchedule(${item.setting_id})"
                            title="Xóa lịch"
                        >
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (err) {
        console.error("loadSchedules error:", err);
        tbody.innerHTML = `
            <tr><td colspan="5">Lỗi tải dữ liệu</td></tr>
        `;
    }
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

        showToast("Đã xóa lịch hẹn giờ", "success");
        loadSchedules();

    } catch (err) {
        console.error("deleteSchedule error:", err);
        showToast("Lỗi kết nối server", "error");
    }
}


/**
 * Kiểm tra sensor có đang vượt ngưỡng nào không
 * So sánh value với danh sách thresholds đã cache
 */
function checkSensorAlert(sensor) {
    if (sensor.value === null || sensor.value === undefined) return false;
    const val = Number(sensor.value);

    // Tìm tất cả threshold liên quan đến sensor này 
    for (const t of allThresholdsCache) {
        // threshold.name thường là tên sensor đã dùng khi tạo
        if (t.name === sensor.name) {
            // condition: true = >=, false = <=
            if (t.condition && val >= t.value) return true;
            if (!t.condition && val <= t.value) return true;
        }
    }
    return false;
}

/**
 * Load thresholds cache (để dùng cho cảnh báo UI)
 */
async function loadThresholdsCache() {
    try {
        const res = await fetch(`${API}/settings/thresholds`, {
            method: "GET",
            headers: authHeaders()
        });
        if (res.ok) {
            allThresholdsCache = await res.json();
        }
    } catch (err) {
        console.error("loadThresholdsCache error:", err);
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

    // Lấy home_id từ JWT payload
    let homeId = null;
    try {
        const payload = JSON.parse(atob(getToken().split('.')[1]));
        homeId = payload.home_id || null;
    } catch (e) {
        console.warn("Không decode được JWT để lấy home_id");
    }

    const payload = {
        fname,
        lname,
        email,
        password,
        type,
        home_id: homeId
    };

    try {
        const res = await fetch(`${API}/users/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const msg = errData.detail || "Không thể tạo thành viên";
            showToast(String(msg), "error");
            return;
        }

        const newUser = await res.json();
        showToast(`Đã thêm thành viên ${newUser.fname} ${newUser.lname}`, "success");

        // Lưu email vào danh sách để hiển thị
        if (!membersList.includes(email)) {
            membersList.push(email);
            localStorage.setItem("membersList", JSON.stringify(membersList));
        }

        // Reset form
        document.getElementById("member-fname").value = "";
        document.getElementById("member-lname").value = "";
        document.getElementById("member-email").value = "";
        document.getElementById("member-password").value = "";

        await loadMembers();

    } catch (err) {
        console.error("addMember error:", err);
        showToast("Lỗi kết nối server", "error");
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
// INIT
// ============================================================
window.addEventListener("load", async () => {
    // Kiểm tra quyền
    if (!checkAuth()) return;
    applyPermissions(getRole());

    // Load threshold cache cho cảnh báo
    await loadThresholdsCache();

    loadReportChart();
    loadDevices();
    fetchLogs();
    loadScheduleDevices();
    loadSchedules();
    loadMembers();
});
// Polling
setInterval(loadDevices, POLL_INTERVAL_MS);
setInterval(loadReportChart, 30000);
setInterval(loadThresholdsCache, 30000);