// ==========================================
// LOGIN JS - ĐĂNG NHẬP & ĐĂNG KÝ TÀI KHOẢN
// ==========================================

console.log("🚀 Login script đã sẵn sàng");

const BASE_URL = "https://iot-smart-home-backend-production.up.railway.app/api/v1";
const LOGIN_URL = `${BASE_URL}/auth/login`;
const REGISTER_URL = `${BASE_URL}/users/`; // Giả định endpoint tạo user

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// ----------------------------------------------------
// XỬ LÝ ĐĂNG NHẬP
// ----------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault(); 
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('error-msg');
        errorMsg.style.display = 'none';

        const formData = new URLSearchParams();
        formData.append("username", username);
        formData.append("password", password);

        try {
            const res = await fetch(LOGIN_URL, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData
            });

            const data = await res.json();
            
            if (!res.ok || !data.access_token) {
                errorMsg.innerText = data.detail || "Tài khoản hoặc mật khẩu không chính xác!";
                errorMsg.style.display = 'block';
                return;
            }

            const token = data.access_token;
            const decoded = parseJwt(token);
            const userRole = (decoded.role || decoded.type || "").toLowerCase();
            const selectedType = window.selectedLoginType; 

            if (selectedType === "admin" && userRole !== "admin") {
                errorMsg.innerText = "Tài khoản này không có quyền Admin!";
                errorMsg.style.display = 'block';
                return;
            }
            if (selectedType === "member" && userRole !== "member" && userRole !== "user") {
                errorMsg.innerText = "Đây là tài khoản Admin, vui lòng đăng nhập ở cổng Admin!";
                errorMsg.style.display = 'block';
                return;
            }

            localStorage.setItem("access_token", token);
            localStorage.setItem("role", userRole);

            if (userRole === "admin") {
                window.location.href = "../admin/admin.html"; 
            } else {
                window.location.href = "../user/index.html";
            }
        } catch (err) {
            errorMsg.innerText = "Lỗi kết nối máy chủ!";
            errorMsg.style.display = 'block';
        }
    });
}

// ----------------------------------------------------
// XỬ LÝ ĐĂNG KÝ (SIGN UP)
// ----------------------------------------------------
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const errorMsg = document.getElementById('signup-error-msg');
        errorMsg.style.display = 'none';

        // 1. Lấy dữ liệu từ form
        const role = document.getElementById('member-role').value;
        const payload = {
            fname: document.getElementById('member-fname').value, // Đổi từ first_name -> fname
            lname: document.getElementById('member-lname').value, // Đổi từ last_name -> lname
            email: document.getElementById('member-email').value,
            password: document.getElementById('member-password').value,
            type: role                                            // Đổi từ role -> type
        };

        // Gắn thêm thông tin nhà tùy theo Role
        if (role === 'admin') {
            payload.home_name = document.getElementById('member-home-name').value;
        } else {
            payload.home_id = parseInt(document.getElementById('member-home-id').value);
        }
        // 

        try {
            // 2. GỌI API TẠO TÀI KHOẢN
            const resCreate = await fetch(REGISTER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const createData = await resCreate.json();

            if (!resCreate.ok) {
                errorMsg.innerText = createData.detail || "Có lỗi xảy ra khi tạo tài khoản!";
                errorMsg.style.display = 'block';
                return;
            }

            // 3. NẾU THÀNH CÔNG, GỌI API GET ĐỂ LẤY THÔNG TIN THEO EMAIL
            const emailToFetch = payload.email;
            const resUser = await fetch(`${BASE_URL}/users/${emailToFetch}`);
            const userData = await resUser.json();

            if (resUser.ok) {
                // 4. HIỂN THỊ THÔNG TIN LÊN MÀN HÌNH MỚI
                document.getElementById('signup-form').style.display = 'none';
                document.getElementById('user-info-display').style.display = 'block';
                document.getElementById('prompt-text').innerText = "Thông tin tài khoản";

                const detailBox = document.getElementById('user-details-content');
                detailBox.innerHTML = `
                    <p><strong>Họ & Tên:</strong> ${userData.last_name || ""} ${userData.first_name || ""}</p>
                    <p><strong>Email:</strong> ${userData.email}</p>
                    <p><strong>Vai trò:</strong> <span style="text-transform: capitalize;">${userData.type}</span></p>
                    ${userData.home_id ? `<p><strong>ID Nhà:</strong> ${userData.home_id}</p>` : ''}
                    <p style="margin-top:10px; font-size:12px; color:#666;">
                        <i>Vui lòng quay lại trang Đăng nhập để truy cập hệ thống.</i>
                    </p>
                `;
                
                // Xóa dữ liệu cũ trên form
                signupForm.reset(); 
            } else {
                errorMsg.innerText = "Tạo thành công nhưng không thể lấy thông tin chi tiết.";
                errorMsg.style.display = 'block';
            }

        } catch (err) {
            console.error(err);
            errorMsg.innerText = "Không thể kết nối đến máy chủ. Vui lòng thử lại!";
            errorMsg.style.display = 'block';
        }
    });
}