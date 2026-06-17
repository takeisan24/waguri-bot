// ============================================================
// config/index.js — Tập trung mọi hằng số cân bằng game.
// ============================================================

module.exports = {
    // Tiền tố cho lệnh prefix (vd: w!work). Slash command vẫn dùng song song.
    PREFIX: 'w!',

    // Discord ID của owner (cho /eco-admin). Nhiều owner: ngăn cách bằng dấu phẩy.
    OWNER_IDS: (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),

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
        JACKPOT_CHANCE: 0.08, // xác suất trúng lớn (trong các lần KHÔNG xui)
        JACKPOT_MULT: 3,      // jackpot = max_wage * mult
    },

    // Cờ bạc — house edge nhẹ để không thành máy in tiền
    GAMBLE: {
        MIN_BET: 10,
        MAX_BET: 1_000_000,
        COINFLIP_MULT: 1.95,
        TAIXIU_MULT: 1.95,
        // Bầu cua: thắng nhận lại bet * (1 + số_con_trùng)
    },

    // Cướp tiền (PvP)
    ROB: {
        COOLDOWN_SECONDS: 3600,
        SUCCESS_RATE: 0.5,
        STEAL_MIN_PCT: 0.10,
        STEAL_MAX_PCT: 0.30,
        FINE_PCT: 0.10,
        MIN_TARGET_WALLET: 100,
    },

    // AI persona Waguri (đổi provider chỉ bằng AI_PROVIDER trong .env)
    AI: {
        PROVIDER: process.env.AI_PROVIDER || 'gemini', // 'gemini' | 'claude'
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
        CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
        MAX_CONTEXT_TURNS: 6,    // số lượt hội thoại gần nhất giữ lại theo kênh
        MAX_OUTPUT_TOKENS: 400,  // câu trả lời ngắn gọn cho Discord
        USER_COOLDOWN_MS: 4000,  // chống spam mỗi người
    },

    // Câu cá / đào mỏ / chặt gỗ (nguồn thu PvE, tốn năng lượng)
    FISH: {
        ENERGY_COST: 8,
    },
    GATHER_ENERGY_COST: 8, // /mine, /chop

    // Thưởng khi chat (chat-leveling) — có cooldown chống farm
    CHAT: {
        COOLDOWN_MS: 60_000,
        MIN_COINS: 5, MAX_COINS: 15,
        MIN_EXP: 3, MAX_EXP: 8,
        MIN_LEN: 3, // bỏ qua tin nhắn quá ngắn
    },
};
