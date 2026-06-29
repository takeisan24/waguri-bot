// ============================================================
// config/index.js — Tập trung mọi hằng số cân bằng game.
// ============================================================

module.exports = {
    // Tiền tố cho lệnh prefix (vd: w!work). Slash command vẫn dùng song song.
    PREFIX: 'w!',

    // Discord ID của owner (cho /eco-admin). Nhiều owner: ngăn cách bằng dấu phẩy.
    OWNER_IDS: (process.env.OWNER_IDS || '').split(',').map(s => s.trim()).filter(Boolean),

    CURRENCY: 'VNĐ',

    // Tên nhà phát triển (hiện trong /about). Đổi nhanh qua env BOT_CREATOR, khỏi sửa code.
    CREATOR: process.env.BOT_CREATOR || 'takei',

    COLORS: {
        SUCCESS: 0x8DE0A6,   // Soft Matcha Green
        ERROR: 0xFF8E9E,     // Soft Blush/Strawberry Pink (matching Waguri)
        INFO: 0xFF9EAA,      // Waguri Cherry Blossom Pink (Theme primary)
        WARNING: 0xFFD54F,   // Soft Honey Yellow
        JACKPOT: 0xFFC107,   // Caramel Gold
    },

    EMOJIS: {
        FLOWER: '🌸',
        CAKE: '🍰',
        COIN: '🪙',
        ENERGY: '⚡',
        HEART: '💖',
        SPARKLE: '✨',
        WARN: '⚠️',
        SUCCESS: '✅',
        ERROR: '❌',
    },

    // Ảnh/GIF Waguri theo trạng thái — MỖI trạng thái là 1 "pool" nhiều ảnh.
    // Mỗi lần dựng embed sẽ RANDOM 1 ảnh trong pool -> thị giác đa dạng, "xoay tua".
    // Cách thêm ảnh: dán thêm link Tenor (đuôi .gif) vào mảng tương ứng là xong.
    // GIF Tenor đã verify; bản nét hơn: đổi đuôi ...AAAAM -> ...AAAAd / ...AAAAC.
    // ĐỂ MẢNG RỖNG [] cho 1 trạng thái = trạng thái đó dùng avatar bot.
    WAGURI_IMAGES: {
        // Mặc định / info — Waguri dịu dàng, dễ thương
        MAIN: [
            'https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif',
            'https://media.tenor.com/P8-BVJfuXXYAAAAd/kaoruko-waguri.gif',
            'https://media.tenor.com/VTxubF9zn9gAAAAd/kaoru-hana-wa-rin-to-saku-waguri-kaoruko.gif',
            'https://media.tenor.com/y84DDAHiP3gAAAAd/kaoruko-waguri-flag-kaoruko-waguri.gif',
            'https://media.tenor.com/gUP3bf_s600AAAAM/waguri-kaoruko.gif',
        ],
        // Thành công — vui tươi, rạng rỡ, cười
        SUCCESS: [
            'https://media.tenor.com/gUP3bf_s600AAAAM/waguri-kaoruko.gif',
            'https://media.tenor.com/cKRjPvdD-yUAAAAd/kaoruko-kaoruko-waguri.gif',
            'https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif',
            'https://media.tenor.com/TdCu1_KQmAcAAAAd/kaoruko-waguri-kaoruko.gif',
        ],
        // Lỗi / thất bại — buồn, bối rối, tiu nghỉu
        ERROR: [
            'https://media.tenor.com/Jz4bNe6EF-wAAAAM/the-fragrant-flower-blooms-with-dignity-kaoru-hana-wa-rin-to-saku.gif',
            'https://media.tenor.com/sBTF0SS7cnMAAAAd/kaoru-hana-wa-rin-to-saku-kaoruko-waguri.gif',
            'https://media.tenor.com/WMRHrfBlNmEAAAAM/kaoruko-waguri-waguri-kaoruko.gif',
        ],
        // Cảnh báo — bối rối, nhắc nhở nhẹ
        WARNING: [
            'https://media.tenor.com/WMRHrfBlNmEAAAAM/kaoruko-waguri-waguri-kaoruko.gif',
            'https://media.tenor.com/sBTF0SS7cnMAAAAd/kaoru-hana-wa-rin-to-saku-kaoruko-waguri.gif',
            'https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif',
        ],
        // Jackpot — phấn khích, ăn mừng
        JACKPOT: [
            'https://media.tenor.com/TdCu1_KQmAcAAAAd/kaoruko-waguri-kaoruko.gif',
            'https://media.tenor.com/cKRjPvdD-yUAAAAd/kaoruko-kaoruko-waguri.gif',
            'https://media.tenor.com/gUP3bf_s600AAAAM/waguri-kaoruko.gif',
            'https://media.tenor.com/saOAfF_zx6UAAAAM/kaoruko-waguri-the-fragrant-flower-blooms-with-dignity.gif',
        ],
    },

    LEVELING: {
        BASE: 100, // tổng EXP để đạt level L = BASE * (L-1)^2
    },

    // Năng lượng: gate chính thay cho cooldown phẳng (bản cân bằng hardcore)
    ENERGY: {
        MAX: 100,
        REGEN_SECONDS: 30,    // hồi +1 mỗi 30 giây (phải khớp RPC regen_energy)
        COST_PER_WORK: 10,    // /work — CHƯA giảm: gắn ladder VEHICLES (energy_cost 3..9 < 10). Hạ xuống cần rebalance xe.
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

    // AI persona Waguri (Google Gemini)
    AI: {
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        MAX_CONTEXT_TURNS: 6,    // số lượt hội thoại gần nhất giữ lại theo kênh
        MAX_OUTPUT_TOKENS: 600,  // đủ dài cho câu trả lời tự nhiên (vẫn gọn cho Discord)
        USER_COOLDOWN_MS: 4000,  // chống spam mỗi người
        FREE_DAILY: 15,          // số lượt chat AI/ngày cho user thường
        PREMIUM_DAILY: 150,      // số lượt chat AI/ngày cho user Premium
    },

    // Câu cá / đào mỏ / chặt gỗ (nguồn thu PvE, tốn năng lượng)
    FISH: {
        ENERGY_COST: 5,
    },
    GATHER_ENERGY_COST: 5, // /mine, /chop

    // Hệ Bệnh (Disease) — xem .local-brainstorm/disease_design.md
    DISEASE: {
        CATCH_CHANCE: 0.04,        // 4% đổ bệnh mỗi hành động kiếm tiền (work/fish/mine/chop)
        LOW_HEALTH_THRESHOLD: 50,  // máu dưới mức này -> dễ ốm hơn
        LOW_HEALTH_MULT: 2,        // ×2 tỉ lệ mắc khi máu thấp
        SICK_INCOME_MULT: 0.7,     // -30% thu nhập khi đang bệnh
        SICK_HEALTH_LOSS: 4,       // mất 4 máu mỗi hành động khi đang bệnh
    },
    ACTION_COOLDOWN_MS: 5000, // /work /fish /mine /chop (đỡ spam, đỡ cày máy)

    // Mệt mỏi: thu nhập giảm khi NĂNG LƯỢNG hoặc SỨC KHỎE tụt thấp (xem src/lib/fatigue.js)
    FATIGUE: {
        THRESHOLD: 0.5, // còn >= 50% năng lượng & sức khỏe -> thu nhập 100%; dưới mức này mới bắt đầu giảm
        FLOOR: 0.5,     // mệt cỡ nào thu nhập cũng không thấp hơn 50%
    },

    // Phương tiện: đi làm bằng xe giúp tiết kiệm năng lượng (work cơ bản tốn 10).
    // energy_cost CÀNG THẤP = càng xịn (giá càng cao). PHẢI khớp item catalog (id + name)
    // và thứ tự ưu tiên trong RPC use_vehicle. /work tự chọn xe có energy_cost THẤP NHẤT đang sở hữu.
    VEHICLES: {
        xe_dap: { energy_cost: 9, name: 'Xe Đạp Mini Nhật Bản' },
        xe_wave: { energy_cost: 8, name: 'Xe Honda Wave' },
        xe_sh: { energy_cost: 6, name: 'Xe Vespa Hồng Cute' },
        o_to_vinfast: { energy_cost: 5, name: 'Ô tô VinFast VF3' },
        sh: { energy_cost: 4, name: 'Xe Honda SH Mode' },
        o_to_cu: { energy_cost: 4, name: 'Ô Tô Cũ Của Rintaro' },
        mercedes: { energy_cost: 3, name: 'Xe Rolls-Royce Kikyo' },
    },

    // Thuế chuyển tiền /give (sink chống lạm phát)
    GIVE_TAX_PCT: 0.05,

    // Thú cưng (giá cho ăn tăng theo cấp: FEED_COST + FEED_PER_LEVEL * level)
    PET: { FEED_COST: 200, FEED_PER_LEVEL: 100, FEED_EXP_MIN: 20, FEED_EXP_MAX: 40 },

    // Kết hôn / ly hôn (sink + có "án phí")
    MARRY: { COST: 5000, DIVORCE_COST: 10000 },

    // Thưởng khi nối từ đúng (/noitu). Có cooldown + cap ngày chống farm (2 acc luân phiên).
    NOITU: { COINS: 5, EXP: 2, COOLDOWN_MS: 8000, DAILY_CAP: 60 },

    // Rương bí ẩn (money sink + cơ hội vật phẩm)
    CRATE: { COST: 1000 },

    LOTO: { TICKET_PRICE: 500, HOUSE_CUT: 0.05 },
    BINGO: { DEFAULT_BET: 500, HOUSE_CUT: 0.05 },

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
    PREMIUM: {
        INCOME_BONUS: 0.10,
        // Gói bán qua VietQR (VCB) + Casso. key = plan id, dùng CHUNG với web (web/src/lib/premium.ts).
        PLANS: {
            m1: { months: 1, amount: 25000, label: '1 tháng' },
            m3: { months: 3, amount: 60000, label: '3 tháng' },
            m6: { months: 6, amount: 99000, label: '6 tháng' },
        },
    },

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

    // Vote trên Top.gg (cần TOPGG_TOKEN để check & autopost). Vote lại được sau 12h.
    VOTE: {
        REWARD: 5000, EXP: 50, COOLDOWN_HOURS: 12,
        STREAK_GRACE_HOURS: 36,   // vote lại trong 36h (12h cd + 24h dư) thì GIỮ chuỗi
        STREAK_BONUS: 1000,       // thưởng cộng thêm mỗi mốc streak (từ ngày thứ 2)
        STREAK_BONUS_MAX: 7,      // cap số mốc cộng (tối đa +7.000)
        REMINDER: true,           // bật nhắc vote qua DM khi đủ 12h
    },

    // Onboarding theo từng user
    WELCOME: { BONUS: 5000 },     // quà chào mừng 1 lần (~1 lần /daily, không gây lạm phát)
    RETURN_GREET_DAYS: 3,         // vắng >= 3 ngày thì Waguri chào quay lại (ở /daily)

    // Web app (dashboard, mua Premium...). Đổi qua env WEB_URL nếu deploy domain khác.
    WEB_URL: process.env.WEB_URL || 'https://waguri-bot.vercel.app',
};
