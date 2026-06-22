// lib/guildflags.js — Cờ bật/tắt tính năng theo từng server (admin đặt qua /config).
// Mặc định BẬT (giữ nguyên hành vi cũ) trừ khi được đặt '0'.
const db = require('../database.js');

/** PvP: cướp /rob + trộm heo/cây. Tắt -> các lệnh này từ chối nhẹ nhàng. */
async function pvpEnabled(guildId) {
    if (!guildId) return true;
    const s = await db.getGuildSettings(guildId);
    return s.pvp !== '0';
}

/** Công an bắt cờ bạc có TẠM GIAM (Discord timeout) hay không. Tắt -> chỉ phạt tiền, không timeout. */
async function policeJailEnabled(guildId) {
    if (!guildId) return true;
    const s = await db.getGuildSettings(guildId);
    return s.police_jail !== '0';
}

/** Trò may rủi (đặt cược: bài cào, tài xỉu, xóc đĩa...). Tắt -> các lệnh chơi từ chối nhẹ nhàng. */
async function gamblingEnabled(guildId) {
    if (!guildId) return true;
    const s = await db.getGuildSettings(guildId);
    return s.gambling !== '0';
}

module.exports = { pvpEnabled, policeJailEnabled, gamblingEnabled };
