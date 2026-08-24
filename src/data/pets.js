// ============================================================
//  Thú cưng — NGUỒN SỰ THẬT DUY NHẤT cho loài, bậc độ hiếm và buff.
//
//  Trước bản này, buff loài nằm rải rác ở 5 tệp (work.js, rob.js, gather.js,
//  fish.js, database.js) dưới dạng `pet.species === 'meo'`, còn tệp này chỉ có
//  id/name/emoji. Hệ quả: web tự bịa ra 18 mô tả kỹ năng không tồn tại, và
//  không tầng nào đối chiếu được với tầng nào.
//
//  Nay: loài khai `buff` (một trong 6 loại), bậc khai `mult`. Điểm gọi hỏi
//  `petBuffValue(pet, 'harvest')` thay vì so chuỗi loài.
//
//  Level = floor(sqrt(exp/30)) + 1  (GIỮ NGUYÊN — đổi sẽ làm pet hiện có nhảy cấp).
// ============================================================

// ── Bậc độ hiếm ────────────────────────────────────────────────────────────
// Dùng chung khoá với độ hiếm vật phẩm (`rarity.*` trong locale) + 1 khoá mới `mythic`.
// `minLevel` = cấp tối thiểu để đủ tư cách lên bậc.
// `ascend`   = các bộ lễ vật thay thế nhau (OR); null = lên tự động, không cần lễ.
const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

const RARITY = {
    common:    { key: 'common',    emoji: '⚪', color: '#B0C4DE', mult: 1.00, minLevel: 1,  ascend: null },
    rare:      { key: 'rare',      emoji: '🔵', color: '#1E90FF', mult: 1.25, minLevel: 5,  ascend: null },
    epic:      { key: 'epic',      emoji: '🟣', color: '#9370DB', mult: 1.50, minLevel: 10, ascend: [['ca_rong_vang'], ['vang_dong_tren']] },
    legendary: { key: 'legendary', emoji: '🟠', color: '#FF8C00', mult: 1.75, minLevel: 15, ascend: [['ca_koi_nhat', 'ky_nam']] },
    mythic:    { key: 'mythic',    emoji: '🌟', color: '#FF1493', mult: 2.00, minLevel: 20, ascend: [['vuong_mieng_gold', 'ca_koi_nhat', 'ky_nam']] },
};

// Bậc cao nhất đạt được CHỈ bằng cấp (không lễ vật). Từ `epic` trở lên bắt buộc làm lễ.
const AUTO_RARITY_CAP = 'rare';

// ── Sáu loại buff ──────────────────────────────────────────────────────────
// `base` là mức ở bậc ⚪ Thường; bậc cao nhân với `RARITY[x].mult`.
// Con số base chép TỪ CODE ĐANG CHẠY, không chép từ mô tả trên web (mô tả web sai 2-3 lần).
const BUFFS = {
    jackpot: { id: 'jackpot', emoji: '🍀', base: 0.05, unit: 'point', where: 'work.js' },              // +5 điểm % tỉ lệ jackpot /work
    guard:   { id: 'guard',   emoji: '🛡️', base: 0.20, unit: 'point', where: 'rob.js' },               // -20 điểm % tỉ lệ kẻ cướp thành công
    exp:     { id: 'exp',     emoji: '📘', base: 0.15, unit: 'pct',   where: 'work.js/gather.js' },    // +15% EXP
    thief:   { id: 'thief',   emoji: '🗝️', base: 0.10, unit: 'pct',   where: 'rob.js' },               // +10% tiền cướp (+ giảm phạt, xem THIEF_FINE_BASE)
    stamina: { id: 'stamina', emoji: '⚡', base: 0.15, unit: 'pct',   where: 'gather.js' },            // -15% năng lượng cày
    harvest: { id: 'harvest', emoji: '🌾', base: 0.10, unit: 'pct',   where: 'gather.js/fish.js/db' }, // +10% sản lượng
};

// Buff `thief` có hai vế; vế giảm tiền phạt neo riêng.
const THIEF_FINE_BASE = 0.15;

// ── Loài ───────────────────────────────────────────────────────────────────
// `rarity` = BẬC KHỞI ĐIỂM. Sáu loài cũ đều ⚪ Thường: bậc phải kiếm được, không
// phải chọn được — nếu để Rồng con khởi điểm 🔵 mà vẫn nhận nuôi miễn phí thì
// mọi người chọn Rồng và bậc mất hết ý nghĩa.
// `adoptable: false` = chỉ nở ra từ Trứng nhặt được khi cày.
const SPECIES = [
    // Sáu loài gốc — `/pet adopt` miễn phí
    { id: 'meo',  name: 'Mèo con',  emoji: '🐱', rarity: 'common', buff: 'jackpot', adoptable: true },
    { id: 'cun',  name: 'Cún con',  emoji: '🐶', rarity: 'common', buff: 'guard',   adoptable: true },
    { id: 'rong', name: 'Rồng con', emoji: '🐲', rarity: 'common', buff: 'exp',     adoptable: true },
    { id: 'cao',  name: 'Cáo nhỏ',  emoji: '🦊', rarity: 'common', buff: 'thief',   adoptable: true },
    { id: 'tho',  name: 'Thỏ con',  emoji: '🐰', rarity: 'common', buff: 'stamina', adoptable: true },
    { id: 'gau',  name: 'Gấu con',  emoji: '🐻', rarity: 'common', buff: 'harvest', adoptable: true },

    // Loài nở từ Trứng — khởi điểm sẵn ở bậc cao, bỏ qua toàn bộ đường thăng bậc.
    // Tái dùng đúng 6 loại buff trên: khác vỏ, không khác logic -> không thêm bề mặt lỗi.
    { id: 'ho',           name: 'Hổ Con Đông Dương', emoji: '🐯', rarity: 'epic',      buff: 'thief',   adoptable: false },
    { id: 'nghe',         name: 'Nghê Đá Giữ Đền',   emoji: '🗿', rarity: 'epic',      buff: 'guard',   adoptable: false },
    { id: 'chim_lac',     name: 'Chim Lạc',          emoji: '🦅', rarity: 'legendary', buff: 'stamina', adoptable: false },
    { id: 'giao_long',    name: 'Giao Long',         emoji: '🐉', rarity: 'legendary', buff: 'exp',     adoptable: false },
    { id: 'kim_quy',      name: 'Kim Quy Hồ Gươm',   emoji: '🐢', rarity: 'mythic',    buff: 'harvest', adoptable: false },
    { id: 'phuong_hoang', name: 'Phượng Hoàng Lửa',  emoji: '🔥', rarity: 'mythic',    buff: 'jackpot', adoptable: false },
];

