// ============================================================
// config/index.js — Tập trung mọi hằng số cân bằng game.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

let loadedMediaPool = { MAIN: [], SUCCESS: [], ERROR: [], WARNING: [], JACKPOT: [] };
try {
    const mediaPoolPath = path.join(__dirname, '../data/mediaPool.json');
    if (fs.existsSync(mediaPoolPath)) {
        loadedMediaPool = JSON.parse(fs.readFileSync(mediaPoolPath, 'utf8'));
    }
} catch (e) {
    console.warn('[SYSTEM WARNING] Failed to load mediaPool.json, using default fallback:', e.message);
}

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

    // Ảnh/GIF Waguri theo trạng thái — nạp động từ file mediaPool.json
    WAGURI_IMAGES: loadedMediaPool,

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
        // ⚖️ CÂN LẠI 2026-08-24. Trước đây: 1.000.000 — tức KHÔNG có trần, vì toàn bộ cung
        // tiền cả server lúc đo chỉ 505.755 xu. Nguy hiểm nằm ở chiều THẮNG chứ không phải
        // chiều thua: với TAIXIU_MULT 1.98, một ván cược 1 triệu mà thắng đẻ ra +980.000 xu
        // từ hư không — gần gấp đôi số tiền đang tồn tại. Một cú may là lạm phát tức thì.
        // 25.000 ≈ 28 giờ cày /work (~900 xu/giờ), thắng tối đa +24.750 ≈ 5% cung tiền:
        // vẫn hồi hộp, nhưng không lật được nền kinh tế. Đo lại khi cung tiền qua ~2 triệu.
        MAX_BET: 25_000,
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
        // ⚠️ 2026-08-18: chuyển từ `gemini-3.6-flash` sang dòng **flash-lite**. Đo trực tiếp,
        // cùng prompt, cùng câu hỏi, trên khoá gói MIỄN PHÍ của dự án:
        //     gemini-3.6-flash        -> 503 quá tải / timeout >35s
        //     gemini-3.7-flash        -> 503 quá tải
        //     gemini-3.5-flash-lite   -> 1.446ms, token "nghĩ" = 0
        //     gemini-flash-lite-latest-> 1.444ms, token "nghĩ" = 0
        // Bộ 8 câu phỏng vấn nhân vật trên flash-lite: 8/8 thành công, 0/8 sai xưng hô,
        // 0/8 nhảy sang định dạng kịch bản. Chất lượng nhân vật ngang bằng, có phần hơn.
        // Đây là cách duy nhất tìm được để chat AI chạy ỔN ĐỊNH ở ngân sách 0 đồng.
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        // Trước đây là `gemini-3.1-pro-preview` — model này có hạn mức **bằng 0** trên gói
        // free (API trả thẳng `limit: 0`), tức người Premium nhận dịch vụ TỆ HƠN người thường.
        // Người Premium dùng CHUNG model với người thường. Mặc định trỏ về GEMINI_MODEL.
        //
        // Trước 2026-08-23 khoá này ghim cứng 'gemini-3.6-flash', và đó là một cái bẫy:
        // đối chiếu bảng hạn mức thật thì `gemini-3.5-flash-lite` (người thường) có RPD 500
        // / RPM 15, còn `gemini-3.6-flash` chỉ có RPD **20** / RPM 5. Trong khi PREMIUM_DAILY
        // hứa 150 lượt/ngày cho MỖI người, model đích chỉ chịu nổi 20 lượt/ngày cho TOÀN dự
        // án. Tức người trả tiền nhận dịch vụ kém hơn người không trả — và vạch 24/20 trên
        // bảng điều khiển cho thấy đường này đã chạy thật.
        //
        // Quyền lợi Premium là 150 lượt thay vì 15 (xem PREMIUM_DAILY). Đó là thứ đo được
        // và không vỡ. "Model xịn hơn" là thứ người dùng không phân biệt nổi, mà lại đúng
        // là chỗ sập. Muốn bật lại thì phải kiểm hạn mức model đó TRƯỚC — test/ai_model_premium
        // sẽ chặn nếu trỏ sang model có hạn mức nhỏ hơn.
        GEMINI_PREMIUM_MODEL: process.env.GEMINI_PREMIUM_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
        MAX_CONTEXT_TURNS: 6,    // số lượt hội thoại gần nhất giữ lại theo kênh
        // Lịch sử: 600 -> 2000 (2026-08-17) vì model dòng "thinking" tiêu token suy nghĩ
        // chung ngân sách này, làm cắt ngang từ. Nay 2000 -> 1200: flash-lite KHÔNG có pha
        // suy nghĩ (đo được: 0 token nghĩ, câu trả lời 98–104 token), nên trần 2000 là thừa.
        // 1200 vẫn dư cho model dự phòng có suy nghĩ (~574 nghĩ + ~150 đáp).
        MAX_OUTPUT_TOKENS: 1200,
        USER_COOLDOWN_MS: 4000,  // chống spam mỗi người
        FREE_DAILY: 15,          // số lượt chat AI/ngày cho user thường
        PREMIUM_DAILY: 150,      // số lượt chat AI/ngày cho user Premium
        // Trần cho TOÀN DỰ ÁN mỗi ngày. Giới hạn theo đầu người KHÔNG bảo vệ được một khoá
        // API dùng chung: 10 người dùng hết quota riêng là 150 lượt, không ai vi phạm gì cả,
        // mà hạn mức chung vẫn cạn — người thứ 11 nhận lỗi và không hiểu vì sao.
        //
        // Chọn 300: cao hơn hẳn mức dùng thật (đo 2026-08-18: 20 người TỪ TRƯỚC TỚI NAY,
        // ~125 lượt tổng cộng), nhưng đủ thấp để không chạm trần gói free — hôm nay gọi ~30
        // lượt flash-lite không dính 429 lần nào, nên trần thật thoải mái trên mức đó.
        // Đây là BẢO HIỂM cho lúc đông người, không phải giới hạn đang cắn.
        GLOBAL_DAILY: Number(process.env.AI_GLOBAL_DAILY) || 300,
        // (Đã bỏ cờ DISABLE_QUOTA_LIMIT: nó không được dùng ở đâu -> quota AI vẫn luôn bật.
        //  Giữ cap để tránh đội chi phí Gemini. Muốn tắt cap thì chỉnh trực tiếp consumeAiQuota.)
    },

    // Câu cá / đào mỏ / chặt gỗ (nguồn thu PvE, tốn năng lượng)
    FISH: {
        ENERGY_COST: 5,
    },
    GATHER_ENERGY_COST: 5, // /mine, /chop

    // Bộ Sưu Tập (Sổ Tay Sưu Tầm) — tỉ lệ rơi vật phẩm siêu hiếm cày cuốc
    COLLECTIONS: {
        DROP_RATES: {
            MINE_VANG_DONG_TRIEU: 0.010, // 1% tỉ lệ rơi Vàng Đông Triều khi /mine
            CHOP_KY_NAM: 0.005,          // 0.5% tỉ lệ rơi Kỳ Nam khi /chop
            FISH_CA_RONG_VANG: 0.10,     // 10% cơ hội rơi Cá Rồng Vàng khi trúng Cá Hiếm (thực tế 4% * 10% = 0.4%)
            FISH_CA_KOI_NHAT: 0.10,      // 10% cơ hội rơi Cá Koi Nhật khi trúng Rương Kho Báu (thực tế 1% * 10% = 0.1%)
        }
    },

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
        xe_vespa: { energy_cost: 6, name: 'Xe Vespa Hồng Cute' },
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
    COSMETIC: {
        TITLE_COST: 20000,
        COLOR_COST: 15000,
        MAX_TITLE_LEN: 30,
        BADGES: {
            rich: { emoji: '💰', cost: 100000, name_vi: 'Triệu Phú Gekka', name_en: 'Gekka Millionaire' },
            heart: { emoji: '💖', cost: 50000, name_vi: 'Trái Tim Ấm Áp', name_en: 'Warm Heart' },
            vip: { emoji: '👑', cost: 200000, name_vi: 'Thành Viên Hoàng Gia', name_en: 'Royal Member' },
            baker: { emoji: '🍰', cost: 80000, name_vi: 'Vua Bánh Gekka', name_en: 'Gekka Bakery King' },
            prestige_1: { emoji: '⭐', cost: 0, name_vi: 'Chuyển Sinh I', name_en: 'Prestige I' },
            prestige_2: { emoji: '🌟', cost: 0, name_vi: 'Chuyển Sinh II', name_en: 'Prestige II' },
            prestige_3: { emoji: '✨', cost: 0, name_vi: 'Chuyển Sinh III', name_en: 'Prestige III' },
            // cost: 0 -> `/cosmetic badge-buy` tự từ chối (nó chặn cost <= 0). Huy hiệu này
            // CHỈ đến từ việc ủng hộ tiền thật, không mua được bằng xu trong game — đó là
            // toàn bộ ý nghĩa của nó. Cấp bởi RPC `approve_donation` (migration 0131).
            supporter: { emoji: '💝', cost: 0, name_vi: 'Người Ủng Hộ', name_en: 'Supporter' }
        }
    },

    PRESTIGE: {
        REQ_LEVEL: 50,
        REQ_EXP: 240100, // 100 * (50-1)^2
        INCOME_BUFF_PER_LEVEL: 0.05,
        ENERGY_BUFF_PER_LEVEL: 5
    },

    // Game nhiều người (ba cây, bingo, ma sói...): nhà cái cắt % pot = sink
    PARTY: { HOUSE_CUT: 0.05, JOIN_SECONDS: 30 },

    // Vay/đòi nợ giữa người chơi (P2P): lãi cố định, hạn trả, quá hạn bị cưỡng chế thu
    // FEE_PCT: phí lập khế ước, CHỦ NỢ trả và bị ĐỐT. Nó tồn tại để chặn hai tài khoản phụ
    // chuyển tiền cho nhau qua vay–trả nhằm né thuế của /give.
    //
    // Phải nằm ở đây chứ không ghi cứng trong SQL: chủ nợ cần thấy con số này TRƯỚC khi bấm
    // đồng ý, nên JS và RPC bắt buộc dùng chung một nguồn. Ghi cứng hai nơi là kiểu lệch giá
    // mà cổng bảng giá Premium đã phải sinh ra để chặn.
    //
    // Lưu ý khi chỉnh: lãi 10% KHÔNG phải lợi nhuận của chủ nợ. Cho vay 10.000 thì họ bỏ ra
    // 10.500, thu về 11.000 — lời thật 500, tức ~4,76% trong 7 ngày. FEE_PCT >= INTEREST_PCT
    // sẽ làm việc cho vay LỖ và không ai cho vay nữa.
    LOAN: {
        INTEREST_PCT: 0.10, FEE_PCT: 0.05, DUE_DAYS: 7, MIN: 100, MAX: 1_000_000,
        // Lãi phạt quá hạn (migration 0140). Trước đây nợ trễ KHÔNG sinh thêm gì nên nợ
        // ngày 58 bằng đúng nợ ngày 1 — đo trên prod: 2 khoản, cả hai trễ 58 ngày, 0 lượt trả.
        LATE_PCT_PER_DAY: 0.02,
        // Trần BẮT BUỘC. Không trần thì nợ phình vô hạn, người vay bỏ luôn tài khoản và
        // chủ nợ cũng mất trắng. 1.5 = nợ dừng ở 150% số phải trả ban đầu (đụng trần sau 25 ngày).
        LATE_MAX_MULT: 1.5,
    },

    // Đố vui (chơi vui + thưởng nhẹ, đẩy tương tác cộng đồng)
    QUIZ: { REWARD: 300, EXP: 5, TIME_MS: 20000 },

    // Chợ mua bán đồ giữa người chơi (chợ cắt % = sink)
    MARKET: { FEE_PCT: 0.05, MIN_PRICE: 1 },
    AUCTION: {
        LISTING_FEE: 1000,          // phí đăng đấu giá (1000 xu)
        TAX_PCT: 0.05,              // thuế sàn 5%
        MIN_STARTING_BID: 100,      // giá khởi điểm tối thiểu
        MIN_INCREMENT: 10,          // bước giá tối thiểu
        MAX_EXTENSION_MS: 3600000,  // giới hạn gia hạn tối đa (1 giờ)
        MAX_BID_LIMIT: 9000000000000000, // giá trị bid tối đa an toàn cho Javascript Number
    },

    // Bang hội: phí lập bang (sink) + cược chiến tranh bang
    CLAN: { CREATE_COST: 50000, WAR_STAKE: 20000 },

    // Quyền lợi Premium trong game (ngoài quota AI): +% thu nhập lao động
    PREMIUM: {
        INCOME_BONUS: 0.10,
        // Huy hiệu cảm ơn người ủng hộ tuỳ tâm (KHÔNG kèm quyền lợi nào — xem 0131).
        SUPPORTER_BADGE: 'supporter',
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

    // ------------------------------------------------------------------
    // Chống Nuke (anti-nuke). Thiết kế đầy đủ: docs/spec-antinuke.md
    // Mọi con số ở đây là MẶC ĐỊNH TOÀN CỤC; từng server ghi đè qua `/antinuke`.
    // ------------------------------------------------------------------
    ANTINUKE: {
        // Luật phát hiện: hành vi -> ngưỡng / cửa sổ / hình phạt.
        // `limit` là số lần của CÙNG MỘT NGƯỜI trong `windowMs`.
        // `lockdown: true` = kèm khoá server (đây là các hành vi không thể nhầm với dọn dẹp).
        RULES: {
            channel_delete: { limit: 3, windowMs: 20_000, verdict: 'ban',   lockdown: true },
            channel_create: { limit: 5, windowMs: 20_000, verdict: 'ban' },
            role_delete:    { limit: 3, windowMs: 20_000, verdict: 'ban',   lockdown: true },
            role_create:    { limit: 5, windowMs: 20_000, verdict: 'strip' },
            member_ban:     { limit: 3, windowMs: 20_000, verdict: 'ban',   lockdown: true },
            member_kick:    { limit: 5, windowMs: 20_000, verdict: 'strip' },
            member_prune:   { limit: 1, windowMs: 20_000, verdict: 'ban',   lockdown: true },
            // Ba luật dưới đây ngưỡng = 1: chúng KHÔNG có phiên bản "vô tình".
            perm_escalate:  { limit: 1, windowMs: 20_000, verdict: 'strip' },
            bot_add:        { limit: 1, windowMs: 20_000, verdict: 'strip' },
            guild_update:   { limit: 2, windowMs: 30_000, verdict: 'strip' },
            webhook_create: { limit: 3, windowMs: 20_000, verdict: 'strip' },
            emoji_delete:   { limit: 5, windowMs: 30_000, verdict: 'strip' },
        },

        // Quyền được coi là "nguy hiểm": cấp một trong số này cho role/người = leo thang.
        // Sáu quyền này đủ để nuke một server; các quyền còn lại thì không.
        DANGEROUS_PERMS: ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'ManageWebhooks'],

        WHITELIST_MAX: 50,          // phải khớp trần trong RPC antinuke_whitelist_add
        BUCKET_CAP: 50,             // số mốc thời gian giữ tối đa mỗi bộ đếm (chống phình RAM)
        SWEEP_INTERVAL_MS: 300_000, // 5 phút dọn bộ đếm nguội một lần
        CONFIG_TTL_MS: 60_000,      // TTL cache cấu hình trong RAM
        PANIC_EXECUTORS: 2,         // >= 2 kẻ tấn công khác nhau trong PANIC_WINDOW_MS -> nghi chiếm tài khoản hàng loạt
        PANIC_WINDOW_MS: 60_000,
        QUEUE_SPACING_MS: 350,      // giãn cách thao tác API khi dọn dẹp (tránh 429)
        QUEUE_MAX_PER_INCIDENT: 60, // trần thao tác mỗi sự cố — thà thiếu còn hơn treo bot
        ALERT_COOLDOWN_MS: 10_000,  // gộp báo động: 1 lần / 10 giây / server
        // MỘT VỤ NUKE = MỘT SỰ CỐ. Không có trần này thì kẻ xoá 10 kênh sinh ra 8 dòng
        // sự cố + 8 lệnh ban (đã đo). Hậu quả không chỉ là ồn: 8 lệnh API thừa giữa lúc
        // đang cần băng thông nhất, và quy trình khoá chạy lại nhiều lần có thể ghi đè
        // bản ghi "trạng thái trước khi khoá" -> server kẹt khoá vĩnh viễn.
        // Hết trần mà vẫn còn hành vi phá hoại thì sự cố mới được mở (tấn công chưa dừng).
        INCIDENT_COOLDOWN_MS: 60_000,
        INCIDENT_WRITE_BUDGET_MS: 1_500, // chờ DB ghi sự cố tối đa bấy nhiêu rồi vẫn báo động
        // Tắt anti-nuke có ĐỘ TRỄ: kẻ chiếm được tài khoản chủ server sẽ tắt lá chắn
        // trước khi ra tay. 5 phút + báo động ngay là đủ để chủ server thật can thiệp.
        DISABLE_DELAY_MS: 5 * 60_000,
        INCIDENT_KEEP_DAYS: 90,
    },

    // Vote trên Top.gg (cần TOPGG_TOKEN để check & autopost). Vote lại được sau 12h.
    // ⚖️ CÂN LẠI 2026-08-15 (đợt 5). Trước đây: REWARD 5.000 + STREAK_BONUS 1.000.
    // Công thức đầy đủ là `REWARD × (cuối tuần ? 2 : 1) + min(chuỗi−1, 7) × STREAK_BONUS`,
    // nên mức trần thật là 34.000 xu/NGÀY (chuỗi 8+, cuối tuần, 2 lượt) — tương đương
    // **38 giờ cày `/work`** (~900 xu/giờ). Hai cú bấm ăn đứt gần hai ngày chơi thật thì
    // mọi nội dung gameplay mất hết ý nghĩa kinh tế. Đây là lỗi TỈ LỆ, sai ở mọi quy mô.
    //
    // Cắt đôi cả hai vế -> trần còn 17.000/ngày (19 giờ cày). Vẫn cao hơn gameplay, CHẤP
    // NHẬN CÓ CHỦ Ý: vote là đòn bẩy marketing đẩy hạng top.gg, không thuần là cân bằng.
    //
    // Thời điểm sửa được chọn có tính toán: đo ngày 2026-08-15 thấy **0 người từng vote**
    // => không ai bị nerf, không mất thiện cảm. Sửa sau khi có người quen nhận 34.000/ngày
    // thì đắt hơn nhiều.
    // Xem lại sau ≥30 ngày có dữ liệu thật (docs/spec-dot-5-kinh-te.md).
    VOTE: {
        REWARD: 2500, EXP: 50, COOLDOWN_HOURS: 12,
        STREAK_GRACE_HOURS: 36,   // vote lại trong 36h (12h cd + 24h dư) thì GIỮ chuỗi
        STREAK_BONUS: 500,        // thưởng cộng thêm mỗi mốc streak (từ ngày thứ 2)
        STREAK_BONUS_MAX: 7,      // cap số mốc cộng (tối đa +3.500)
        REMINDER: true,           // bật nhắc vote qua DM khi đủ 12h
    },

    // Onboarding theo từng user
    WELCOME: { BONUS: 5000 },     // quà chào mừng 1 lần (~1 lần /daily, không gây lạm phát)
    RETURN_GREET_DAYS: 3,         // vắng >= 3 ngày thì Waguri chào quay lại (ở /daily)

    // Tiệm Bánh Gekka — kinh doanh thụ động (xem docs/design-tiem-banh-gekka.md).
    // MÔ HÌNH: nhập nguyên liệu (orphan farm outputs) -> "kho tiềm năng" (stock, VNĐ) ->
    // tiệm tự nướng RATE/phút, dồn vào doanh thu tới TRẦN capacity -> /thu về ví.
    // Cân bằng hướng ỔN ĐỊNH: passive < cày chủ động; trần + gate NL chống lạm phát.
    BAKERY: {
        OPEN_COST: 50000,          // phí mở tiệm
        MIN_LEVEL: 15,             // cấp tối thiểu để mở
        TOOL: 'bo_lam_banh',       // vật phẩm "giấy phép" (đã có trong catalog, 8k)
        BAKE_MARKUP: 0.8,          // 1 nguyên liệu (giá p) -> +p*0.8 vào kho tiềm năng (so với /sell chỉ 0.5)
        CAKE_EVERY: 15000,         // mỗi 15k doanh thu thu được -> tặng 1 bánh (hybrid: tiền + item)
        CAKE_ITEM: 'banh_kem_dau', // bánh trả ra (Bánh Kem Dâu Gekka — buff item đã có)
        // Nguyên liệu hợp lệ (orphan outputs đang chờ dùng) + cá mới. Mở rộng sau.
        FILLINGS: ['trai_1500','trai_2000','trai_2500','trai_3000','trai_3500',
                   'hoa_1500','hoa_2000','hoa_2500','hoa_3000','hoa_3500',
                   'thit_heo_2000','thit_heo_2500','thit_heo_3000','thit_heo_3500','thit_heo_4000',
                   'ca_tuoi', 'ca_ngon', 'ca_hiem'],
        // Cấp 1..5 (MVP). rate = VNĐ/phút nướng; cap = trần doanh thu tích giữa 2 lần /thu.
        LEVELS: [
            { rate: 20,  cap: 12000,  upCost: 0,      mats: {} },
            { rate: 30,  cap: 24000,  upCost: 60000,  mats: { noi_that: 2 } },
            { rate: 45,  cap: 48000,  upCost: 140000, mats: { noi_that: 4 } },
            { rate: 68,  cap: 96000,  upCost: 320000, mats: { noi_that: 6, trang_suc: 2 } },
            { rate: 100, cap: 190000, upCost: 700000, mats: { noi_that: 10, trang_suc: 4 } },
        ],
        // Nhân viên NPC (Lore Kaoru Hana wa Rin to Saku)
        STAFF: {
            rintaro: { name: '🧑‍🍳 Rintaro Tsumugi', rev: 0.15, wage: 0.08, cost: 30000, desc: 'Thợ làm bánh chính cực kỳ chăm chỉ. (+15% doanh thu, lương 8%)' },
            subaru: { name: '👓 Subaru Hoshina', cap: 0.25, wage: 0.05, cost: 20000, desc: 'Nghiêm túc, quản két tiền cẩn thận. (+25% két chứa, lương 5%)' },
            usami: { name: '😆 Shohei Usami', rate: 0.10, wage: 0.04, cost: 15000, desc: 'Vui vẻ, hoạt náo viên cho tiệm. (+10% tốc độ nướng, lương 4%)' },
            saku: { name: '🤫 Saku Natsui', rate: 0.12, wage: 0.05, cost: 18000, desc: 'Quản lý nguyên liệu và thời gian. (+12% tốc độ nướng, lương 5%)' },
            ayato: { name: '🎯 Ayato Yorita', cake_discount: 0.20, wage: 0.06, cost: 22000, desc: 'Thông minh, tối ưu quy trình. (Làm bánh nhanh hơn 20%, lương 6%)' },
            madoka: { name: '🌸 Madoka Yano', rev: 0.08, cap: 0.10, wage: 0.06, cost: 25000, desc: 'Trợ giúp trang trí và thu hút khách. (+8% doanh thu & +10% két chứa, lương 6%)' }
        },
        // Đồ trang trí nội thất
        DECOR: {
            noi_that: { name: 'Bộ Nội Thất Gỗ', rate: 0.05 },
            trang_suc: { name: 'Trang Sức Đá Quý', rate: 0.06 }
        },
    },

    // Hạng mục Thưởng Vai Trò theo cấp tại Server Support
    ROLE_REWARDS: {
        SUPPORT_GUILD_ID: process.env.SUPPORT_GUILD_ID || '1517931376865710120',
        SUPPORT_INVITE: process.env.SUPPORT_INVITE || 'https://discord.gg/waguri',
        GIFT_COINS: 10000,
        MILESTONES: [
            { level: 5, roleId: process.env.ROLE_LV5 || '1517931405903204423', name_vi: 'Tập sự Gekka 🧁', name_en: 'Gekka Apprentice 🧁' },
            { level: 15, roleId: process.env.ROLE_LV15 || '1517931408831090729', name_vi: 'Thợ Bánh Kikyo 🌸', name_en: 'Kikyo Baker 🌸' },
            { level: 30, roleId: process.env.ROLE_LV30 || '1517931411519770734', name_vi: 'Tri kỷ Waguri 💞', name_en: 'Waguri Soulmate 💞' },
            { level: 50, roleId: process.env.ROLE_LV50 || '1517931413813952573', name_vi: 'Hộ vệ Chidori 🛡️', name_en: 'Chidori Guardian 🛡️' },
            { level: 100, roleId: process.env.ROLE_LV100 || '1517931416972099614', name_vi: 'Chủ chuỗi Gekka 🍰', name_en: 'Gekka Master 🍰' },
        ]
    },

    // Web app (dashboard, mua Premium...). Đổi qua env WEB_URL nếu deploy domain khác.
    WEB_URL: process.env.WEB_URL || 'https://waguri-bot.vercel.app',
};
