import { t } from "./i18n";

const BASE = 100; // = config.LEVELING.BASE

const expForLevel = (lvl: number) => (lvl <= 1 ? 0 : BASE * (lvl - 1) * (lvl - 1));

export function getLevelProgress(exp: number) {
  const e = Math.max(0, Number(exp) || 0);
  const level = e <= 0 ? 1 : Math.floor(Math.sqrt(e / BASE)) + 1;
  const floor = expForLevel(level);
  const next = expForLevel(level + 1);
  return { level, expIntoLevel: e - floor, expForNextLevel: next - floor };
}

// Bậc thân thiết với Waguri (đồng bộ AFFECTION_TIERS trong persona.js)
const TIERS = [
  { min: 300, id: "tri_ky" },
  { min: 120, id: "than_thiet" },
  { min: 50, id: "ban_than" },
  { min: 15, id: "quen_biet" },
  { min: 0, id: "nguoi_moi" },
];

export function affectionTier(aff: number, locale = "vi") {
  const a = Number(aff) || 0;
  const tier = TIERS.find((t) => a >= t.min) || TIERS[TIERS.length - 1];
  return t(`game.affection.${tier.id}`, locale);
}

export const fmtVND = (n: number) => Number(n || 0).toLocaleString("vi-VN");

// Thuật toán đổi âm lịch tối giản từ amlich.js (thuật toán Hồ Ngọc Đức)
function jdFromDate(dd: number, mm: number, yy: number) {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return jd;
}

