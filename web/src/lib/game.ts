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

// Thú cưng (đồng bộ với src/data/pets.js)
export const PET_SPECIES = [
  { id: "meo", emoji: "🐱", skills: [{ lvl: 1 }, { lvl: 5 }, { lvl: 10 }] },
  { id: "cun", emoji: "🐶", skills: [{ lvl: 1 }, { lvl: 5 }, { lvl: 10 }] },
  { id: "rong", emoji: "🐲", skills: [{ lvl: 1 }, { lvl: 5 }, { lvl: 10 }] },
  { id: "cao", emoji: "🦊", skills: [{ lvl: 1 }, { lvl: 5 }, { lvl: 10 }] },
  { id: "tho", emoji: "🐰", skills: [{ lvl: 1 }, { lvl: 5 }, { lvl: 10 }] },
  { id: "gau", emoji: "🐻", skills: [{ lvl: 1 }, { lvl: 5 }, { lvl: 10 }] }
];

export function getPetLevelProgress(exp: number) {
  const e = Math.max(0, exp || 0);
  const level = Math.floor(Math.sqrt(e / 30)) + 1;
  const floor = 30 * (level - 1) * (level - 1);
  const next = 30 * level * level;
  return { level, expIntoLevel: e - floor, expForNextLevel: next - floor };
}

export function findPetSpecies(speciesId: string, locale = "vi") {
  const species = PET_SPECIES.find((s) => s.id === speciesId);
  if (!species) return null;
  return {
    ...species,
    name: t(`game.pets.${species.id}.name`, locale),
    skills: species.skills.map((skill, idx) => ({
      ...skill,
      desc: t(`game.pets.${species.id}.skills.${idx}`, locale)
    }))
  };
}


