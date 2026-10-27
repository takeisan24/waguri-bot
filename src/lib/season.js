// lib/season.js — Đồ giới hạn theo MÙA LỄ. Dùng cùng giờ máy chủ như /amlich.
//
// HAI KIỂU MÙA, vì lễ Việt và lễ du nhập không đi cùng một cuốn lịch:
//   · ÂM lịch (`LUNAR_MONTHS`): Tết, Trung Thu — mở trọn THÁNG âm, vì ngày dương trôi
//     mỗi năm nên không thể neo cứng.
//   · DƯƠNG lịch (`SOLAR_WINDOWS`): Halloween — neo cứng ngày dương, mở một CỬA SỔ
//     quanh ngày lễ để người chơi kịp mua chứ không chỉ đúng 24 giờ.
//
// Trước 2026-10-27 file này CHỈ có nhánh âm lịch. Gắn `season = 'halloween'` cho một món
// mà không có nhánh dương thì `activeSeasons()` không bao giờ trả về 'halloween' -> món
// đó BIẾN MẤT KHỎI /store vĩnh viễn, im lặng, không log. Cổng: test/halloween_mua_le.test.js.
const { solar2lunar } = require('./amlich');

const SEASON_LABEL = {
    tet: 'Tết Nguyên Đán 🎍',
    trungthu: 'Trung Thu 🥮',
    halloween: 'Halloween 🎃',
};

/** Mùa theo tháng ÂM lịch. id mùa -> các tháng âm mở cửa. */
const LUNAR_MONTHS = {
    tet: [12, 1],   // tháng Chạp + Giêng
    trungthu: [8],  // tháng 8 âm
};

/**
 * Mùa theo cửa sổ ngày DƯƠNG lịch, bao gồm cả hai đầu mút.
 * `from`/`to` là [ngày, tháng]. Cửa sổ vắt qua Giao thừa (từ > tới) cũng hiểu đúng.
 */
const SOLAR_WINDOWS = {
    halloween: { from: [25, 10], to: [1, 11] },
};

/** [ngày, tháng] -> số so sánh được: tháng*100 + ngày. */
const moc = (d, m) => m * 100 + d;

/** Ngày dương `now` có nằm trong cửa sổ không (bao gồm hai đầu mút, hiểu cả cửa sổ vắt năm). */
function trongCuaSoDuong(now, { from, to }) {
    const x = moc(now.getDate(), now.getMonth() + 1);
    const a = moc(from[0], from[1]);
    const b = moc(to[0], to[1]);
    return a <= b ? (x >= a && x <= b) : (x >= a || x <= b);
}

/** Tập các mùa lễ đang MỞ hôm nay (gộp cả nhánh âm lẫn nhánh dương). */
function activeSeasons(now = new Date()) {
    const s = new Set();

    // Nhánh dương không phụ thuộc bảng âm lịch -> tính trước, và nó không thể ném lỗi.
    for (const [id, cuaSo] of Object.entries(SOLAR_WINDOWS)) {
        if (trongCuaSoDuong(now, cuaSo)) s.add(id);
    }

    // Nhánh âm: `solar2lunar` tra bảng và CÓ THỂ ném. Hỏng ở đây chỉ được mất mùa âm,
    // không được kéo theo mùa dương vừa tính đúng ở trên.
    try {
        const L = solar2lunar(now.getDate(), now.getMonth() + 1, now.getFullYear());
        for (const [id, thang] of Object.entries(LUNAR_MONTHS)) {
            if (thang.includes(L.month)) s.add(id);
        }
    } catch { /* lỗi lịch âm -> chỉ còn mùa dương */ }

    return s;
}

/** Đồ không gắn mùa -> luôn bán. Đồ mùa -> chỉ khi mùa đang mở. */
function isItemInSeason(item, now = new Date()) {
    if (!item || !item.season) return true;
    return activeSeasons(now).has(item.season);
}

module.exports = { activeSeasons, isItemInSeason, SEASON_LABEL, LUNAR_MONTHS, SOLAR_WINDOWS };
