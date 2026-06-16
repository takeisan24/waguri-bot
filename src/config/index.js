// ============================================================
// config/index.js — Tập trung mọi hằng số "ma thuật" về 1 chỗ.
// Sửa cân bằng game ở ĐÂY, không rải rác trong từng command.
// ============================================================

module.exports = {
    // Đơn vị tiền tệ hiển thị
    CURRENCY: 'VNĐ',

    // Màu Embed dùng chung (giữ nhận diện thương hiệu nhất quán)
    COLORS: {
        SUCCESS: 0x57F287,
        ERROR:   0xED4245,
        INFO:    0x5865F2,
        WARNING: 0xFEE75C,
        JACKPOT: 0xF1C40F,
    },

    // Hệ thống Level/EXP (xem src/lib/leveling.js)
    LEVELING: {
        BASE: 100, // tổng EXP để đạt level L = BASE * (L-1)^2
    },

    // Cấu hình lệnh /work
    WORK: {
        COOLDOWN_SECONDS: 5 * 60, // 5 phút
        // Tỉ lệ kết quả theo brief (70% / 20% / 10%)
        OUTCOME: {
            SUCCESS: 0.70,
            FAIL:    0.20,
            JACKPOT: 0.10,
        },
        // Nghề mặc định khi user chưa apply job nào (job_id = null)
        DEFAULT_JOB: {
            name: 'Làm thuê tự do ngoài đường',
            min_wage: 10,
            max_wage: 50,
            risk_rate: 0.05,
        },
        EXP_PER_WORK: { min: 1, max: 5 },
    },
};
