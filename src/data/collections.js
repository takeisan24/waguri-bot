// src/data/collections.js — Cấu hình các bộ sưu tập (Album / Pokédex) của bot Waguri.
// Chỉ ghi nhận các vật phẩm tự tay người chơi thu hoạch được (câu cá, đào mỏ, chặt gỗ, chế tạo).

module.exports = [
    {
        id: 'ngu_ong',
        name: 'Ngư Ông Đắc Lợi',
        emoji: '🎣',
        desc: 'Sưu tầm tất cả các loại cá tự câu được ngoài biển khơi 🌊',
        items: ['ca_tuoi', 'ca_ngon', 'ca_hiem', 'ca_rong_vang', 'ca_koi_nhat'],
        reward_coins: 10000,
        title: 'Ngư Ông 🎣'
    },
    {
        id: 'lam_khoang',
        name: 'Lâm Khoáng Đại Sư',
        emoji: '⛏️',
        desc: 'Tự khai thác thành công các khoáng sản & thực vật thô từ thiên nhiên 🌲🪨',
        items: ['da', 'quang_sat', 'go', 'vang_dong_tren', 'ky_nam'],
        reward_coins: 10000,
        title: 'Lâm Khoáng Sư ⛏️'
    },
    {
        id: 'ban_tay_vang',
        name: 'Bàn Tay Vàng',
        emoji: '🔨',
        desc: 'Tự tay chế tạo thành công các công cụ & sản phẩm cao cấp từ bàn chế tạo 🔨',
        items: ['tam_go', 'thoi_sat', 'noi_that', 'trang_suc', 'do_trom', 'tram_huong_vong', 'vuong_mieng_gold'],
        reward_coins: 20000,
        title: 'Bàn Tay Vàng 🔨'
    }
];
