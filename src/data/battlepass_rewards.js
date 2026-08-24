// src/data/battlepass_rewards.js
// Cấu hình phần thưởng cho 20 cấp độ Sổ Sứ Mệnh (Battle Pass)
// Mỗi level có thể chứa: free (nhánh thường) và premium (nhánh vip)
// Định dạng phần thưởng: { coins: số_tiền, items: { id_vật_phẩm: số_lượng }, title: 'danh_hiệu' }

module.exports = {
    // Chi phí mua Premium Pass (xu ảo)
    PREMIUM_COST: 200000,
    // Số XP tương ứng với mỗi level Sổ
    XP_PER_LEVEL: 1000,
    // Cấp độ tối đa
    MAX_LEVEL: 20,

    // Cấu hình danh sách phần thưởng theo từng cấp độ (1 -> 20)
    REWARDS: {
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
            premium: { items: { tram_huong_vong: 1 } } // Quà Sử Thi
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
            // Đổi mã theo `0068_rename_item_ids.sql` — migration đó ĐỔI TÊN chứ không xoá:
            //   ve_vip -> banh_kem_dau · ve_dai_gia -> banh_cheesecake
            // Bảng quà này không được cập nhật theo, nên tới 24-08 nó vẫn hứa hai mã đã
            // biến mất khỏi danh mục. `inventory` không có khoá ngoại nên món ma vẫn ghi
            // vào kho được: người chơi nhận một thứ không bán được, không dùng được.
            premium: { items: { banh_kem_dau: 1 } } // Bánh Kem Dâu Gekka (buff +50, 6h)
        },
        16: {
            free: { items: { tam_go: 2 } },
            premium: { items: { vang_dong_tren: 1 } } // Quặng hiếm
        },
        17: {
            free: { coins: 8000 },
            premium: { coins: 25000 }
        },
        18: {
            free: { items: { ca_ngon: 1 } },
            premium: { items: { ky_nam: 1 } } // Gỗ quý
        },
        19: {
            free: { coins: 10000 },
            // Cùng lý do đổi mã như mốc 15 phía trên.
            premium: { items: { banh_cheesecake: 1 } } // Bánh Cheesecake Gekka (buff +100, 8h)
        },
        20: {
            free: { 
                coins: 20000, 
                title: 'Cày Cuốc Chuyên Cần 🌾' 
            },
            premium: { 
                coins: 80000, 
                items: { vuong_mieng_gold: 1 }, // Vương miện huyền thoại
                title: 'Vương Giả Sổ Sứ Mệnh 👑' 
            }
        }
    }
};
