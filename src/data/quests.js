// ============================================================
// data/quests.js — Nhiệm vụ hằng ngày.
//   key phải KHỚP loại sự kiện mà quest_incr cộng (xem các lệnh gọi db.questIncr):
//     'daily' (điểm danh) · 'vote' (vote Top.gg) · 'work' (số lần làm) · 'earn' (tổng tiền kiếm)
//     'gamble_win' (số ván thắng) · 'fish' (số lần câu) · 'gather' (số lần đào mỏ/chặt gỗ)
//
// Bộ nhiệm vụ MỖI NGƯỜI MỖI NGÀY gồm:
//   - PINNED: LUÔN có (điểm danh + vote) — 2 việc "checklist" cốt lõi.
//   - POOL:   chọn ngẫu-nhiên-TẤT-ĐỊNH theo (userId + ngày UTC) qua pickDailyQuests().
//             Ổn định trong ngày (gõ /quest nhiều lần vẫn ra cùng bộ), khác nhau giữa người & giữa ngày.
//             Không cần lưu DB: tiến độ vẫn đếm theo key trong quest_progress, chỉ HIỂN THỊ là chọn lọc.
// ============================================================

// Luôn hiện cho mọi người, mỗi ngày.
const PINNED = [
    { id: 'daily', name: 'Điểm danh hôm nay',              key: 'daily', required: 1, reward: 500 },
    { id: 'vote',  name: 'Vote cho Waguri trên Top.gg',    key: 'vote',  required: 1, reward: 1000 },
];

// Kho nhiệm vụ để random. Nên có nhiều key khác nhau để mỗi ngày cảm giác mới mẻ.
const POOL = [
    { id: 'work3',   name: 'Chăm chỉ: đi làm 3 lần',            key: 'work',       required: 3,    reward: 500 },
    { id: 'work6',   name: 'Cần mẫn: đi làm 6 lần',             key: 'work',       required: 6,    reward: 900 },
    { id: 'earn3k',  name: 'Kiếm được 3.000 VNĐ',               key: 'earn',       required: 3000, reward: 800 },
    { id: 'earn8k',  name: 'Kiếm được 8.000 VNĐ',               key: 'earn',       required: 8000, reward: 1500 },
    { id: 'gamble2', name: 'Thắng minigame may rủi 2 ván',      key: 'gamble_win', required: 2,    reward: 1000 },
    { id: 'fish3',   name: 'Đi câu cá 3 lần',                   key: 'fish',       required: 3,    reward: 600 },
    { id: 'gather3', name: 'Đào mỏ/chặt gỗ 3 lần',              key: 'gather',     required: 3,    reward: 600 },
    { id: 'bake1',   name: 'Thu doanh thu Tiệm Bánh Gekka 1 lần', key: 'bake',     required: 1,    reward: 600 },
    // (Đã bỏ quest 'give': đếm theo SỐ LẦN chuyển nên alt-farm được ~400đ/ngày bằng cách gửi 1đ cho acc phụ.)
];

// Số nhiệm vụ random thêm mỗi ngày (ngoài PINNED).
const DAILY_POOL_COUNT = 2;

// FNV-1a 32-bit: chuỗi -> uint32 (hạt giống ổn định, không phụ thuộc Math.random).
function hashSeed(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// mulberry32: PRNG tất định từ 1 hạt giống -> [0,1).
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Ngày UTC dạng YYYY-MM-DD — KHỚP mốc ngày mà quest_progress dùng (getQuestRow). */
function todayUTC() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Bộ nhiệm vụ hằng ngày của MỘT người: PINNED + tối đa DAILY_POOL_COUNT quest random (tất định theo user+ngày).
 * Tránh chọn 2 quest trùng key trong ngày (đỡ nhàm). HÀM THUẦN khi truyền dateStr -> dễ test.
 * @param {string} userId
 * @param {string} [dateStr] - YYYY-MM-DD (mặc định hôm nay UTC)
 * @returns {Array<{id,name,key,required,reward}>}
 */
function pickDailyQuests(userId, dateStr = todayUTC()) {
    const rng = mulberry32(hashSeed(`${userId}:${dateStr}`));

    // Fisher–Yates trên bản sao POOL bằng PRNG tất định.
    const shuffled = [...POOL];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const picked = [];
    const usedKeys = new Set();
    for (const q of shuffled) {
        if (usedKeys.has(q.key)) continue; // ưu tiên đa dạng key
        picked.push(q);
        usedKeys.add(q.key);
        if (picked.length >= DAILY_POOL_COUNT) break;
    }

    return [...PINNED, ...picked];
}

module.exports = { PINNED, POOL, DAILY_POOL_COUNT, pickDailyQuests, hashSeed };
