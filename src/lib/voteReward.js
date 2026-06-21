// lib/voteReward.js — Tính thưởng vote (dùng chung cho webhook & lệnh /vote để luôn khớp).
const config = require('../config');

// streak: chuỗi vote hiện tại (>=1). isWeekend: Top.gg tính cuối tuần = 2 lượt -> x2 thưởng nền.
// Bonus streak cộng phẳng (không nhân cuối tuần) để tránh lạm phát.
function computeVoteReward(streak, isWeekend) {
    const mult = isWeekend ? 2 : 1;
    const tiers = Math.min(Math.max((streak || 1) - 1, 0), config.VOTE.STREAK_BONUS_MAX);
    const bonus = tiers * config.VOTE.STREAK_BONUS;
    return {
        coins: config.VOTE.REWARD * mult + bonus,
        exp: config.VOTE.EXP * mult,
        bonus,
    };
}

module.exports = { computeVoteReward };
