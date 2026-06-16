// ============================================================
// lib/leveling.js — Hàm THUẦN (pure) cho hệ thống Level/EXP.
// Không đụng database, không async => dễ test, là "1 nguồn sự thật"
// duy nhất cho mọi nơi cần quy đổi EXP <-> Level.
//
// Công thức: tổng EXP để ĐẠT level L = BASE * (L-1)^2
//   Level 1 = 0 EXP, Level 2 = 100, Level 3 = 400,
//   Level 5 = 1600, Level 15 = 19600
// ============================================================

const { LEVELING } = require('../config');

const BASE = LEVELING.BASE;

/** Tổng EXP cần để ĐẠT một level. */
function expForLevel(level) {
    if (level <= 1) return 0;
    return BASE * (level - 1) * (level - 1);
}

/** Từ tổng EXP -> level hiện tại (level bắt đầu từ 1). */
function getLevelFromExp(exp) {
    if (exp <= 0) return 1;
    return Math.floor(Math.sqrt(exp / BASE)) + 1;
}

/**
 * Thông tin tiến độ level để hiển thị thanh progress.
 * @returns {{ level, currentExp, expIntoLevel, expForNextLevel, expRemaining }}
 */
function getProgress(exp) {
    const level = getLevelFromExp(exp);
    const floor = expForLevel(level);
    const next = expForLevel(level + 1);
    return {
        level,
        currentExp: exp,
        expIntoLevel: exp - floor,
        expForNextLevel: next - floor,
        expRemaining: next - exp,
    };
}

module.exports = { expForLevel, getLevelFromExp, getProgress };