export function solar2lunar(dd: number, mm: number, yy: number) {
  const jd = jdFromDate(dd, mm, yy);
  // Quy đổi đơn giản tương đối để xác định năm và tháng âm lịch
  // Tháng Chạp/Tháng Giêng âm lịch thường rơi vào khoảng Jan-Feb dương lịch
  // Tháng Tám âm lịch thường rơi vào khoảng Sep-Oct dương lịch
  // Vì vậy ta dùng công thức gần đúng cho chu kỳ trăng
  const k = Math.floor((yy - 1900) * 12.3685);
  const jdn = Math.floor(2415020.75933 + 29.53058868 * k + 0.5);
  const diff = jd - jdn;
  let lunarMonth = Math.floor(diff / 29.53) + 1;
  let lunarYear = yy;
  if (lunarMonth <= 0) {
    lunarMonth += 12;
    lunarYear -= 1;
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  // Điều chỉnh Tết
  if (lunarMonth >= 11 && mm <= 2) lunarYear -= 1;
  return { day: 1, month: lunarMonth, year: lunarYear };
}

export function activeSeasons(now: Date) {
  const set = new Set<string>();
  const L = solar2lunar(now.getDate(), now.getMonth() + 1, now.getFullYear());
  // Mùa Tết: tháng Chạp (12) và tháng Giêng (1) âm lịch
  if (L.month === 12 || L.month === 1) {
    set.add("tet");
  }
  // Mùa Trung Thu: tháng 8 âm lịch
  if (L.month === 8) {
    set.add("trungthu");
  }
  return set;
}

export function getCurrentSeasonId(now = new Date()) {
  const L = solar2lunar(now.getDate(), now.getMonth() + 1, now.getFullYear());
  const seasons = activeSeasons(now);

  if (seasons.has("tet")) {
    return `tet_${L.year}`;
  }
  if (seasons.has("trungthu")) {
    return `trungthu_${L.year}`;
  }
  
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `normal_${year}_${month}`;
}

export function getSeasonLabel(seasonId: string, locale = "vi") {
  if (seasonId.startsWith("tet_")) {
    const year = seasonId.split("_")[1];
    return t("game.seasons.tet", locale, { year });
  }
  if (seasonId.startsWith("trungthu_")) {
    const year = seasonId.split("_")[1];
    return t("game.seasons.trungthu", locale, { year });
  }
  const parts = seasonId.split("_");
  if (parts.length >= 3) {
    return t("game.seasons.normal", locale, { month: parts[2], year: parts[1] });
  }
  return t("game.seasons.new", locale);
}

// ── Thú cưng — GƯƠNG của src/data/pets.js ───────────────────────────────────
//
// Bản cũ khai `skills: [{lvl:1},{lvl:5},{lvl:10}]` cho cả 6 loài và ghép với 18 mô tả
// trong web/src/locales — KHÔNG mô tả nào trong đó tồn tại ở bot. Vì mốc đầu là Lv.1,
// mọi pet vừa nhận nuôi đã thấy ngay một lời hứa hư cấu ("tặng 1.000-3.000 xu mỗi ngày",
// "ngủ hồi năng lượng gấp đôi", "lộ 1 ô Bingo"...). Nay web mô tả ĐÚNG những gì bot làm:
// mỗi loài mang MỘT buff, giá trị nhân theo bậc độ hiếm.
//
// Sửa ở đây thì phải sửa src/data/pets.js và migration 0142 cho khớp — cả ba cố tình
// khai trùng nhau: JS bot để tính, SQL để cưỡng chế, TS này để hiển thị.

export const PET_RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"] as const;
export type PetRarityKey = (typeof PET_RARITY_ORDER)[number];

export const PET_RARITY: Record<PetRarityKey, { emoji: string; color: string; mult: number; minLevel: number }> = {
  common:    { emoji: "⚪", color: "#B0C4DE", mult: 1.0,  minLevel: 1 },
  rare:      { emoji: "🔵", color: "#1E90FF", mult: 1.25, minLevel: 5 },
  epic:      { emoji: "🟣", color: "#9370DB", mult: 1.5,  minLevel: 10 },
  legendary: { emoji: "🟠", color: "#FF8C00", mult: 1.75, minLevel: 15 },
  mythic:    { emoji: "🌟", color: "#FF1493", mult: 2.0,  minLevel: 20 }
};

// Bậc cao nhất lên được CHỈ bằng cấp; từ `epic` phải làm lễ (`/pet ascend`).
const AUTO_RARITY_CAP: PetRarityKey = "rare";

// Mức buff ở bậc ⚪ Thường. Chép TỪ CODE BOT đang chạy, không chép từ mô tả cũ.
export const PET_BUFFS: Record<string, { emoji: string; base: number }> = {
  jackpot: { emoji: "🍀", base: 0.05 },
  guard:   { emoji: "🛡️", base: 0.2 },
  exp:     { emoji: "📘", base: 0.15 },
  thief:   { emoji: "🗝️", base: 0.1 },
  stamina: { emoji: "⚡", base: 0.15 },
  harvest: { emoji: "🌾", base: 0.1 }
};

export const PET_SPECIES: { id: string; emoji: string; rarity: PetRarityKey; buff: string; adoptable: boolean }[] = [
  { id: "meo",  emoji: "🐱", rarity: "common", buff: "jackpot", adoptable: true },
  { id: "cun",  emoji: "🐶", rarity: "common", buff: "guard",   adoptable: true },
  { id: "rong", emoji: "🐲", rarity: "common", buff: "exp",     adoptable: true },
  { id: "cao",  emoji: "🦊", rarity: "common", buff: "thief",   adoptable: true },
  { id: "tho",  emoji: "🐰", rarity: "common", buff: "stamina", adoptable: true },
  { id: "gau",  emoji: "🐻", rarity: "common", buff: "harvest", adoptable: true },
  { id: "ho",           emoji: "🐯", rarity: "epic",      buff: "thief",   adoptable: false },
  { id: "nghe",         emoji: "🗿", rarity: "epic",      buff: "guard",   adoptable: false },
  { id: "chim_lac",     emoji: "🦅", rarity: "legendary", buff: "stamina", adoptable: false },
  { id: "giao_long",    emoji: "🐉", rarity: "legendary", buff: "exp",     adoptable: false },
  { id: "kim_quy",      emoji: "🐢", rarity: "mythic",    buff: "harvest", adoptable: false },
  { id: "phuong_hoang", emoji: "🔥", rarity: "mythic",    buff: "jackpot", adoptable: false }
];

const rarityRank = (k: string) => PET_RARITY_ORDER.indexOf(k as PetRarityKey);

export function getPetLevelProgress(exp: number) {
  const e = Math.max(0, exp || 0);
  const level = Math.floor(Math.sqrt(e / 30)) + 1;
  const floor = 30 * (level - 1) * (level - 1);
  const next = 30 * level * level;
  return { level, expIntoLevel: e - floor, expForNextLevel: next - floor };
}

/** Bậc hiệu lực — SUY RA giống hệt petRarity() ở bot: max(cấp [trần rare], bậc loài, bậc đã lễ). */
export function petRarityKey(pet: { species?: string | null; exp?: number | null; ascended_to?: string | null }): PetRarityKey {
  const { level } = getPetLevelProgress(Number(pet?.exp) || 0);
  let best: PetRarityKey = "common";
  for (const key of PET_RARITY_ORDER) {
    if (rarityRank(key) > rarityRank(AUTO_RARITY_CAP)) break;
    if (level >= PET_RARITY[key].minLevel) best = key;
  }
  const base = PET_SPECIES.find((s) => s.id === pet?.species)?.rarity;
  if (base && rarityRank(base) > rarityRank(best)) best = base;
  const asc = pet?.ascended_to as PetRarityKey | undefined | null;
  if (asc && rarityRank(asc) >= 0 && rarityRank(asc) > rarityRank(best)) best = asc;
  return best;
}

/** Giá trị buff ĐÃ nhân bậc — cùng công thức với bot, nên web không thể hiện số khác bot. */
export function petBuffValue(pet: { species?: string | null; exp?: number | null; ascended_to?: string | null }) {
  const sp = PET_SPECIES.find((s) => s.id === pet?.species);
  if (!sp) return null;
  const b = PET_BUFFS[sp.buff];
  if (!b) return null;
  return { id: sp.buff, emoji: b.emoji, value: b.base * PET_RARITY[petRarityKey(pet)].mult };
}

export function findPetSpecies(speciesId: string, locale = "vi") {
  const species = PET_SPECIES.find((s) => s.id === speciesId);
  if (!species) return null;
  return { ...species, name: t(`game.pets.${species.id}.name`, locale) };
}

/**
 * Một dòng mô tả năng lực loài, số liệu SINH RA từ cùng công thức bot dùng.
 * Không còn bảng mô tả viết tay để trôi khỏi code.
 */
export function describePetBuff(
  pet: { species?: string | null; exp?: number | null; ascended_to?: string | null },
  locale = "vi"
) {
  const b = petBuffValue(pet);
  if (!b) return null;
  const pct = Math.round(b.value * 100);
  return {
    emoji: b.emoji,
    text: t(`game.petBuffs.${b.id}`, locale, { pct: String(pct) })
  };
}


