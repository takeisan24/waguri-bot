const db = require('../database.js');
const config = require('../config');

/**
 * Gọi sau mỗi ván cờ bạc. Trả về object { fine, usedIns } nếu bị "công an bắt", hoặc null.
 */
async function applyPolice(userId) {
    const count = await db.bumpPoliceHeat(userId, config.POLICE.DECAY_MS);
    const chance = Math.min(config.POLICE.BASE_CHANCE + count * config.POLICE.STEP, config.POLICE.MAX_CHANCE);
    if (Math.random() >= chance) return null;

    const u = await db.getUser(userId);
    // Phạt theo TỔNG TÀI SẢN (ví+bank) -> không né được bằng cách giấu tiền trong bank.
    const assets = Number(u?.wallet || 0) + Number(u?.bank || 0);
    let fine = Math.floor(assets * config.POLICE.FINE_PCT);
    const usedIns = await db.useInsurance(userId, 'bh_duong_pho');
    if (usedIns) {
        fine = Math.round(fine * 0.5); // Giảm 50% tiền phạt
    }
    await db.resetPoliceHeat(userId); // bị bắt rồi thì reset
    if (fine > 0) await db.chargeAssets(userId, fine); // trừ ví trước, thiếu thì bank
    return { fine, usedIns };
}

module.exports = { applyPolice };
