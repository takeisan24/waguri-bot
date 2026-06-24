// Công thức chế tạo. mats = {itemId: số lượng}. cost = tiền công (sink).
// Chuỗi: nguyên liệu thô (rơi từ /mine /chop) -> tinh chế -> đồ giá trị để /sell.
module.exports = [
    { id: 'tam_go', name: 'Tấm Gỗ', result: 'tam_go', qty: 1, cost: 0, mats: { go: 3 } },
    { id: 'thoi_sat', name: 'Thỏi Sắt', result: 'thoi_sat', qty: 1, cost: 0, mats: { quang_sat: 3 } },
    // Tiền công đặt sao cho: mua HẾT nguyên liệu từ shop + tiền công > giá bán lại (50% giá item)
    // -> chặn arbitrage "mua shop → chế → bán lời". Dùng nguyên liệu TỰ KIẾM (/mine /chop) vẫn lãi tốt.
    //   noi_that: mua 12 gỗ(720)+6 quặng(600)=1320 + công 1300 = 2620 > bán 2500 (lỗ nhẹ nếu mua shop).
    //   trang_suc: mua 6 đá(240)+6 quặng(600)=840 + công 2200 = 3040 > bán 3000 (lỗ nhẹ nếu mua shop).
    { id: 'noi_that', name: 'Bộ Nội Thất Gỗ', result: 'noi_that', qty: 1, cost: 1300, mats: { tam_go: 4, thoi_sat: 2 } },
    { id: 'trang_suc', name: 'Trang Sức Đá Quý', result: 'trang_suc', qty: 1, cost: 2200, mats: { da: 6, thoi_sat: 2 } },
    // Đồ nghề đi trộm (heo/cây) — chế từ gỗ + quặng, dùng thay tiền mua đồ nghề
    { id: 'do_trom', name: 'Đồ Nghề Trộm', result: 'do_trom', qty: 1, cost: 0, mats: { go: 2, quang_sat: 1 } },
];
