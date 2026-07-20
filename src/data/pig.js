// Dữ liệu hệ nuôi heo: tên giống theo tier giá trị, item thịt theo tier, chi phí & thời gian.

// Tên giống (mỹ thuật) theo tier giá trị bán
const TYPES = {
    // Giữ nguyên các tên meme + thêm tên cute trung tính (vài cái theme bánh/hoa hợp Waguri) cho đa dạng.
    2000: ['Heo Mít Ướt', 'Heo Béo Ị', 'Heo Rừng', 'Heo Vằn', 'Heo Ham Học', 'Heo Ham Hát',
        'Heo Bông', 'Heo Sữa', 'Heo Mây', 'Heo Ú', 'Heo Bánh Bao', 'Heo Mũm Mĩm'],
    2500: ['Heo Nhún Nhảy', 'Heo Lười', 'Heo Đốm', 'BruHeo', 'ShinHeo', 'Heo Ổi', 'Heo Sầu Riêng', 'Heo Long An',
        'Heo Kẹo', 'Heo Dâu', 'Heo Trà Sữa', 'Heo Núc Ních', 'Heo Phính'],
    3000: ['Heo Tí Nị', 'Heo Bò Sữa', 'Heo Điệu', 'Heo Tam Thể',
        'Heo Mochi', 'Heo Kem', 'Heo Mật Ong', 'Heo Matcha', 'Heo Caramel', 'Heo Cục Cưng'],
    3500: ['MessHeo', 'RonalHeo', 'Đô Rê Heo', 'Pikaheo', 'Heo J97', 'Lee Min Heo', 'Heo Xì Trum',
        'Heo Macaron', 'Heo Pudding', 'Heo Hoa Anh Đào', 'Heo Bánh Kem'],
    4000: ['Heo Bạch Tạng', 'Heo Tuyết', 'Heo Bơ Sữa', 'Heo Hồng Ngọc'],
    50000: ['Heo Hologram', 'Heo Kim Cương'],
};

// tier giá trị -> id item thịt (đầu ra)
const MEAT = {
    2000: 'thit_heo_2000', 2500: 'thit_heo_2500', 3000: 'thit_heo_3000',
    3500: 'thit_heo_3500', 4000: 'thit_heo_4000', 50000: 'thit_heo_holo',
};

// BOX: chi phí mở Pigbox. Đặt lệch âm nhẹ so với EV phần thưởng (~2238) theo đúng tỉ lệ lỗ ~21%
// của Plantbox (cost 600 / EV ~476) -> sink nhẹ, không thành máy in tiền. Chỉnh tại đây nếu cần cân lại.
const COST = { BUY: 1000, FEED2: 500, HEAL: 1000, STEAL: 1500, BOX: 2800 };

const TIMINGS = {
    STEP_MS: 15 * 60 * 1000,      // 15' giữa các bước chăm sóc
    SICK_MS: 4 * 60 * 60 * 1000,  // 4h bỏ bê -> bệnh
    STEAL_AGE_MS: 15 * 60 * 1000, // trộm được sau khi heo trưởng thành 15'
};

const STEAL = { ENERGY: 15, SUCCESS: 0.5, FINE: 300, JAIL_HOURS: 24, MAX_FAILS: 3 };

const randType = tier => {
    const a = TYPES[tier] || ['Heo'];
    return a[Math.floor(Math.random() * a.length)];
};

module.exports = { TYPES, MEAT, COST, TIMINGS, STEAL, randType };
