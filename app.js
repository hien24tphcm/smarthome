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
    const limit = 25.5; // Giả sử ngưỡng lấy từ PostgreSQL
    const tempCard = document.querySelector('.sensor-card.temperature');
    
    if (currentTemp > limit) {
        tempCard.classList.add('warning'); // Thêm CSS để nháy đỏ
        console.warn("Cảnh báo: Nhiệt độ vượt ngưỡng!");
    } else {
        tempCard.classList.remove('warning');
    }
}

// ==========================================
// 4. MODULE 5: VẼ BIỂU ĐỒ (Dùng Chart.js)
// ==========================================
function initChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
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
window.onload = initChart;