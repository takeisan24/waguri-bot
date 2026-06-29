// lib/disease.js — Hệ Bệnh: làm việc quá sức có thể đổ bệnh; bệnh giảm thu nhập + máu,
// chữa ở /hospital. Tách phần QUYẾT ĐỊNH (hàm thuần, dễ test) khỏi phần GỌI DB.
const config = require('../config');

/** Quyết định bệnh theo trạng thái người chơi + 1 số ngẫu nhiên `roll` (0..1). HÀM THUẦN.
 *  Trả: { incomeMult, healthLoss, newlySick, note }. */
function diseaseOutcome(user, roll) {
    const d = config.DISEASE;
    if (user && user.sick) {
        return {
            incomeMult: d.SICK_INCOME_MULT,
            healthLoss: d.SICK_HEALTH_LOSS,
            newlySick: false,
            note: `🤒 Cậu đang bị bệnh — thu nhập giảm ${Math.round((1 - d.SICK_INCOME_MULT) * 100)}% & mất ${d.SICK_HEALTH_LOSS} máu. Tới \`/hospital\` chữa nhé!`,
        };
    }
    const health = user && user.health != null ? user.health : 100;
    const chance = d.CATCH_CHANCE * (health < d.LOW_HEALTH_THRESHOLD ? d.LOW_HEALTH_MULT : 1);
    if (roll < chance) {
        return {
            incomeMult: 1,
            healthLoss: 0,
            newlySick: true,
            note: '🤒 Ôi, cậu vừa **đổ bệnh** do làm quá sức! Thu nhập sẽ giảm cho tới khi `/hospital` chữa.',
        };
    }
    return { incomeMult: 1, healthLoss: 0, newlySick: false, note: '' };
}

/** Áp dụng bệnh sau một hành động kiếm tiền: trừ máu / đánh dấu bệnh qua DB.
 *  Trả { incomeMult, note } để caller nhân vào payout & ghép mô tả. */
async function applyDisease(db, userId, user) {
    const out = diseaseOutcome(user, Math.random());
    if (out.healthLoss > 0) await db.addHealth(userId, -out.healthLoss);
    if (out.newlySick) await db.setSick(userId, true);
    return { incomeMult: out.incomeMult, note: out.note };
}

module.exports = { diseaseOutcome, applyDisease };
