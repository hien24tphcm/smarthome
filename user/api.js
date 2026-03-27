const BASE_URL = "http://127.0.0.1:8000/api/v1";

/**
 * Hàm gửi request dùng chung
 */
async function sendRequest(endpoint, method = "GET", body = null, isLoginForm = false) {
    const token = localStorage.getItem("access_token");
    
    // Cấu hình Headers
    const headers = {};
    if (!isLoginForm) {
        headers["Content-Type"] = "application/json";
    } else {
        // Login dùng Form-data theo chuẩn OAuth2 của FastAPI
        headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const config = { method, headers };
    
    if (body) {
        config.body = isLoginForm ? body : JSON.stringify(body);
    }

    try {
        const response = await fetch(`${BASE_URL}${endpoint}`, config);
        
        // Xử lý khi Token hết hạn hoặc không hợp lệ
        if (response.status === 401 && !endpoint.includes("/auth/login")) {
            localStorage.removeItem("access_token");
            window.location.href = "login.html";
            return;
        }

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.detail || "Lỗi không xác định từ Server");
        }
        return data;
    } catch (error) {
        console.error("Lỗi kết nối Backend:", error.message);
        throw error;
    }
}

/**
 * Đối tượng API chứa các hàm gọi Backend
 */
const API = {
    // 1. Đăng nhập để lấy Token
    login: async (email, password) => {
        const formData = new URLSearchParams();
        formData.append("username", email); // OAuth2 dùng username field cho email
        formData.append("password", password);
        
        const data = await sendRequest("/auth/login", "POST", formData, true);
        if (data && data.access_token) {
            localStorage.setItem("access_token", data.access_token);
        }
        return data;
    },

    // 2. Quản lý Thiết bị (Devices)
    getDevices: () => sendRequest("/devices/"), // Lấy danh sách thiết bị
    
    // Bật/Tắt thiết bị: action là 'on' hoặc 'off'
    toggleDevice: (id, action) => sendRequest(`/devices/${id}/toggle?action=${action}`, "POST"),
    
    // Cập nhật chế độ: mode là 'manual' hoặc 'auto'
    updateDeviceMode: (id, mode) => sendRequest(`/devices/${id}/mode/?mode=${mode}`, "POST"),
    
    // Cập nhật tốc độ quạt (0-100)
    setDeviceSpeed: (id, speed) => sendRequest(`/devices/${id}/speed/?speed=${speed}`, "POST"),

    // 3. Quản lý Lịch sử (Logs)
    getLogs: (limit = 50) => sendRequest(`/logs/logs?limit=${limit}`), // Khớp với router /logs trong logs.py

    // 4. Quản lý Cài đặt (Settings/Thresholds)
    // Tạo ngưỡng cảnh báo mới
    createThreshold: (name, value, type) => sendRequest("/settings/thresholds", "POST", {
        name: name,
        value: value,
        type: type // 'temperature' hoặc 'humidity'
    }),
    
    // Lấy danh sách ngưỡng
    getThresholds: () => sendRequest("/settings/thresholds"),

    // 5. Quản lý Khu vực (Zones)
    getZones: () => sendRequest("/zones/")
};