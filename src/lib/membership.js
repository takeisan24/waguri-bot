// lib/membership.js — Ghi nhận "user nào hoạt động ở guild nào" để /leaderboard
// có thể xếp hạng riêng từng server (kinh tế vốn là global).
// Dedup in-memory: mỗi cặp (guild,user) chỉ ghi DB 1 lần/phiên -> không spam DB ở hot path.
const db = require('../database.js');

const seen = new Set(); // `${guildId}:${userId}`

/** Fire-and-forget: không await, không bao giờ làm hỏng luồng lệnh. */
function recordMembership(guildId, userId) {
    if (!guildId || !userId) return;
    const key = `${guildId}:${userId}`;
    if (seen.has(key)) return;
    seen.add(key);
    db.recordGuildMember(guildId, userId).catch(() => {});
}

module.exports = { recordMembership };
