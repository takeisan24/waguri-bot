// ============================================================
// ecosystem.config.js — Cấu hình PM2 cho production 24/7.
//
// Trên VPS (Oracle Cloud Always Free / GCP / VPS trả phí):
//   npm install -g pm2
//   pm2 start ecosystem.config.js     # khởi động bot
//   pm2 logs choco                    # xem log (kiểm tra bot có lên thật)
//   pm2 save                          # lưu danh sách tiến trình
//   pm2 startup                       # chạy lệnh nó in ra -> tự bật lại khi reboot
//
// Sau đó đóng SSH thoải mái, bot vẫn chạy 24/7.
// KHÔNG cần UptimeRobot — pm2 tự giữ tiến trình sống & restart khi crash.
// ============================================================

module.exports = {
    apps: [
        {
            name: 'choco',
            script: 'index.js',
            instances: 1,           // bot Discord chỉ chạy 1 instance (gateway đơn)
            autorestart: true,      // tự khởi động lại nếu crash
            watch: false,           // KHÔNG watch ở prod (đó là việc của nodemon khi dev)
            max_memory_restart: '300M', // restart nếu rò rỉ bộ nhớ vượt ngưỡng
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
