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
        ERROR: 0xED4245,
        INFO: 0x5865F2,
        WARNING: 0xFEE75C,
        JACKPOT: 0xF1C40F,
    },

    LEVELING: {
        BASE: 100, // tổng EXP để đạt level L = BASE * (L-1)^2
    },

    // Năng lượng: gate chính thay cho cooldown phẳng (bản cân bằng hardcore)
    ENERGY: {
        MAX: 100,
        REGEN_SECONDS: 60,    // hồi +1 mỗi 1 phút (phải khớp RPC regen_energy)
        COST_PER_WORK: 10,    // /work tốn 10 năng lượng
    },

    WORK: {
        // Nghề mặc định khi user chưa apply job nào (job_id = null)
        DEFAULT_JOB: {
            name: 'Đứng đường',
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
        TAIXIU_MULT: 1.98, // house edge ~3.8% (cân hơn với coinflip ~2.5%)
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
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
        MAX_CONTEXT_TURNS: 6,    // số lượt hội thoại gần nhất giữ lại theo kênh
        MAX_OUTPUT_TOKENS: 600,  // đủ dài cho câu trả lời tự nhiên (vẫn gọn cho Discord)
        USER_COOLDOWN_MS: 4000,  // chống spam mỗi người
        FREE_DAILY: 15,          // số lượt chat AI/ngày cho user thường
        PREMIUM_DAILY: 150,      // số lượt chat AI/ngày cho user Premium
    },

    // Câu cá / đào mỏ / chặt gỗ (nguồn thu PvE, tốn năng lượng)
    FISH: {
        ENERGY_COST: 8,
    },
    GATHER_ENERGY_COST: 8, // /mine, /chop
    ACTION_COOLDOWN_MS: 5000, // /work /fish /mine /chop (đỡ spam, đỡ cày máy)

    // Mệt mỏi: làm liên tục trong 1 khung giờ -> thu nhập giảm dần, nghỉ thì hồi
    FATIGUE: {
        STEP: 0.05,        // mỗi lần liên tiếp -5%
        FLOOR: 0.5,        // giảm tối đa còn 50%
        RESET_MS: 600_000, // nghỉ 10 phút thì hồi sức về 100%
        DECAY_MS: 120_000, // nghỉ mỗi 2 phút thì hồi sức dần 1 bậc
    },

    // Phương tiện: đi làm bằng xe giúp tiết kiệm năng lượng
    VEHICLES: {
        xe_wave: { energy_cost: 8, name: 'Xe Wave' },
        xe_sh: { energy_cost: 6, name: 'Xe SH' },
        o_to_vinfast: { energy_cost: 4, name: 'Ô tô VinFast' },
    },

    // Thuế chuyển tiền /give (sink chống lạm phát)
    GIVE_TAX_PCT: 0.05,

    // Thú cưng (giá cho ăn tăng theo cấp: FEED_COST + FEED_PER_LEVEL * level)
    PET: { FEED_COST: 200, FEED_PER_LEVEL: 100, FEED_EXP_MIN: 20, FEED_EXP_MAX: 40 },

    // Kết hôn / ly hôn (sink + có "án phí")
    MARRY: { COST: 5000, DIVORCE_COST: 10000 },

    // Thưởng khi nối từ đúng (/noitu)
    NOITU: { COINS: 5, EXP: 2 },

    // Rương bí ẩn (money sink + cơ hội vật phẩm)
    CRATE: { COST: 1000 },

    // Xổ số cộng đồng (sink qua % nhà cái; quay tự động mỗi vòng)
    LOTTERY: { TICKET_PRICE: 500, HOUSE_CUT: 0.10, ROUND_HOURS: 24, MAX_PER_BUY: 100 },

    // Đánh đề theo XSMB thật (dò giải đặc biệt 18h30 giờ VN)
    XOSO: { PAYOUT: 70, MIN: 1000, MAX: 100000, DRAW_HOUR: 18, DRAW_MIN: 30 },

    // Cosmetic sink (flex, không ảnh hưởng cân bằng): danh hiệu + màu hồ sơ
    COSMETIC: { TITLE_COST: 20000, COLOR_COST: 15000, MAX_TITLE_LEN: 30 },

    // Game nhiều người (ba cây, bingo, ma sói...): nhà cái cắt % pot = sink
    PARTY: { HOUSE_CUT: 0.05, JOIN_SECONDS: 30 },

    // Vay/đòi nợ giữa người chơi (P2P): lãi cố định, hạn trả, quá hạn bị cưỡng chế thu
    LOAN: { INTEREST_PCT: 0.10, DUE_DAYS: 7, MIN: 100, MAX: 1_000_000 },

    // Đố vui (chơi vui + thưởng nhẹ, đẩy tương tác cộng đồng)
    QUIZ: { REWARD: 300, EXP: 5, TIME_MS: 20000 },

    // Chợ mua bán đồ giữa người chơi (chợ cắt % = sink)
    MARKET: { FEE_PCT: 0.05, MIN_PRICE: 1 },

    // Bang hội: phí lập bang (sink) + cược chiến tranh bang
    CLAN: { CREATE_COST: 50000, WAR_STAKE: 20000 },

    // Quyền lợi Premium trong game (ngoài quota AI): +% thu nhập lao động
    PREMIUM: { INCOME_BONUS: 0.10 },

    // Công an bắt cờ bạc — chơi càng nhiều, xác suất bị bắt càng cao
    POLICE: {
        BASE_CHANCE: 0.0,   // lần đầu không bị bắt
        STEP: 0.03,         // mỗi ván gần đây +3%
        MAX_CHANCE: 0.4,    // tối đa 40%
        FINE_PCT: 0.2,      // phạt 20% ví
        DECAY_MS: 600_000,  // 10 phút không chơi thì "nguội"
        JAIL_MS: 5 * 60_000, // bị bắt -> tạm giam (timeout) 5 phút
    },

    // Ngủ nghỉ hồi đầy năng lượng (cooldown dài)
    SLEEP_COOLDOWN_SECONDS: 6 * 3600, // 6 tiếng

    // Thưởng khi chat (chat-leveling) — có cooldown chống farm
    CHAT: {
        COOLDOWN_MS: 60_000,
        MIN_COINS: 5, MAX_COINS: 15,
        MIN_EXP: 3, MAX_EXP: 8,
        MIN_LEN: 12,       // bỏ qua tin nhắn quá ngắn (chống farm "kkk", "lol")
        DAILY_CAP: 50,     // tối đa 50 lượt thưởng chat/ngày/người
    },

    // Rate limit tổng (chống spam lệnh / quá tải DB)
    RATE_LIMIT: { MAX: 5, WINDOW_MS: 5000 }, // tối đa 5 lệnh / 5 giây / người
};
