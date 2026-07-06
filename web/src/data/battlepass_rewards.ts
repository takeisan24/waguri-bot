// web/src/data/battlepass_rewards.ts
// Cấu hình phần thưởng cho 20 cấp độ Sổ Sứ Mệnh (Đồng bộ với Bot)

export type RewardTrack = {
  coins?: number;
  items?: { [key: string]: number };
  title?: string;
};

export type LevelReward = {
  free: RewardTrack;
  premium?: RewardTrack;
};

export const PREMIUM_COST = 200000;
export const XP_PER_LEVEL = 1000;
export const MAX_LEVEL = 20;

export const REWARDS: { [level: number]: LevelReward } = {
  1: {
    free: { coins: 1000 },
    premium: { coins: 3000 }
  },
  2: {
    free: { items: { banh_mi: 1 } },
    premium: { items: { bo_hoa: 1 } }
  },
  3: {
    free: { coins: 1500 },
    premium: { items: { thoi_sat: 1 } }
  },
  4: {
    free: { items: { da: 3 } },
    premium: { coins: 5000 }
  },
  5: {
    free: { coins: 2000 },
    premium: { items: { soda_gekka: 1 } }
  },
  6: {
    free: { items: { go: 3 } },
    premium: { items: { tam_go: 2 } }
  },
  7: {
    free: { coins: 2500 },
    premium: { coins: 8000 }
  },
  8: {
    free: { items: { banh_su_kem: 1 } },
    premium: { items: { do_trom: 1 } }
  },
  9: {
    free: { coins: 3000 },
    premium: { items: { ca_ngon: 2 } }
  },
  10: {
    free: { items: { hop_qua: 1 } },
    premium: { items: { tram_huong_vong: 1 } }
  },
  11: {
    free: { coins: 4000 },
    premium: { coins: 12000 }
  },
  12: {
    free: { items: { banh_flan: 1 } },
    premium: { items: { thoi_sat: 3 } }
  },
  13: {
    free: { coins: 5000 },
    premium: { items: { ca_hiem: 1 } }
  },
  14: {
    free: { items: { gau_bong: 1 } },
    premium: { coins: 18000 }
  },
  15: {
    free: { coins: 6000 },
    premium: { items: { ve_vip: 1 } }
  },
  16: {
    free: { items: { tam_go: 2 } },
    premium: { items: { vang_dong_tren: 1 } }
  },
  17: {
    free: { coins: 8000 },
    premium: { coins: 25000 }
  },
  18: {
    free: { items: { ca_ngon: 1 } },
    premium: { items: { ky_nam: 1 } }
  },
  19: {
    free: { coins: 10000 },
    premium: { items: { ve_dai_gia: 1 } }
  },
  20: {
    free: { 
      coins: 20000, 
      title: "Cày Cuốc Chuyên Cần 🌾" 
    },
    premium: { 
      coins: 80000, 
      items: { vuong_mieng_gold: 1 }, 
      title: "Vương Giả Sổ Sứ Mệnh 👑" 
    }
  }
};
