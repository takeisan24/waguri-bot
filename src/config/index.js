// ============================================================
// config/index.js — Tập trung mọi hằng số cân bằng game.
// ============================================================

module.exports = {
    CURRENCY: 'VNĐ',

    COLORS: {
        SUCCESS: 0x57F287,
        ERROR:   0xED4245,
        INFO:    0x5865F2,
        WARNING: 0xFEE75C,
        JACKPOT: 0xF1C40F,
    },

    LEVELING: {
        BASE: 100, // tổng EXP để đạt level L = BASE * (L-1)^2
    },

    // Năng lượng: gate chính thay cho cooldown phẳng (bản cân bằng hardcore)
    ENERGY: {
        MAX: 100,
        REGEN_SECONDS: 180,   // hồi +1 mỗi 3 phút (phải khớp RPC regen_energy)
        COST_PER_WORK: 10,    // /work tốn 10 năng lượng
    },

    WORK: {
        // Nghề mặc định khi user chưa apply job nào (job_id = null)
        DEFAULT_JOB: {
            name: 'Làm thuê tự do ngoài đường',
            min_wage: 30,
            max_wage: 100,
            risk_rate: 0.05,
            required_level: 1,
        },
        // EXP mỗi lần work = EXP_BASE + EXP_PER_LEVEL * cấp_nghề + random(0..EXP_RANDOM)
        EXP_BASE: 8,
        EXP_PER_LEVEL: 1.5,
        EXP_RANDOM: 3,
    },
};
