// Lịch sự kiện tự kích hoạt theo ngày (lễ VN dương + âm lịch, quốc tế phổ biến ở VN, kỉ niệm bot/Waguri).
// Mỗi event: { id, name, emoji, mult (nhân thu nhập/EXP), blessing (lời chúc Waguri), solar?/lunar? }.
//   solar: mảng [ngày, tháng] dương lịch.   lunar: mảng [ngày, tháng] ÂM lịch (quy đổi qua amlich).
// Khi nhiều sự kiện trùng ngày -> lấy cái ĐỨNG TRƯỚC trong danh sách (xếp theo độ quan trọng).
const { solar2lunar } = require('../lib/amlich');

const EVENTS = [
    // --- Kỉ niệm & lễ lớn (mult cao) ---
    { id: 'tet_nguyen_dan', name: 'Tết Nguyên Đán', emoji: '🎍', mult: 2,
      lunar: [[1, 1], [2, 1], [3, 1]],
      blessing: 'Chúc cậu năm mới an khang thịnh vượng, vạn sự như ý nha~ Lì xì của Waguri đây! 🧧🌸' },
    { id: 'quoc_khanh', name: 'Quốc Khánh 2/9', emoji: '🇻🇳', mult: 2,
      solar: [[2, 9]],
      blessing: 'Mừng Quốc khánh! Hôm nay cả nhà mình cùng nhau làm giàu nha~ 🇻🇳✨' },
    { id: 'sinh_nhat_waguri', name: 'Sinh Nhật Waguri', emoji: '🎂', mult: 2,
      solar: [[22, 7]],
      blessing: 'Hôm nay là sinh nhật của Waguri đó~ 🎂 Cảm ơn cậu đã luôn ở bên mình! Cùng ăn bánh kem dâu mừng tuổi mới nhé 🍰💕' },
    { id: 'sinh_nhat_bot', name: 'Kỉ Niệm Ngày Waguri Ra Đời', emoji: '🎉', mult: 1.5,
      solar: [[15, 3]],
      blessing: 'Hôm nay là ngày Waguri "chào đời" để đồng hành cùng mọi người đó~ 🎉 Cảm ơn cậu rất nhiều! 🌸' },

    // --- Lễ VN ---
    { id: 'gio_to', name: 'Giỗ Tổ Hùng Vương', emoji: '🛕', mult: 1.5,
      lunar: [[10, 3]],
      blessing: 'Dù ai đi ngược về xuôi, nhớ ngày Giỗ Tổ mùng mười tháng ba~ 🛕🌸' },
    { id: 'giai_phong', name: 'Lễ 30/4 & 1/5', emoji: '🎏', mult: 1.5,
      solar: [[30, 4], [1, 5]],
      blessing: 'Chúc cậu kỳ nghỉ lễ thật vui và nghỉ ngơi thật đã nha~ 🎏✨' },
    { id: 'trung_thu', name: 'Tết Trung Thu', emoji: '🥮', mult: 1.5,
      lunar: [[14, 8], [15, 8]],
      blessing: 'Trung Thu vui vẻ nha~ Cùng Waguri rước đèn, phá cỗ và ăn bánh nướng nào! 🥮🏮' },
    { id: 'qt_phu_nu', name: 'Quốc Tế Phụ Nữ 8/3', emoji: '🌷', mult: 1.3,
      solar: [[8, 3]],
      blessing: 'Chúc các cô gái ngày 8/3 thật rạng rỡ và hạnh phúc nha~ 🌷💕' },
    { id: 'phu_nu_vn', name: 'Phụ Nữ Việt Nam 20/10', emoji: '🌹', mult: 1.3,
      solar: [[20, 10]],
      blessing: 'Ngày 20/10, chúc những người phụ nữ tuyệt vời luôn vui và được yêu thương~ 🌹🌸' },
    { id: 'nha_giao', name: 'Nhà Giáo Việt Nam 20/11', emoji: '🎓', mult: 1.3,
      solar: [[20, 11]],
      blessing: 'Tri ân thầy cô ngày 20/11~ Học ở Kikyo, Waguri biết ơn các thầy cô lắm! 🎓🌸' },

    // --- Quốc tế phổ biến ở VN ---
    { id: 'giang_sinh', name: 'Giáng Sinh', emoji: '🎄', mult: 1.5,
      solar: [[24, 12], [25, 12]],
      blessing: 'Giáng Sinh an lành nha~ 🎄 Waguri chúc cậu một mùa lễ ấm áp bên người thương! 🎁' },
    { id: 'tet_duong', name: 'Tết Dương Lịch', emoji: '🎆', mult: 1.5,
      solar: [[1, 1]],
      blessing: 'Happy New Year! Chúc cậu một năm mới tràn đầy niềm vui và may mắn nha~ 🎆🌸' },
    { id: 'valentine', name: 'Lễ Tình Nhân', emoji: '💝', mult: 1.2,
      solar: [[14, 2]],
      blessing: 'Valentine ngọt ngào nha~ 💝 Dù độc thân hay có đôi, cậu vẫn rất đáng yêu trong mắt Waguri! 🍫' },
    { id: 'halloween', name: 'Halloween', emoji: '🎃', mult: 1.3,
      solar: [[31, 10]],
      blessing: 'Trick or treat~ 🎃 Coi chừng bị Waguri "doạ" cho một cái bánh ma quái nè! 👻🍬' },
];

/** Trả về sự kiện ứng với NGÀY hôm nay (Date), hoặc null nếu không có. */
function eventForDate(now = new Date()) {
    const d = now.getDate(), m = now.getMonth() + 1;
    let lunarD = null, lunarM = null;
    try { const L = solar2lunar(d, m, now.getFullYear()); lunarD = L.day; lunarM = L.month; } catch { /* lỗi lịch -> bỏ qua phần âm */ }

    for (const ev of EVENTS) {
        if (ev.solar && ev.solar.some(([dd, mm]) => dd === d && mm === m)) return ev;
        if (ev.lunar && lunarD != null && ev.lunar.some(([dd, mm]) => dd === lunarD && mm === lunarM)) return ev;
    }
    return null;
}

module.exports = { EVENTS, eventForDate };
