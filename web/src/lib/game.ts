// Công thức game tái dùng ở web — ĐỒNG BỘ với bot (src/lib/leveling.js + persona.js).
// LƯU Ý: nếu đổi công thức bên bot thì sửa cả ở đây.

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
const TIERS: { min: number; name: string }[] = [
  { min: 300, name: "💞 Tri kỷ" },
  { min: 120, name: "💗 Thân thiết" },
  { min: 50, name: "💓 Bạn thân" },
  { min: 15, name: "💛 Quen biết" },
  { min: 0, name: "🤍 Người mới" },
];

export function affectionTier(aff: number) {
  const a = Number(aff) || 0;
  return (TIERS.find((t) => a >= t.min) || TIERS[TIERS.length - 1]).name;
}

export const fmtVND = (n: number) => Number(n || 0).toLocaleString("vi-VN");

// Thuật toán đổi âm lịch tối giản từ amlich.js (thuật toán Hồ Ngọc Đức)
function jdFromDate(dd: number, mm: number, yy: number) {
  let a = Math.floor((14 - mm) / 12);
  let y = yy + 4800 - a;
  let m = mm + 12 * a - 3;
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

export function getSeasonLabel(seasonId: string) {
  if (seasonId.startsWith("tet_")) {
    const year = seasonId.split("_")[1];
    return `Mùa Tết Nguyên Đán ${year} 🎍`;
  }
  if (seasonId.startsWith("trungthu_")) {
    const year = seasonId.split("_")[1];
    return `Mùa Trung Thu Đoàn Viên ${year} 🥮`;
  }
  const parts = seasonId.split("_");
  if (parts.length >= 3) {
    return `Mùa Thường Niên Tháng ${parts[2]}/${parts[1]} 🌾`;
  }
  return "Mùa Giải Mới 🌸";
}

// Thú cưng (đồng bộ với src/data/pets.js)
export const PET_SPECIES = [
  { id: "meo", name: "Mèo con", emoji: "🐱", skills: [
      { lvl: 1, desc: "🐱 Tăng 2% cơ hội câu cá ngon." },
      { lvl: 5, desc: "💫 Tăng 5% cơ hội câu cá siêu hiếm (Cá Rồng Vàng/Cá Koi Nhật)." },
      { lvl: 10, desc: "💰 Kỹ năng [Chiêu tài tiến bảo]: Tặng ngẫu nhiên 1,000 - 3,000 xu mỗi ngày khi đăng nhập." }
  ]},
  { id: "cun", name: "Cún con", emoji: "🐶", skills: [
      { lvl: 1, desc: "🐶 Tăng 5% tỉ lệ làm việc thành công." },
      { lvl: 5, desc: "🚨 Giảm 15% mức tăng độ nghi ngờ cảnh sát khi làm việc mờ ám." },
      { lvl: 10, desc: "🐕 Kỹ năng [Trung thành]: Bảo vệ 25% số tiền ví không bị mất khi bị cướp." }
  ]},
  { id: "rong", name: "Rồng con", emoji: "🐲", skills: [
      { lvl: 1, desc: "🐲 Tăng 5% EXP nhận được cho mọi hoạt động cày cuốc." },
      { lvl: 5, desc: "✨ Nhận thêm +15% EXP toàn bộ các hoạt động cày cuốc." },
      { lvl: 10, desc: "⏳ Kỹ năng [Bá chủ thời gian]: Giảm 50% thời gian chờ cooldown của lệnh cày cuốc." }
  ]},
  { id: "cao", name: "Cáo nhỏ", emoji: "🦊", skills: [
      { lvl: 1, desc: "🦊 Tăng 5% tỉ lệ cướp tiền thành công." },
      { lvl: 5, desc: "🌾 Tăng 10% năng suất thu hoạch nông sản trồng trọt." },
      { lvl: 10, desc: "🎭 Kỹ năng [Ảo ảnh]: Nhìn thấy trước 1 ô Bingo chưa mở khi chơi minigame." }
  ]},
  { id: "tho", name: "Thỏ con", emoji: "🐰", skills: [
      { lvl: 1, desc: "🐰 Giảm 5% năng lượng tiêu hao khi chặt gỗ / đào mỏ." },
      { lvl: 5, desc: "🥗 Giảm 15% năng lượng tiêu hao khi làm việc." },
      { lvl: 10, desc: "💤 Kỹ năng [Mơ mộng]: Ngủ (/nghingoi) hồi đầy năng lượng nhanh gấp đôi." }
  ]},
  { id: "gau", name: "Gấu con", emoji: "🐻", skills: [
      { lvl: 1, desc: "🐻 Tăng 5% lương cơ bản khi làm việc (/work)." },
      { lvl: 5, desc: "💎 Tăng 10% tỉ lệ rơi quặng quý (Kim cương/Vàng) khi đào mỏ." },
      { lvl: 10, desc: "🌋 Kỹ năng [Địa chấn]: Mỗi lần đào mỏ có 2% cơ hội x5 sản lượng nhận được." }
  ]}
];

export function getPetLevelProgress(exp: number) {
  const e = Math.max(0, exp || 0);
  const level = Math.floor(Math.sqrt(e / 30)) + 1;
  const floor = 30 * (level - 1) * (level - 1);
  const next = 30 * level * level;
  return { level, expIntoLevel: e - floor, expForNextLevel: next - floor };
}

export function findPetSpecies(speciesId: string) {
  return PET_SPECIES.find((s) => s.id === speciesId) || null;
}


