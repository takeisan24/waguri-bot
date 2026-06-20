// Công thức chế tạo. mats = {itemId: số lượng}. cost = tiền công (sink).
// Chuỗi: nguyên liệu thô (rơi từ /mine /chop) -> tinh chế -> đồ giá trị để /sell.
module.exports = [
    { id: 'tam_go', name: 'Tấm Gỗ', result: 'tam_go', qty: 1, cost: 0, mats: { go: 3 } },
    { id: 'thoi_sat', name: 'Thỏi Sắt', result: 'thoi_sat', qty: 1, cost: 0, mats: { quang_sat: 3 } },
    { id: 'noi_that', name: 'Bộ Nội Thất Gỗ', result: 'noi_that', qty: 1, cost: 1000, mats: { tam_go: 4, thoi_sat: 2 } },
    { id: 'trang_suc', name: 'Trang Sức Đá Quý', result: 'trang_suc', qty: 1, cost: 1000, mats: { da: 6, thoi_sat: 2 } },
    // Đồ nghề đi trộm (heo/cây) — chế từ gỗ + quặng, dùng thay tiền mua đồ nghề
    { id: 'do_trom', name: 'Đồ Nghề Trộm', result: 'do_trom', qty: 1, cost: 0, mats: { go: 2, quang_sat: 1 } },
];
