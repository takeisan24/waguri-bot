// lib/season.js — Đồ giới hạn theo MÙA LỄ (âm lịch). Dùng cùng giờ máy chủ như /amlich.
const { solar2lunar } = require('./amlich');

const SEASON_LABEL = { tet: 'Tết Nguyên Đán 🎍', trungthu: 'Trung Thu 🥮' };

/** Tập các mùa lễ đang MỞ dựa trên tháng âm lịch hôm nay. */
function activeSeasons(now = new Date()) {
    const L = solar2lunar(now.getDate(), now.getMonth() + 1, now.getFullYear());
    const s = new Set();
    if (L.month === 12 || L.month === 1) s.add('tet');   // Tết: tháng Chạp + Giêng
    if (L.month === 8) s.add('trungthu');                // Trung thu: tháng 8 âm
    return s;
}

/** Đồ không gắn mùa -> luôn bán. Đồ mùa -> chỉ khi mùa đang mở. */
function isItemInSeason(item, now = new Date()) {
    if (!item || !item.season) return true;
    return activeSeasons(now).has(item.season);
}

module.exports = { activeSeasons, isItemInSeason, SEASON_LABEL };
