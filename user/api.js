
const BASE_URL = "https://iot-smart-home-backend-production.up.railway.app/api/v1";

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
                throw new Error("Unauthorized");
            }
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.detail || "Lỗi kết nối đến server");
            }
            return data;
            
        } catch (error) {
            console.error(`[API Error] ${endpoint}:`, error.message);
            throw error;
        }
    },

    getDevices: async () => {
        try {
            return await API.request("/devices/"); 
        } catch (error) {
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
        try { return await API.request("/settings/schedules"); } 
        catch (e) { return []; }
    },
    getThreshold: async (id) => {
        try { 
            return await API.request(`/settings/thresholds/${id}`); 
        } catch (e) { 
            return null; 
        }
    },
    // --- AUTH ---
    logout: () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("role");
        window.location.href = "../auth/login.html";
    }
};
