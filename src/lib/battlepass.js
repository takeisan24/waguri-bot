// src/lib/battlepass.js
// Quản lý business logic của Sổ Sứ Mệnh (Battle Pass)
const db = require('../database');
const rewardsConfig = require('../data/battlepass_rewards');
const { solar2lunar } = require('./amlich');
const { activeSeasons } = require('./season');

/**
 * Tự động xác định ID mùa giải hiện tại.
 * Mùa Tết: tet_YYYY (theo năm âm lịch)
 * Mùa Trung Thu: trungthu_YYYY (theo năm âm lịch)
 * Mùa thường niên: normal_YYYY_MM (theo năm_tháng dương lịch)
 */
function getCurrentSeasonId(now = new Date()) {
    const L = solar2lunar(now.getDate(), now.getMonth() + 1, now.getFullYear());
    const seasons = activeSeasons(now);

    if (seasons.has('tet')) {
        return `tet_${L.year}`;
    }
    if (seasons.has('trungthu')) {
        return `trungthu_${L.year}`;
    }
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `normal_${year}_${month}`;
}

/**
 * Trả về tên hiển thị dễ thương của mùa giải hiện tại
 */
function getSeasonLabel(seasonId) {
    if (seasonId.startsWith('tet_')) {
        const year = seasonId.split('_')[1];
        return `Sổ Sứ Mệnh Mùa Tết Nguyên Đán ${year} 🎍`;
    }
    if (seasonId.startsWith('trungthu_')) {
        const year = seasonId.split('_')[1];
        return `Sổ Sứ Mệnh Mùa Trung Thu Đoàn Viên ${year} 🥮`;
    }
    const parts = seasonId.split('_');
    if (parts.length >= 3) {
        return `Sổ Sứ Mệnh Mùa Thường Niên Tháng ${parts[2]}/${parts[1]} 🌾`;
    }
    return 'Sổ Sứ Mệnh Mùa Giải Mới 🌸';
}

/**
 * Cộng XP Sổ Sứ Mệnh
 */
async function addXp(userId, amount) {
    const seasonId = getCurrentSeasonId();
    return db.addPassXp(userId, seasonId, amount, rewardsConfig.XP_PER_LEVEL);
}

/**
 * Cộng XP cày chat AI (có giới hạn 50 XP/ngày)
 */
async function addAiXp(userId) {
    const seasonId = getCurrentSeasonId();
    const maxDailyXp = 50; // Giới hạn 50 XP/ngày
    const xpAmount = 10;   // Mỗi câu chat được 10 XP (tỉ lệ 30% random ở commands/ask)
    return db.addAiChatPassXp(userId, seasonId, xpAmount, rewardsConfig.XP_PER_LEVEL, maxDailyXp);
}

/**
 * Mở khóa Premium Pass bằng xu ảo (200,000 xu)
 */
async function buyPremium(userId) {
    const seasonId = getCurrentSeasonId();
    return db.buyPremiumPass(userId, seasonId, rewardsConfig.PREMIUM_COST);
}

/**
 * Nhận toàn bộ phần thưởng hợp lệ chưa nhận (Free & Premium)
 */
async function claimAll(userId) {
    const seasonId = getCurrentSeasonId();
    let bp = await db.getBattlePass(userId, seasonId);
    if (!bp) {
        bp = {
            xp: 0,
            is_premium: false,
            claimed_free: [],
            claimed_premium: []
        };
    }

    const currentLvl = Math.floor(bp.xp / rewardsConfig.XP_PER_LEVEL);
    if (currentLvl === 0) return { status: 'level_too_low' };

    const freeClaimed = new Set(bp.claimed_free || []);
    const premiumClaimed = new Set(bp.claimed_premium || []);

    const freeToClaim = [];
    const premiumToClaim = [];
    let totalCoins = 0;
    const itemsToGive = {};
    let finalTitle = '';

    // Quét qua các level từ 1 đến level hiện tại của user
    for (let l = 1; l <= currentLvl; l++) {
        const rewards = rewardsConfig.REWARDS[l];
        if (!rewards) continue;

        // Check Free
        if (rewards.free && !freeClaimed.has(l)) {
            freeToClaim.push(l);
            if (rewards.free.coins) totalCoins += Number(rewards.free.coins);
            if (rewards.free.title) finalTitle = rewards.free.title;
            if (rewards.free.items) {
                for (const [id, qty] of Object.entries(rewards.free.items)) {
                    itemsToGive[id] = (itemsToGive[id] || 0) + qty;
                }
            }
        }

        // Check Premium
        if (bp.is_premium && rewards.premium && !premiumClaimed.has(l)) {
            premiumToClaim.push(l);
            if (rewards.premium.coins) totalCoins += Number(rewards.premium.coins);
            if (rewards.premium.title) finalTitle = rewards.premium.title;
            if (rewards.premium.items) {
                for (const [id, qty] of Object.entries(rewards.premium.items)) {
                    itemsToGive[id] = (itemsToGive[id] || 0) + qty;
                }
            }
        }
    }

    if (freeToClaim.length === 0 && premiumToClaim.length === 0) {
        return { status: 'nothing_to_claim' };
    }

    // Format mảng items thành JSONB để RPC parse
    const itemsArray = Object.entries(itemsToGive).map(([id, qty]) => ({ id, qty }));

    const res = await db.claimPassRewardsBulk(
        userId,
        seasonId,
        freeToClaim,
        premiumToClaim,
        totalCoins,
        itemsArray,
        finalTitle,
        rewardsConfig.XP_PER_LEVEL
    );

    if (res === 'ok') {
        return {
            status: 'ok',
            freeLevels: freeToClaim,
            premiumLevels: premiumToClaim,
            coins: totalCoins,
            items: itemsToGive,
            title: finalTitle
        };
    }

    return { status: res };
}

module.exports = {
    getCurrentSeasonId,
    getSeasonLabel,
    addXp,
    addAiXp,
    buyPremium,
    claimAll
};
