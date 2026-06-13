// ==========================================
// 1. CẤU HÌNH VÀ KẾT NỐI BACKEND (API)
// ==========================================
const BASE_URL = "https://iot-smart-home-backend-production.up.railway.app/api/v1";

function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const API = {
    getHeaders: () => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            console.warn("Không tìm thấy token. Vui lòng đăng nhập.");
            if (!window.location.pathname.includes("login.html")) {
                window.location.href = "../auth/login.html"; 
            }
            return {};
        }
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        };
    },

    request: async (endpoint, options = {}) => {
        const url = `${BASE_URL}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...API.getHeaders(),
                    ...(options.headers || {})
                }
            });

            if (response.status === 401 || response.status === 403) {
                console.error("Phiên đăng nhập hết hạn.");
                API.logout();
                const error = new Error("Unauthorized");
                error.status = response.status;
                throw error;
            }

            let data;
            try { data = await response.json(); } 
            catch (parseError) { data = null; }

            if (!response.ok) {
                const message = data?.detail || data?.message || response.statusText || "Lỗi kết nối đến server";
                const error = new Error(message);
                error.status = response.status;
                throw error;
            }

            return data;
        } catch (error) {
            console.error(`[API Error] ${endpoint}:`, error.message || error);
            throw error;
        }
    },

    getDevices: async () => {
        try { return await API.request("/devices/"); } 
        catch (error) {
            console.warn("Chưa có thiết bị, trả về mảng rỗng.");
            return [];
        }
    },
    toggleDevice: async (id, action) => await API.request(`/devices/${id}/toggle?action=${action}`, { method: "POST" }),
    setDeviceMode: async (id, mode) => await API.request(`/devices/${id}/mode?mode=${mode}`, { method: "POST" }),
    updateDeviceMode: async (id, mode) => await API.setDeviceMode(id, mode),
    setDeviceSpeed: async (id, speed) => await API.request(`/devices/${id}/speed?speed=${speed}`, { method: "POST" }),
    getDeviceState: async (id) => await API.request(`/devices/${id}/state`),
    getDeviceHistory: async (id, limit = 50) => {
        try { return await API.request(`/devices/${id}/history?limit=${limit}`); } 
        catch (e) { return []; }
    },
    getZones: async () => {
        try { return await API.request("/zones/"); } 
        catch (e) { return []; }
    },
    getLogs: async (limit = 50) => {
        return await API.request(`/logs/?limit=${limit}`);
    },

    getSchedules: async () => {
        const schedulesPaths = ["/settings/schedules", "/settings/schedules/"];
        for (const path of schedulesPaths) {
            try {
                const res = await API.request(path);
                return Array.isArray(res) ? res : (res ? [res] : []);
            } catch (e) {
                if (e.status === 404) continue;
                return [];
            }
        }
        return [];
    },
    getAllSchedules: async () => {
        try {
            const res = await API.request('/settings/schedules');
            if (Array.isArray(res)) return res;
            if (res && Array.isArray(res.data)) return res.data;
            if (res && Array.isArray(res.results)) return res.results;
            return res ? [res] : [];
        } catch (e) { return []; }
    },
    getAllThresholds: async () => {
        try {
            const res = await API.request('/settings/thresholds');
            if (Array.isArray(res)) return res;
            if (res && Array.isArray(res.data)) return res.data;
            if (res && Array.isArray(res.results)) return res.results;
            return res ? [res] : [];
        } catch (e) { return []; }
    },
    getThresholds: async (deviceId) => {
        const thresholds = await API.getAllThresholds(); 
        if (!deviceId) return thresholds; 
        return thresholds.filter(t => t && (t.target_device_id === deviceId || t.target_device === deviceId || t.device_id === deviceId || t.id === deviceId));
    },

    logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("role");
        window.location.href = "../auth/login.html";
    }
};

// ==========================================
// 2. XỬ LÝ GIAO DIỆN & SỰ KIỆN (DOM)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // --- XỬ LÝ SIDEBAR ---
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
    }

    // --- LỜI CHÀO ---
    const greetingElement = document.getElementById('greeting-text');
    if (greetingElement) {
        const currentHour = new Date().getHours();
        if (currentHour >= 5 && currentHour < 11) greetingElement.innerHTML = 'Chào buổi sáng, ⛅';
        else if (currentHour >= 11 && currentHour < 14) greetingElement.innerHTML = 'Chào buổi trưa, ☀️';
        else if (currentHour >= 14 && currentHour < 18) greetingElement.innerHTML = 'Chào buổi chiều, 🌤️';
        else greetingElement.innerHTML = 'Chào buổi tối, 🌙';
    }

    // --- THÔNG BÁO ---
    const notifBell = document.getElementById('notif-bell');
    const notifDropdown = document.getElementById('notif-dropdown');
    const notifList = document.getElementById('notif-list');

    if (notifBell && notifDropdown && notifList) {
        notifBell.addEventListener('click', async (e) => {
            e.stopPropagation();
            const isShowing = notifDropdown.style.display === 'block';
            notifDropdown.style.display = isShowing ? 'none' : 'block';
            
            if (!isShowing) {
                notifList.innerHTML = '<div style="text-align:center; padding:15px; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';
                try {
                    const logs = await API.getLogs(5);
                    notifList.innerHTML = '';
                    
                    if (!logs || logs.length === 0) {
                        notifList.innerHTML = '<div style="padding:15px;text-align:center;color:var(--text-secondary);">Không có thông báo mới</div>';
                        return;
                    }
                    
                    logs.forEach(log => {
                        const descLowerCase = log.description ? log.description.toLowerCase() : '';
                        const isAlert = descLowerCase.includes('cảnh báo') || descLowerCase.includes('vượt ngưỡng') || descLowerCase.includes('deleted');
                        const icon = isAlert ? '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger-color);"></i>' : '<i class="fa-solid fa-circle-info" style="color: #4dacff;"></i>';
                        const timeValue = log.created_at || log.timestamp || log.createdAt || log.time;
                        let displayTime = 'Chưa có thời gian';
                        
                        if (timeValue) {
                            let safeString = String(timeValue);
                            if (safeString.includes('T') && !safeString.endsWith('Z') && !safeString.match(/[+-]\d{2}:\d{2}$/)) safeString += 'Z'; 
                            const dateObj = new Date(safeString);
                            if (!isNaN(dateObj.getTime())) {
                                displayTime = `${dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${dateObj.toLocaleDateString('vi-VN')}`; 
                            }
                        }

                        const safeDesc = escapeHtml(log.description || 'Hành động hệ thống');

                        notifList.innerHTML += `
                            <div class="notif-item" style="display: flex; gap: 12px; padding: 15px; border-bottom: 1px solid var(--border-color);">
                                <div style="font-size: 1.2rem; margin-top: 2px;">${icon}</div>
                                <div>
                                    <div style="line-height: 1.4; color: var(--text-primary); font-size: 0.95rem;">${safeDesc}</div>
                                    <small style="color:var(--text-secondary); margin-top:6px; display:flex; align-items: center; gap: 5px;"><i class="fa-regular fa-clock"></i> ${displayTime}</small>
                                </div>
                            </div>`;
                    });
                } catch (err) {
                    notifList.innerHTML = '<div style="padding:15px;text-align:center;color:var(--danger-color);">Lỗi tải thông báo</div>';
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (!notifBell.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.style.display = 'none';
            }
        });
    }

    // --- TÀI KHOẢN ---
    async function loadHeaderInfo() {
        try {
            const token = localStorage.getItem('access_token');
            let userEmail = "";
            if (token) {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const decoded = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join('')));
                userEmail = decoded.sub || decoded.email || ""; 
            }

            const resUser = await API.request(userEmail ? `/users/${userEmail}` : '/users/me');
            const userData = Array.isArray(resUser) ? resUser[0] : resUser;

            if (userData) {
                const homeNameEl = document.getElementById('home-name-text');
                if (homeNameEl && userData.home_name) homeNameEl.innerText = userData.home_name;
                const greetingEl = document.getElementById('greeting-text');
                if (greetingEl && userData.fname) greetingEl.innerHTML = greetingEl.innerHTML.replace(',', `, ${userData.fname}`);
            }
        } catch (error) { console.log("Giữ nguyên tên mặc định vì chưa lấy được dữ liệu nhà."); }
    }
    loadHeaderInfo();

    const themeToggle = document.getElementById('theme-toggle');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme') || 'dark';
    if (currentTheme === 'light') {
        body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeToggle.addEventListener('click', () => {
        body.classList.toggle('light-mode');
        if (body.classList.contains('light-mode')) {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
        } else {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fa-solid fa-moon"></i>';
        }
    });

    const loadingContainer = document.getElementById('loading-container');
    const sectionSensors = document.getElementById('section-sensors');
    const sectionControllers = document.getElementById('section-controllers');
    const sectionSettings = document.getElementById('section-settings');
    const sectionHistory = document.getElementById('section-history');
    const sectionProfile = document.getElementById('section-profile');
    
    const sensorContainer = document.getElementById('sensor-container');
    const chartsContainer = document.getElementById('charts-container');
    const controllerContainer = document.getElementById('controller-container');
    const filterBar = document.getElementById('room-filter-bar');
    
    const navHome = document.getElementById('nav-home');
    const navSettings = document.getElementById('nav-settings');
    const navHistory = document.getElementById('nav-history');
    const navProfile = document.getElementById('nav-profile');

    const filterDate = document.getElementById('filter-date');
    const filterType = document.getElementById('filter-type');
    const resetFilterBtn = document.getElementById('reset-filter');
    let allLogs = [];

    function setActiveMenu(link) {
        document.querySelectorAll('.menu a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
    }

    function hideAllSections() {
        if(sectionSensors) sectionSensors.style.display = 'none';
        if(sectionControllers) sectionControllers.style.display = 'none';
        if(sectionSettings) sectionSettings.style.display = 'none';
        if(sectionHistory) sectionHistory.style.display = 'none';
        if(sectionProfile) sectionProfile.style.display = 'none';
        if(filterBar) filterBar.style.display = 'none';
        if(loadingContainer) loadingContainer.style.display = 'none';
    }

    navHome.addEventListener('click', (e) => {
        e.preventDefault(); setActiveMenu(navHome); hideAllSections();
        sectionSensors.style.display = 'block'; sectionControllers.style.display = 'block'; filterBar.style.display = 'flex';
    });

    navSettings.addEventListener('click', (e) => { e.preventDefault(); setActiveMenu(navSettings); hideAllSections(); loadSettingsPage(); sectionSettings.style.display = 'block'; });
    navHistory.addEventListener('click', (e) => { e.preventDefault(); setActiveMenu(navHistory); hideAllSections(); sectionHistory.style.display = 'block'; loadSystemHistory(); });
    navProfile.addEventListener('click', (e) => { e.preventDefault(); setActiveMenu(navProfile); hideAllSections(); sectionProfile.style.display = 'block'; loadUserProfile(); });

    async function loadUserProfile() {
        const displayBox = document.getElementById('user-info-display');
        displayBox.innerHTML = '<p style="text-align: center; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> Đang tải thông tin...</p>';
        
        try {
            const token = localStorage.getItem('access_token');
            let userEmail = "";
            if (token) {
                const base64Url = token.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const decoded = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join('')));
                userEmail = decoded.sub || decoded.email || ""; 
            }

            const resUser = await API.request(userEmail ? `/users/${userEmail}` : '/users/me');
            const userData = Array.isArray(resUser) ? resUser[0] : resUser;

            if (userData) {
                const firstName = userData.fname || ""; const lastName = userData.lname || ""; const email = userData.email || "";
                let fullName = `${lastName} ${firstName}`.trim(); const displayName = fullName ? fullName : "Chưa cập nhật tên";
                const firstLetter = firstName ? firstName.charAt(0) : (email ? email.charAt(0) : "U");
                const letter = firstLetter.toUpperCase();
                const typeText = userData.type || userData.role || "Member";

                displayBox.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 20px; margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid var(--border-color);">
                        <div style="width: 70px; height: 70px; border-radius: 50%; background: #4dacff; color: white; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; box-shadow: 0 4px 10px rgba(77,172,255,0.3);">${letter}</div>
                        <div>
                            <h4 style="margin: 0 0 5px 0; font-size: 20px; color: var(--text-primary);">${displayName}</h4>
                            <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">${email}</p>
                        </div>
                    </div>
                    <div style="line-height: 2; color: var(--text-primary); font-size: 15px;">
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <span style="color: var(--text-secondary);"><i class="fa-solid fa-id-badge" style="width: 20px;"></i> Vai trò</span>
                            <strong style="text-transform: capitalize; color: #4dacff; background: rgba(77,172,255,0.1); padding: 2px 10px; border-radius: 6px;">${typeText}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);">
                            <span style="color: var(--text-secondary);"><i class="fa-solid fa-circle-check" style="width: 20px;"></i> Trạng thái</span>
                            <strong style="text-transform: capitalize; color: #4dacff;">${userData.status || 'Active'}</strong>
                        </div>
                        ${userData.home_id ? `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);"><span style="color: var(--text-secondary);"><i class="fa-solid fa-fingerprint" style="width: 20px;"></i> ID Nhà (Home ID)</span><strong>${userData.home_id}</strong></div>` : ''}
                        ${userData.home_name ? `<div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed rgba(255,255,255,0.05);"><span style="color: var(--text-secondary);"><i class="fa-solid fa-house" style="width: 20px;"></i> Tên nhà</span><strong>${userData.home_name}</strong></div>` : ''}
                    </div>
                    <div style="margin-top: 35px; text-align: center;">
                        <button onclick="API.logout()" style="padding: 12px 30px; background: var(--danger-color); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: bold; width: 100%; transition: opacity 0.2s;"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất hệ thống</button>
                    </div>`;
            } else { displayBox.innerHTML = '<p style="color: var(--danger-color); text-align:center;">Không thể lấy chi tiết tài khoản.</p>'; }
        } catch (err) { displayBox.innerHTML = `<div style="text-align:center;"><i class="fa-solid fa-triangle-exclamation" style="font-size: 40px; color: var(--danger-color); margin-bottom: 15px;"></i><p style="color: var(--text-secondary);">Lỗi kết nối hoặc phiên đăng nhập đã hết hạn.</p></div>`; }
    }

    // --- CÀI ĐẶT ---
    function formatSettingDate(dateStr) {
        if (!dateStr) return "--";
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return escapeHtml(dateStr);
    }

    function checkScheduleStatus(timeStr) {
        if (!timeStr) return { label: "--", icon: "", color: "var(--text-secondary)" };
        const now = new Date();
        const [hh, mm] = timeStr.split(':').map(Number);
        const schedMins = hh * 60 + mm;
        const curMins = now.getHours() * 60 + now.getMinutes();
        if (curMins >= schedMins) return { label: "Đã chạy", icon: "fa-solid fa-circle-check", color: "#10b981" };
        return { label: "Đang đợi", icon: "fa-solid fa-hourglass-half", color: "#f59e0b" };
    }

    async function loadSettingsPage() {
        const scheduleBody = document.getElementById('schedule-table-body');
        const thresholdBody = document.getElementById('threshold-table-body');
        
        if (!scheduleBody || !thresholdBody) return;

        scheduleBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Đang tải dữ liệu...</td></tr>`;
        thresholdBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-secondary);"><i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>Đang tải dữ liệu...</td></tr>`;

        try {
            const [schedules, thresholds, devices] = await Promise.all([
                API.getAllSchedules(), 
                API.getAllThresholds(), 
                API.getDevices()
            ]);
            const deviceMap = new Map((devices || []).map(d => [String(d.id), d])); 

            const scheduleDeviceMap = JSON.parse(localStorage.getItem("scheduleDeviceMap") || "{}");
            const thresholdTargetMap = JSON.parse(localStorage.getItem("thresholdTargetMap") || "{}");
            const thresholdSensorMap = JSON.parse(localStorage.getItem("thresholdSensorMap") || "{}");

            if (!schedules || schedules.length === 0) {
                scheduleBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-secondary);">Chưa có lịch hẹn giờ nào được thiết lập.</td></tr>`;
            } else {
                let schedHtml = '';
                schedules.forEach(s => {
                    const settingId = s.setting_id || s.id;
                    let devNames = '--';

                    const devs = Array.isArray(s.applied_devices) ? s.applied_devices : (Array.isArray(s.devices) ? s.devices : []);
                    if (devs.length > 0) {
                        devNames = devs.map(d => d.device_name || d.name || `--`).join(', ');
                    } else {
                        const mappedId = s.target_device_id || s.device_id || scheduleDeviceMap[settingId];
                        const target = mappedId ? deviceMap.get(String(mappedId)) : null;
                        if (target) devNames = target.name;
                        else if (mappedId) devNames = `ID ${mappedId}`;
                    }
                    
                    const isTurnOn = String(s.action).toUpperCase() === 'ON';
                    const actionText = isTurnOn ? 'Bật' : 'Tắt';
                    const actionColor = isTurnOn ? '#10b981' : '#ef4444';
                    const status = checkScheduleStatus(s.time_start);

                    schedHtml += `
                        <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 16px 20px; color: #e2e8f0;">${escapeHtml(s.name)}</td>
                            <td style="padding: 16px 20px;"><i class="fa-solid fa-calendar-check" style="margin-right: 6px; color:#94a3b8;"></i>${escapeHtml(devNames)}</td>
                            <td style="padding: 16px 20px;">${formatSettingDate(s.date_start)}</td>
                            <td style="padding: 16px 20px;">${formatSettingDate(s.date_end)}</td>
                            <td style="padding: 16px 20px;">
                                <div style="display:flex; flex-direction:column; align-items:flex-start;">
                                    <i class="fa-solid fa-clock" style="margin-bottom:4px; color:#cbd5e1;"></i>
                                    <strong style="color: #fff;">${escapeHtml(s.time_start) || '--:--'}</strong>
                                </div>
                            </td>
                            <td style="padding: 16px 20px;">${s.timer ? escapeHtml(String(s.timer)) + ' phút' : '--'}</td>
                            <td style="padding: 16px 20px; color: ${actionColor}; font-weight: 500;"><i class="fa-solid fa-power-off" style="margin-right: 4px;"></i>${actionText}</td>
                            <td style="padding: 16px 20px; color: ${status.color};"><i class="${status.icon}" style="margin-right: 4px;"></i>${status.label}</td>
                        </tr>
                    `;
                });
                scheduleBody.innerHTML = schedHtml;
            }

            if (!thresholds || thresholds.length === 0) {
                thresholdBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-secondary);">Chưa có ngưỡng tự động nào được thiết lập.</td></tr>`;
            } else {
                let threshHtml = '';
                thresholds.forEach(t => {
                    const settingId = t.setting_id || t.id;

                    const targetDeviceId = t.target_device_id || t.target_device || thresholdTargetMap[settingId];
                    const targetDevice = targetDeviceId ? deviceMap.get(String(targetDeviceId)) : null;
                    const targetText = targetDevice ? targetDevice.name : (targetDeviceId ? `ID ${targetDeviceId}` : `N/A`);
                    
                    let sensorText = '--';
                    const devs = Array.isArray(t.applied_devices) ? t.applied_devices : [];
                    if (devs.length > 0) {
                        sensorText = devs.map(d => d.device_name || d.name || `--`).join(', ');
                    } else {
                        const sensorId = t.sensor_id || t.device_id || thresholdSensorMap[settingId];
                        const sensorDevice = sensorId ? deviceMap.get(String(sensorId)) : null;
                        if (sensorDevice) sensorText = sensorDevice.name;
                        else if (sensorId) sensorText = `ID ${sensorId}`;
                    }

                    const isGreater = (t.condition === true || t.condition === 'true' || t.condition === '>=');
                    const condSymbol = isGreater ? '≥' : '≤';

                    const isTurnOn = String(t.action).toUpperCase() === 'ON';
                    const actionText = isTurnOn ? 'Bật' : 'Tắt';

                    threshHtml += `
                        <tr style="border-top: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 16px 20px; color: #e2e8f0;">${escapeHtml(t.name)}</td>
                            <td style="padding: 16px 20px;">${escapeHtml(sensorText)}</td>
                            <td style="padding: 16px 20px;">${condSymbol} ${escapeHtml(String(t.value))}</td>
                            <td style="padding: 16px 20px;">${escapeHtml(targetText)}</td>
                            <td style="padding: 16px 20px;">${actionText}</td>
                        </tr>
                    `;
                });
                thresholdBody.innerHTML = threshHtml;
            }

        } catch (error) {
            scheduleBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px; color: var(--danger-color);"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối khi tải lịch hẹn giờ.</td></tr>`;
            thresholdBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color: var(--danger-color);"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối khi tải ngưỡng tự động.</td></tr>`;
        }
    }

    const refreshSettingsBtn = document.getElementById('refresh-settings');
    if (refreshSettingsBtn) refreshSettingsBtn.addEventListener('click', loadSettingsPage);

    // ==========================================
    // DASHBOARD & QUẢN LÝ THIẾT BỊ
    // ==========================================
    const checkIsOn = (status) => { 
        if (status === true || status === 1) return true; 
        const strStatus = String(status || '').toUpperCase(); 
        return strStatus === 'ON' || strStatus === '1' || strStatus === 'TRUE'; 
    };

    function updateStatusUI(card, isOn) {
        const statusInd = card.querySelector('.status-indicator');
        const statusText = card.querySelector('.status-indicator span');
        if (!statusInd || !statusText) return;
        
        if (isOn) {
            statusInd.classList.remove('off'); statusInd.classList.add('on');
            statusText.innerText = 'BẬT';
        } else {
            statusInd.classList.remove('on'); statusInd.classList.add('off');
            statusText.innerText = 'TẮT';
        }
    }

    function getSpeedLevel(speed) {
        const val = Number(speed) || 0;
        if (val <= 0)  return 0;  
        if (val <= 40) return 1;  
        if (val <= 70) return 2;  
        return 3;                 
    }

    async function loadDashboard() {
        let zones = [], devices = [];
        try { [zones, devices] = await Promise.all([ API.getZones(), API.getDevices() ]); } 
        catch (e) { if(loadingContainer) loadingContainer.innerHTML = '<p style="color: var(--danger-color);">Lỗi kết nối Backend.</p>'; return; }
        
        if(loadingContainer) loadingContainer.style.display = 'none';

        const zoneMap = new Map();

        if (zones && zones.length > 0 && filterBar) {
            zones.forEach(zone => {
                const fullZoneName = zone.floor !== undefined ? `Tầng ${zone.floor} - ${zone.room}` : zone.room;
                zoneMap.set(zone.id, fullZoneName); 
                
                const btn = document.createElement('button');
                btn.className = 'filter-btn';
                btn.dataset.filter = `room-${zone.id}`;
                btn.innerText = fullZoneName; 
                filterBar.appendChild(btn);
            });
        }

        if(sectionSensors) sectionSensors.style.display = 'block'; 
        if(sectionControllers) sectionControllers.style.display = 'block';
        
        if(sensorContainer) sensorContainer.innerHTML = '';
        if(controllerContainer) controllerContainer.innerHTML = '';
        if(chartsContainer) chartsContainer.innerHTML = '';

        let hasSensor = false, hasController = false;

        if (devices && devices.length > 0) {
            devices.forEach(device => {
                const zoneName = zoneMap.get(device.zone_id) || `Phòng ID: ${device.zone_id}`;

                if (device.type === 'controller') {
                    hasController = true;
                    const isFan = device.name.toLowerCase().includes('quạt') || (device.feed_id && device.feed_id.toLowerCase().includes('fan')) || device.mode !== undefined || device.speed !== undefined;
                    if (isFan) renderFanCard(device, controllerContainer, zoneName); 
                    else renderLightCard(device, controllerContainer, zoneName);
                } else if (device.type === 'sensor') {
                    hasSensor = true;
                    renderSensorCard(device, sensorContainer, zoneName); 
                    renderSensorChart(device); 
                }
            });
        }

        if (!hasSensor) {
            renderEmptySensorCard('Nhiệt độ'); renderEmptySensorCard('Độ ẩm');
            renderEmptyChart('Nhiệt độ', 'fa-temperature-half', '#ff6b6b'); renderEmptyChart('Độ ẩm', 'fa-droplet', '#4dacff');
        }
        if (!hasController && controllerContainer) {
            controllerContainer.innerHTML = '<p class="empty-text widget-item" data-room="all">Chưa có thiết bị điều khiển nào được thêm vào hệ thống.</p>';
        }

        setupFilters();
        await refreshDeviceStates();
        setInterval(refreshDeviceStates, 7000); 
    }

    function renderLightCard(device, container, zoneName) {
        if(!container) return;
        const card = document.createElement('div'); 
        card.className = 'ctrl-card widget-item';
        card.setAttribute('data-room', `room-${device.zone_id}`); 
        card.setAttribute('data-device-id', device.id);
        
        const isOn = checkIsOn(device.status);
        const isDoor = device.name.toLowerCase().includes('cửa') || (device.feed_id && device.feed_id.toLowerCase().includes('door'));
        const iconClass = isDoor ? 'fa-door-closed' : 'fa-lightbulb';
        const feedText = device.feed_id || device.type;
        const safeZoneName = zoneName ? escapeHtml(zoneName) : 'Chưa có khu vực';

        card.innerHTML = `
            <div class="ctrl-header">
                <div style="display:flex; gap:15px; width: 100%;">
                    <div class="ctrl-icon"><i class="fa-solid ${iconClass}"></i></div>
                    <div class="ctrl-info" style="flex: 1;">
                        <h4 style="margin: 0 0 5px 0;">${escapeHtml(device.name)}</h4>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-location-dot"></i> ${safeZoneName}
                        </div>
                        <div class="feed-id" style="font-size: 0.8rem; opacity: 0.7;">${escapeHtml(feedText)}</div>
                    </div>
                </div>
            </div>
            <div class="ctrl-toggle-bar">
                <div class="status-indicator ${isOn ? 'on' : 'off'}">
                    <i class="fa-solid fa-power-off"></i> <span>${isOn ? 'BẬT' : 'TẮT'}</span>
                </div>
                <label class="switch">
                    <input type="checkbox" class="toggle-btn" ${isOn ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
            </div>
        `;
        
        const toggle = card.querySelector('.toggle-btn');
        toggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked; 
            card.setAttribute('data-updating', 'true'); 
            toggle.disabled = true; 
            try { 
                await API.toggleDevice(device.id, isChecked ? 'on' : 'off'); 
                updateStatusUI(card, isChecked);
            } catch (err) { 
                e.target.checked = !isChecked; 
            } finally { 
                setTimeout(() => { card.removeAttribute('data-updating'); toggle.disabled = false; }, 7000); 
            }
        });
        container.appendChild(card);
    }

    function renderFanCard(device, container, zoneName) {
        if(!container) return;
        const card = document.createElement('div'); 
        card.className = 'ctrl-card fan-card widget-item';
        card.setAttribute('data-room', `room-${device.zone_id}`); 
        card.setAttribute('data-device-id', device.id);
        
        const isOn = checkIsOn(device.status); 
        
        const fanModeMap = JSON.parse(localStorage.getItem("fanModeMap") || "{}");
        const currentMode = (device.mode || fanModeMap[device.id] || "manual").toLowerCase();
        const isAuto = currentMode === 'auto'; 
        
        const speedLv = getSpeedLevel(device.speed); 
        const feedText = device.feed_id || 'fan';
        const safeZoneName = zoneName ? escapeHtml(zoneName) : 'Chưa có khu vực';

        card.innerHTML = `
            <div class="ctrl-header">
                <div style="display:flex; gap:15px; width: 100%;">
                    <div class="ctrl-icon ${isOn ? 'fan-spinning' : ''}"><i class="fa-solid fa-fan"></i></div>
                    <div class="ctrl-info" style="flex: 1;">
                        <h4 style="margin: 0 0 5px 0;">${escapeHtml(device.name)}</h4>
                        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px; display: flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-location-dot"></i> ${safeZoneName}
                        </div>
                        <div class="feed-id" style="font-size: 0.8rem; opacity: 0.7;">${escapeHtml(feedText)}</div>
                    </div>
                </div>
            </div>
            
            <div class="ctrl-toggle-bar">
                <div class="status-indicator ${isOn ? 'on' : 'off'}">
                    <i class="fa-solid fa-power-off"></i> <span>${isOn ? 'BẬT' : 'TẮT'}</span>
                </div>
                <label class="switch">
                    <input type="checkbox" class="fan-switch" ${isOn ? 'checked' : ''} ${isAuto ? 'disabled' : ''}>
                    <span class="slider round"></span>
                </label>
            </div>

            <div class="ctrl-fan-section">
                <div>
                    <div class="ctrl-label"><i class="fa-solid fa-gauge-high"></i> Tốc độ</div>
                    <div class="btn-group speed-controls">
                        <button class="btn-pill speed-btn ${speedLv === 1 ? 'active' : ''}" data-speed="33" ${isAuto ? 'disabled' : ''}><i class="fa-solid fa-wind"></i> Nhỏ</button>
                        <button class="btn-pill speed-btn ${speedLv === 2 ? 'active' : ''}" data-speed="66" ${isAuto ? 'disabled' : ''}><i class="fa-solid fa-wind"></i> Vừa</button>
                        <button class="btn-pill speed-btn ${speedLv === 3 ? 'active' : ''}" data-speed="100" ${isAuto ? 'disabled' : ''}><i class="fa-solid fa-wind"></i> Lớn</button>
                    </div>
                </div>
                <div>
                    <div class="ctrl-label"><i class="fa-solid fa-robot"></i> Chế độ</div>
                    <div class="btn-group mode-controls">
                        <button class="btn-pill mode-btn ${!isAuto ? 'active' : ''}" data-mode="manual"><i class="fa-solid fa-hand-pointer"></i> Thủ công</button>
                        <button class="btn-pill mode-btn ${isAuto ? 'active' : ''}" data-mode="auto"><i class="fa-solid fa-robot"></i> Auto</button>
                    </div>
                </div>
            </div>
        `;
        
        card.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const mode = btn.dataset.mode; 
                card.setAttribute('data-updating', 'true');
                try { 
                    await API.updateDeviceMode(device.id, mode); 
                    
                    const map = JSON.parse(localStorage.getItem("fanModeMap") || "{}");
                    map[device.id] = mode;
                    localStorage.setItem("fanModeMap", JSON.stringify(map));

                    card.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active')); 
                    btn.classList.add('active'); 
                    
                    const isNowAuto = mode === 'auto'; 
                    card.querySelectorAll('.speed-btn').forEach(sb => sb.disabled = isNowAuto);
                    card.querySelector('.fan-switch').disabled = isNowAuto; 
                } 
                catch(err) {} 
                finally { setTimeout(() => card.removeAttribute('data-updating'), 7000); }
            });
        });

        const fanSwitch = card.querySelector('.fan-switch'); 
        const iconEl = card.querySelector('.ctrl-icon');
        let ignoreFanSwitchEvent = false;
        
        fanSwitch.addEventListener('change', async (e) => { 
            if (ignoreFanSwitchEvent) return; 
            const isChecked = e.target.checked;
            card.setAttribute('data-updating', 'true'); 
            fanSwitch.disabled = true; 
            try { 
                await API.toggleDevice(device.id, isChecked ? 'on' : 'off'); 
                
                if (!isChecked) {
                    await API.setDeviceSpeed(device.id, 0).catch(()=>{});
                    card.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                } else {
                    const activeSpeed = card.querySelector('.speed-btn.active');
                    if (!activeSpeed) {
                        await API.setDeviceSpeed(device.id, 33).catch(()=>{});
                        const speed1 = card.querySelector('.speed-btn[data-speed="33"]');
                        if (speed1) speed1.classList.add('active');
                    }
                }

                updateStatusUI(card, isChecked);
                if (iconEl) {
                    if (isChecked) iconEl.classList.add('fan-spinning');
                    else iconEl.classList.remove('fan-spinning');
                }
            } catch (err) { 
                e.target.checked = !isChecked; 
            } finally { 
                setTimeout(() => { 
                    card.removeAttribute('data-updating'); 
                    const isAutoNow = card.querySelector('.mode-btn[data-mode="auto"]').classList.contains('active');
                    fanSwitch.disabled = isAutoNow; 
                }, 7000); 
            } 
        });

        card.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (btn.disabled) return;
                const val = parseInt(btn.dataset.speed); 
                card.setAttribute('data-updating', 'true'); 
                
                card.querySelectorAll('.speed-btn').forEach(b => b.disabled = true);

                try { 
                    await API.setDeviceSpeed(device.id, val); 
                    card.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (!fanSwitch.checked) { 
                        ignoreFanSwitchEvent = true; 
                        fanSwitch.checked = true; 
                        updateStatusUI(card, true);
                        if (iconEl) iconEl.classList.add('fan-spinning');
                        ignoreFanSwitchEvent = false; 
                        await API.toggleDevice(device.id, 'on'); 
                    } 
                } catch (err) {} 
                finally { 
                    setTimeout(() => { 
                        card.removeAttribute('data-updating'); 
                        const isAutoNow = card.querySelector('.mode-btn[data-mode="auto"]').classList.contains('active');
                        card.querySelectorAll('.speed-btn').forEach(b => b.disabled = isAutoNow);
                    }, 7000); 
                }
            });
        });

        container.appendChild(card);
    }

    async function refreshDeviceStates() {
        let devices = []; try { devices = await API.getDevices(); } catch (e) { return; } 
        devices.forEach(async (device) => {
            const card = document.querySelector(`[data-device-id="${device.id}"]`);
            if (!card || card.getAttribute('data-updating') === 'true') return;

            let state = {};
            try {
                // Thử lấy API state, nếu lỗi (như trả về 404 cho quạt) thì nuốt lỗi và đi tiếp
                state = await API.getDeviceState(device.id) || {};
            } catch (err) {
                state = {}; 
            }

            if (device.type === 'sensor') {
                const valEl = card.querySelector('.temp-inner');
                const currentVal = state.sensor_value !== undefined ? state.sensor_value : device.value;
                if (valEl && currentVal !== undefined && currentVal !== null) {
                    const isTemp = device.name.toLowerCase().includes('nhiệt');
                    valEl.innerHTML = `${currentVal}${isTemp ? '°' : '%'}`;
                }
            }
            
            if (device.type === 'controller') {
                const toggle = card.querySelector('input[type="checkbox"]');
                const currentStatus = state.status !== undefined ? state.status : device.status;
                const isOn = checkIsOn(currentStatus);

                if (toggle && toggle.checked !== isOn) {
                    toggle.checked = isOn; 
                    updateStatusUI(card, isOn);
                }

                if (card.classList.contains('fan-card')) {
                    const iconEl = card.querySelector('.ctrl-icon');
                    if (iconEl) {
                        if (isOn) iconEl.classList.add('fan-spinning');
                        else iconEl.classList.remove('fan-spinning');
                    }

                    // TỐC ĐỘ: Lấy từ state -> fallback device
                    let currentSpeed = state.speed !== undefined ? state.speed : device.speed;
                    if (currentSpeed !== undefined && currentSpeed !== null) {
                        const speedLv = getSpeedLevel(currentSpeed);
                        card.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                        
                        if (speedLv === 1) card.querySelector('.speed-btn[data-speed="33"]')?.classList.add('active');
                        else if (speedLv === 2) card.querySelector('.speed-btn[data-speed="66"]')?.classList.add('active');
                        else if (speedLv === 3) card.querySelector('.speed-btn[data-speed="100"]')?.classList.add('active');
                    }
                    
                    // CHẾ ĐỘ (MODE): Lấy từ state -> fallback device -> fallback localStorage
                    let currentMode = "manual";
                    if (state.mode) {
                        currentMode = String(state.mode).toLowerCase().trim();
                    } else if (device.mode) {
                        currentMode = String(device.mode).toLowerCase().trim();
                    } else {
                        const fanModeMap = JSON.parse(localStorage.getItem("fanModeMap") || "{}");
                        if (fanModeMap[device.id]) {
                            currentMode = fanModeMap[device.id].toLowerCase();
                        }
                    }

                    if (currentMode) {
                        const activeModeButton = card.querySelector(`.mode-btn[data-mode="${currentMode}"]`);
                        if (activeModeButton && !activeModeButton.classList.contains('active')) {
                            card.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active')); 
                            activeModeButton.classList.add('active');
                            
                            const isAuto = currentMode === 'auto'; 
                            card.querySelectorAll('.speed-btn').forEach(sb => sb.disabled = isAuto);
                            if (toggle) toggle.disabled = isAuto;
                        }
                    }
                }
            }
        });
    }

    // --- RENDER SENSOR UI ---
    async function renderSensorCard(device, container, zoneName) {
        if(!container) return;
        let val = 0; try { const state = await API.getDeviceState(device.id); val = state && state.sensor_value !== undefined ? state.sensor_value : 0; } catch (error) {}
        val = parseFloat(val); const isTemp = device.name.toLowerCase().includes('nhiệt');
        let isAlert = false, alertMsg = "Cập nhật liên tục", ringStyle = "", valStyle = "", iconHtml = '<i class="fa-solid fa-clock"></i>';

        try {
            const rawThresholds = await API.getThresholds(device.id); const thresholds = Array.isArray(rawThresholds) ? rawThresholds : (rawThresholds ? [rawThresholds] : []);
            const deviceThreshold = thresholds.find(t => t && (t.target_device_id === device.id || t.target_device === device.id || t.device_id === device.id || t.id === device.id));
            if (deviceThreshold) {
                const thresholdValue = parseFloat(deviceThreshold.value); const condition = deviceThreshold.condition; let isTriggered = false;
                if (condition === '>' && val > thresholdValue) isTriggered = true; else if (condition === '>=' && val >= thresholdValue) isTriggered = true; else if (condition === '<' && val < thresholdValue) isTriggered = true; else if (condition === '<=' && val <= thresholdValue) isTriggered = true; else if (condition === '==' && val === thresholdValue) isTriggered = true; else if (!condition && val >= thresholdValue) isTriggered = true;
                if (isTriggered) {
                    isAlert = true; const displayCond = condition || '>=';
                    if (isTemp) { alertMsg = `Vượt ngưỡng (${displayCond} ${thresholdValue})`; ringStyle = "border-color: var(--danger-color); box-shadow: 0 0 15px rgba(255,77,77,0.3);"; valStyle = "color: var(--danger-color);"; iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>'; } 
                    else { alertMsg = `Cảnh báo (${displayCond} ${thresholdValue})`; ringStyle = "border-color: #4dacff; box-shadow: 0 0 15px rgba(77,172,255,0.3);"; valStyle = "color: #4dacff;"; iconHtml = '<i class="fa-solid fa-droplet"></i>'; }
                }
            }
        } catch (error) {}

        const card = document.createElement('div'); card.className = `card room-status-card widget-item ${isAlert ? 'alert-border' : ''}`;
        if (isAlert) card.style.border = isTemp ? "1px solid var(--danger-color)" : "1px solid #4dacff";
        card.setAttribute('data-room', `room-${device.zone_id}`); card.setAttribute('data-device-id', device.id);
        
        const safeZoneName = zoneName ? escapeHtml(zoneName) : 'Chưa có khu vực';

        card.innerHTML = `
            <div class="room-info">
                <h2 style="margin-bottom: 5px;">${escapeHtml(device.name)}</h2>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 5px;">
                    <i class="fa-solid fa-location-dot"></i> ${safeZoneName}
                </div>
                <p class="humidity" style="${isAlert ? (isTemp ? 'color: var(--danger-color);' : 'color:#4dacff;') : ''}">
                    ${iconHtml} ${alertMsg}
                </p>
            </div>
            <div class="temp-ring" style="${ringStyle}">
                <div class="temp-inner" style="${valStyle}">${val}${isTemp ? '°' : '%'}</div>
            </div>
        `;
        container.appendChild(card);
    }

    async function renderSensorChart(device) {
        if(!chartsContainer) return;
        const chartWrapper = document.createElement('div'); chartWrapper.className = 'card widget-item'; chartWrapper.setAttribute('data-room', `room-${device.zone_id}`); chartWrapper.style = 'padding: 20px; background: var(--card-bg); border-radius: 12px; height: 100%;';
        const isTemp = device.name.toLowerCase().includes('nhiệt'); const icon = isTemp ? '<i class="fa-solid fa-temperature-half" style="color: #ff6b6b;"></i>' : '<i class="fa-solid fa-droplet" style="color: #4dacff;"></i>';
        chartWrapper.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"><h4 style="margin: 0; color: var(--text-primary);">${icon} Biểu đồ ${escapeHtml(device.name)}</h4><small style="color: var(--text-muted);">Dữ liệu History</small></div><canvas id="chart-${device.id}"></canvas>`;
        chartsContainer.appendChild(chartWrapper);

        let history = [], labels = [], dataValues = []; try { history = await API.getDeviceHistory(device.id, 15); } catch (error) {}
        if (!history || history.length === 0) { labels = ['--:--', '--:--', '--:--', '--:--', '--:--']; dataValues = [0, 0, 0, 0, 0]; } 
        else { const sortedHistory = history.reverse(); labels = sortedHistory.map(h => new Date(h.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })); dataValues = sortedHistory.map(h => parseFloat(h.value || 0)); }

        const borderColor = isTemp ? '#ff6b6b' : '#4dacff'; const bgColor = isTemp ? 'rgba(255, 107, 107, 0.15)' : 'rgba(77, 172, 255, 0.15)';
        new Chart(document.getElementById(`chart-${device.id}`).getContext('2d'), { type: 'line', data: { labels: labels, datasets: [{ label: device.name, data: dataValues, borderColor: borderColor, backgroundColor: bgColor, borderWidth: 2, pointBackgroundColor: borderColor, pointBorderColor: '#fff', pointRadius: 3, fill: true, tension: 0.4 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#888', font: { size: 10 } }, grid: { color: 'rgba(128, 128, 128, 0.1)' } }, y: { ticks: { color: '#888' }, grid: { color: 'rgba(128, 128, 128, 0.1)' }, suggestedMin: 0 } } } });
    }

    function renderEmptySensorCard(name) { if(!sensorContainer) return; const card = document.createElement('div'); card.className = 'card room-status-card widget-item'; card.setAttribute('data-room', 'all'); card.innerHTML = `<div class="room-info"><h2>${escapeHtml(name)}</h2><p class="humidity" style="color: var(--text-secondary);"><i class="fa-solid fa-link-slash"></i> Chưa kết nối</p></div><div class="temp-ring" style="border-color: var(--border-color);"><div class="temp-inner" style="color: var(--text-secondary);">--</div></div>`; sensorContainer.appendChild(card); }
    function renderEmptyChart(name, iconClass, color) { if(!chartsContainer) return; const id = 'empty-chart-' + Math.random().toString(36).substr(2, 9); const chartWrapper = document.createElement('div'); chartWrapper.className = 'card widget-item'; chartWrapper.setAttribute('data-room', 'all'); chartWrapper.style = 'padding: 20px; background: var(--card-bg); border-radius: 12px; height: 100%;'; chartWrapper.innerHTML = `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;"><h4 style="margin: 0; color: var(--text-secondary);"><i class="fa-solid ${iconClass}" style="color: ${color}; opacity: 0.5;"></i> Biểu đồ ${escapeHtml(name)} (N/A)</h4><small style="color: var(--text-secondary);">No Data</small></div><canvas id="${id}"></canvas>`; chartsContainer.appendChild(chartWrapper); new Chart(document.getElementById(id).getContext('2d'), { type: 'line', data: { labels: ['--:--', '--:--', '--:--', '--:--', '--:--'], datasets: [{ data: [0, 0, 0, 0, 0], borderColor: '#888', borderWidth: 1, pointRadius: 0 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#888' }, grid: { display: false } }, y: { ticks: { color: '#888' }, grid: { display: false }, min: 0, max: 100 } } } }); }

    function setupFilters() {
        const filterBtns = document.querySelectorAll('.filter-btn'); const widgetItems = document.querySelectorAll('.widget-item');
        filterBtns.forEach(btn => {
            btn.onclick = () => {
                filterBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); const filter = btn.dataset.filter;
                widgetItems.forEach(item => { item.style.display = (filter === 'all' || item.dataset.room === filter) ? '' : 'none'; });
            };
        });
    }

    async function loadSystemHistory() { 
        const body = document.getElementById('log-table-body');
        if (body) {
            body.innerHTML = `<tr><td colspan="5" class="empty-state" style="text-align: center; padding: 30px;"><i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Đang tải nhật ký hoạt động...</td></tr>`;
        }
        
        try { 
            const logs = await API.getLogs(); 
            if (logs && logs.length > 0) { 
                allLogs = logs; 
                populateTypeFilter(allLogs); 
                renderLogs(allLogs); 
            } else { 
                renderEmptyLogs(); 
            } 
        } catch (error) { 
            renderErrorLogs('Lỗi tải dữ liệu lịch sử. Vui lòng kiểm tra kết nối hoặc đăng nhập lại.'); 
        } 
    }
    
    function renderLogs(logsData) { 
        const body = document.getElementById('log-table-body');
        if (!body) return;
        
        if (!logsData || logsData.length === 0) { 
            renderEmptyLogs(); 
            return; 
        } 
        
        body.innerHTML = logsData.map(log => {
            const desc = log.description || log.note || log.message || '';
            const timeValue = log.created_at || log.timestamp || log.createdAt || log.time;
            const deviceName = parseLogDeviceName(desc);
            const action = parseLogAction(desc);
            const isSuccess = isLogSuccess(desc);

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                    <td style="padding: 15px;">${formatTime(timeValue)}</td>
                    <td style="padding: 15px;"><strong style="color: var(--text-primary);">${escapeHtml(deviceName)}</strong></td>
                    <td style="padding: 15px;">${escapeHtml(action)}</td>
                    <td style="padding: 15px;">
                        <span class="${isSuccess ? 'status-success' : 'status-error'}" style="${isSuccess ? 'color: #10b981; background: rgba(16,185,129,0.1); padding: 4px 8px; border-radius: 4px;' : 'color: #ef4444; background: rgba(239,68,68,0.1); padding: 4px 8px; border-radius: 4px;'}">
                            ${isSuccess ? 'Thành công' : 'Lỗi'}
                        </span>
                    </td>
                    <td style="padding: 15px; color: var(--text-secondary);">${escapeHtml(desc)}</td>
                </tr>`;
        }).join('');
    }
    
    function renderEmptyLogs() {
        const body = document.getElementById('log-table-body');
        if (!body) return;
        body.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state" style="text-align:center; padding:30px;">
                    <i class="fa-solid fa-file-signature" style="font-size:24px; opacity:0.5; margin-bottom: 10px; display: block;"></i>
                    <div style="color: var(--text-secondary);">Chưa có dữ liệu nhật ký hoạt động.</div>
                </td>
            </tr>`;
    }

    function renderErrorLogs(message) {
        const body = document.getElementById('log-table-body');
        if (!body) return;
        body.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state" style="text-align:center; padding:20px; color: var(--danger-color);">
                    <i class="fa-solid fa-triangle-exclamation" style="margin-right: 8px;"></i>
                    ${escapeHtml(message)}
                </td>
            </tr>`;
    }

    function parseLogDeviceName(desc) {
        const controllerMatch = desc.match(/Controller[: ](.+?)(\.|$)/i);
        const sensorMatch = desc.match(/Sensor[: ](.+?)(\.|$)/i);
        if (controllerMatch) return controllerMatch[1];
        if (sensorMatch) return sensorMatch[1];
        return 'Hệ thống';
    }

    function parseLogAction(desc) {
        if (/turned on/i.test(desc)) return 'Bật';
        if (/turned off/i.test(desc)) return 'Tắt';
        if (/created/i.test(desc)) return 'Tạo mới';
        if (/deleted/i.test(desc)) return 'Xóa';
        if (/updated/i.test(desc)) return 'Cập nhật';
        if (/failed|error|lỗi/i.test(desc)) return 'Lỗi';
        return 'Cập nhật';
    }

    function isLogSuccess(desc) {
        return !(/failed|fail|error|lỗi/i.test(desc));
    }

    function populateTypeFilter(logsData) { 
        if(!filterType) return;
        const types = new Set(); 
        logsData.forEach(log => { 
            if (log.type) types.add(log.type.trim()); 
        }); 
        
        filterType.innerHTML = '<option value="all">Tất cả hoạt động</option>'; 
        types.forEach(type => { 
            const opt = document.createElement('option'); 
            opt.value = type.toLowerCase(); 
            opt.textContent = type; 
            filterType.appendChild(opt); 
        }); 
    }
    
    if(filterDate) filterDate.addEventListener('change', applyFiltersLogs); 
    if(filterType) filterType.addEventListener('change', applyFiltersLogs); 
    if(resetFilterBtn) resetFilterBtn.onclick = () => { 
        filterDate.value = ''; 
        filterType.value = 'all'; 
        renderLogs(allLogs); 
    };
    
    const refreshLogsBtn = document.getElementById('refresh-logs');
    if (refreshLogsBtn) refreshLogsBtn.addEventListener('click', loadSystemHistory);

    function applyFiltersLogs() { 
        let filtered = allLogs; 
        const dateVal = filterDate ? filterDate.value : ''; 
        const typeVal = filterType ? filterType.value : 'all'; 
        
        if (dateVal) {
            filtered = filtered.filter(log => {
                const time = log.created_at || log.timestamp || log.createdAt || log.time;
                return time && new Date(time).toISOString().split('T')[0] === dateVal;
            });
        } 
        if (typeVal !== 'all') {
            filtered = filtered.filter(log => log.type && log.type.toLowerCase() === typeVal);
        }
        renderLogs(filtered); 
    }
    
    function formatTime(timestamp) { 
        if (!timestamp) return "--";

        let date = new Date(timestamp);

        if (typeof timestamp === 'string' && timestamp.includes('T') && !timestamp.endsWith('Z') && !timestamp.match(/[+-]\d{2}:\d{2}$/)) {
            date = new Date(timestamp + 'Z'); 
        }

        const hh = String(date.getHours()).padStart(2, "0");
        const mm = String(date.getMinutes()).padStart(2, "0");
        const ss = String(date.getSeconds()).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const MM = String(date.getMonth() + 1).padStart(2, "0");

        return `${hh}:${mm}:${ss} ${dd}/${MM}`;
    }
    loadDashboard();

});