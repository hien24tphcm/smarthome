console.log("LOGIN JS VERSION 999");
alert("login.js mới đã load");

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    try {
        const res = await fetch("http://localhost:8000/api/v1/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: formData
        });

        const data = await res.json();
        console.log("FULL RESPONSE:", data);
        console.log("ROLE FROM SERVER:", data.role);
        alert("ROLE = " + data.role);

        if (!data.access_token) {
            alert("Sai tài khoản hoặc mật khẩu");
            return;
        }

        const role = (data.role || "").toLowerCase();

        localStorage.setItem("token", data.access_token);
        localStorage.setItem("role", role);
        
        console.log("ROLE:", role);
        
        if (role === "admin") {
            window.location.href = "/admin/admin.html";
        } else if (role === "member") {
            window.location.href = "/user/index.html";
        } else {
            alert("Role không hợp lệ: " + role);
        }

    } catch (err) {
        console.error("Login error:", err);
        alert("Không thể kết nối server");
    }
});