// ── Trứng ──────────────────────────────────────────────────────────────────
// Tỉ lệ neo vào thang rơi SẴN CÓ, không bịa: Vàng Đông Triều 1,0% · Kỳ Nam 0,5%
// · Cá Koi thực tế 0,1% (config.COLLECTIONS.DROP_RATES).
// Nhịp cày đo trên prod: 36 lượt / 7 người trong cả đời sổ cái — nên tỉ lệ kiểu
// 0,01% sẽ là bậc KHÔNG TỒN TẠI, đúng cái bẫy đã giết Stage 3 cũ.
const EGGS = {
    trung_su_thi:      { id: 'trung_su_thi',      emoji: '🥚', rarity: 'epic',      rate: 0.030 },
    trung_huyen_thoai: { id: 'trung_huyen_thoai', emoji: '🪺', rarity: 'legendary', rate: 0.008 },
    trung_than_thoai:  { id: 'trung_than_thoai',  emoji: '🌟', rarity: 'mythic',    rate: 0.0015 },
};

// ── Công thức cấp ──────────────────────────────────────────────────────────
const petLevel = exp => Math.floor(Math.sqrt(Math.max(0, exp) / 30)) + 1;
const expForLevel = lvl => 30 * (lvl - 1) * (lvl - 1);
const findSpecies = id => SPECIES.find(s => s.id === id);

const rarityRank = key => RARITY_ORDER.indexOf(key);

/**
 * Bậc hiệu lực của một pet — SUY RA, không đọc cột lưu sẵn.
 * = cao nhất trong ba nguồn: bậc theo cấp (trần `AUTO_RARITY_CAP`), bậc khởi điểm
 *   của loài, và bậc đã làm lễ (`ascended_to`).
 * Suy ra thay vì lưu để không trôi số khi đổi cân bằng — bài học giá chợ (d90799f).
 */
function petRarity(pet) {
    if (!pet) return RARITY.common;
    const lvl = petLevel(pet.exp);
    let best = 'common';
    for (const key of RARITY_ORDER) {
        if (rarityRank(key) > rarityRank(AUTO_RARITY_CAP)) break;
        if (lvl >= RARITY[key].minLevel) best = key;
    }
    const base = findSpecies(pet.species)?.rarity || 'common';
    if (rarityRank(base) > rarityRank(best)) best = base;
    const asc = pet.ascended_to;
    if (asc && RARITY[asc] && rarityRank(asc) > rarityRank(best)) best = asc;
    return RARITY[best];
}

/** Loại buff của pet ('jackpot' | 'guard' | ...), hoặc null nếu loài lạ. */
const buffOf = pet => (pet ? findSpecies(pet.species)?.buff || null : null);

/** Hệ số nhân theo bậc. 1 nếu không có pet -> điểm gọi nhân vô hại. */
const rarityMult = pet => (pet ? petRarity(pet).mult : 1);

/**
 * Giá trị buff ĐÃ nhân bậc. Trả 0 nếu không có pet hoặc pet không mang buff đó,
 * nên điểm gọi chỉ cần `payout * (1 + petBuffValue(pet, 'harvest'))` — không còn
 * `if (pet.species === 'gau' && petLevel(...) >= 5)` rải khắp nơi.
 */
function petBuffValue(pet, buffId) {
    if (!pet || buffOf(pet) !== buffId) return 0;
    const b = BUFFS[buffId];
    return b ? b.base * rarityMult(pet) : 0;
}

/** Vế thứ hai của buff `thief`: tỉ lệ giảm tiền phạt khi cướp trượt. */
const petThiefFineCut = pet => (buffOf(pet) === 'thief' ? THIEF_FINE_BASE * rarityMult(pet) : 0);

/** Bậc kế tiếp có thể thăng lên, hoặc null nếu đã kịch trần. */
function nextRarity(pet) {
    const i = rarityRank(petRarity(pet).key);
    return i >= 0 && i < RARITY_ORDER.length - 1 ? RARITY[RARITY_ORDER[i + 1]] : null;
}

module.exports = {
    SPECIES, RARITY, RARITY_ORDER, BUFFS, EGGS, AUTO_RARITY_CAP, THIEF_FINE_BASE,
    petLevel, expForLevel, findSpecies,
    petRarity, buffOf, rarityMult, petBuffValue, petThiefFineCut, nextRarity, rarityRank,
};
