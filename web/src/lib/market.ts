// ⚠️ PHẢI khớp TUYỆT ĐỐI với src/lib/market.js của bot (test `economy.invariants` chặn lệch).
// `basePrice` = `items.price × 0.5` trong catalog DB — không phải con số tự do.
// Nguồn sự thật khi BÁN là RPC `market_unit_price()` (migration 0098), cùng công thức.
export const BASE_MARKET_ITEMS = {
  trai_1500:      { basePrice: 1500,  category: "crop", emoji: "🍎", nameVi: "Trái Cây Loại Thường",          nameEn: "Common Fruit" },
  trai_2500:      { basePrice: 2500,  category: "crop", emoji: "🍇", nameVi: "Trái Cây Loại Ngon",         nameEn: "Fine Fruit" },
  hoa_2000:       { basePrice: 2000,  category: "crop", emoji: "🌷", nameVi: "Hoa Loại Khá",           nameEn: "Fair Flowers" },
  hoa_3500:       { basePrice: 3500,  category: "crop", emoji: "🌺", nameVi: "Hoa Hảo Hạng",           nameEn: "Premium Flowers" },
  thit_heo_2500:  { basePrice: 2500,  category: "pig",  emoji: "🥓", nameVi: "Thịt Heo Loại Khá",          nameEn: "Fair Pork" },
  ca_tuoi:        { basePrice: 150,   category: "fish", emoji: "🐟", nameVi: "Cá Tươi",           nameEn: "Fresh Fish" },
  ca_koi_nhat:    { basePrice: 40000, category: "fish", emoji: "🐠", nameVi: "Cá Koi Hoàng Gia",            nameEn: "Royal Koi" },
  ca_rong_vang:   { basePrice: 10000, category: "fish", emoji: "🐉", nameVi: "Cá Rồng Kim Long",      nameEn: "Kim Long Arowana" },
  quang_sat:      { basePrice: 50,    category: "ore",  emoji: "🪨", nameVi: "Quặng Sắt",       nameEn: "Iron Ore" },
  vang_dong_tren: { basePrice: 2500,  category: "ore",  emoji: "🥇", nameVi: "Vàng Đông Triều",    nameEn: "Dong Trieu Gold" },
  go:             { basePrice: 30,    category: "wood", emoji: "🪵", nameVi: "Gỗ",            nameEn: "Wood" },
  ky_nam:         { basePrice: 7500,  category: "wood", emoji: "🪵", nameVi: "Kỳ Nam",            nameEn: "Ky Nam Agarwood" },
};

export function computeMarketMultiplier(itemId: string, timeBlock: string): number {
  let hash = 0;
  const str = `${itemId}:${timeBlock}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const normalized = (Math.abs(hash) % 81) / 100;
  return parseFloat((0.70 + normalized).toFixed(2));
}

export function get4HourBlock(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const day = Math.floor((now.getTime() - Date.UTC(year, 0, 0)) / (1000 * 60 * 60 * 24));
  const block = Math.floor(now.getUTCHours() / 4);
  return `${year}-${day}-${block}`;
}

export function getNextShiftCountdown(): string {
  const now = new Date();
  const nextHour = (Math.floor(now.getUTCHours() / 4) + 1) * 4;
  const nextShift = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextHour, 0, 0));
  const diffMs = nextShift.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

export async function getLiveMarketPrices() {
  const currentBlock = get4HourBlock();
  const prevBlock = (() => {
    const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const year = now.getUTCFullYear();
    const day = Math.floor((now.getTime() - Date.UTC(year, 0, 0)) / (1000 * 60 * 60 * 24));
    const block = Math.floor(now.getUTCHours() / 4);
    return `${year}-${day}-${block}`;
  })();

  const results = [];

  for (const [itemId, info] of Object.entries(BASE_MARKET_ITEMS)) {
    const mult = computeMarketMultiplier(itemId, currentBlock);
    const prevMult = computeMarketMultiplier(itemId, prevBlock);
    const price = Math.round(info.basePrice * mult);
    const trend = mult > prevMult ? "UP" : (mult < prevMult ? "DOWN" : "STABLE");

    results.push({
      itemId,
      nameVi: info.nameVi,
      nameEn: info.nameEn,
      category: info.category,
      emoji: info.emoji,
      basePrice: info.basePrice,
      currentPrice: price,
      multiplier: mult,
      pctChange: Math.round((mult - 1) * 100),
      trend,
    });
  }

  return results;
}
