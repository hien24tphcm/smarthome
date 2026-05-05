
// ==========================================
// TẬP TIN API.JS - KẾT NỐI BACKEND RAILWAY
// ==========================================

// THAY ĐỔI TẠI ĐÂY: Đường dẫn backend mới của bạn
const BASE_URL = "https://iot-smart-home-backend-production.up.railway.app/api/v1";

const API = {
    getHeaders: () => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            console.warn("Không tìm thấy token. Vui lòng đăng nhập.");
            
            // Chỉ chuyển hướng nếu không phải đang ở trang login để tránh lặp vô tận
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
        console.log("👉 Đang gọi API tới:", url);
        
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
            try {
                data = await response.json();
            } catch (parseError) {
                data = null;
            }

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
        try {
            return await API.request("/devices/"); 
        } catch (error) {
            console.warn("Chưa có thiết bị, trả về mảng rỗng.");
            return []; // Tự động trả mảng rỗng nếu 404
        }
    },
    toggleDevice: async (id, action) => await API.request(`/devices/${id}/toggle?action=${action}`, { method: "POST" }),
    setDeviceMode: async (id, mode) => await API.request(`/devices/${id}/mode?mode=${mode}`, { method: "POST" }),
    updateDeviceMode: async (id, mode) => await API.setDeviceMode(id, mode),
    setDeviceSpeed: async (id, speed) => await API.request(`/devices/${id}/speed?speed=${speed}`, { method: "POST" }),
    getDeviceState: async (id) => await API.request(`/devices/${id}/state`),
    getDeviceHistory: async (id, limit = 50) => {
        try { 
            const data = await API.request(`/devices/${id}/history?limit=${limit}`);
            console.log("🔥 HISTORY:", data); // thêm dòng này
            return data;
        } catch (e) { 
            console.error("❌ HISTORY ERROR:", e);
            return []; 
        }
    },

    getZones: async () => {
        try { return await API.request("/zones/"); } 
        catch (e) { return []; }
    },

    getLogs: async (limit = 50) => {
        try { return await API.request(`/logs/?limit=${limit}`); } 
        catch (e) { return []; }
    },
    // --- MODULE: SETTINGS ---
    getSchedules: async () => {
        const schedulesPaths = ["/settings/schedules", "/settings/schedules/"];
        for (const path of schedulesPaths) {
            try {
                const res = await API.request(path);
                return Array.isArray(res) ? res : (res ? [res] : []);
            } catch (e) {
                if (e.status === 404) continue;
                console.warn("Lỗi khi lấy schedules:", e.message);
                return [];
            }
        }
        return [];
    },
    
    // Gọi API lấy tất cả thresholds và lọc theo thiết bị nếu cần.
    getThresholds: async (deviceId) => {
        if (!deviceId) return [];
        try {
            const res = await API.request(`/settings/thresholds`);
            const thresholds = res ? (Array.isArray(res) ? res : [res]) : [];
            return thresholds;
        } catch (e) {
            console.warn(`Thiết bị ${deviceId} chưa có cấu hình ngưỡng.`);
            return [];
        }
    },
    // --- AUTH ---
    logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("role");
        window.location.href = "../auth/login.html";
    }
};
