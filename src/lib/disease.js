// lib/disease.js — Hệ Bệnh: làm việc quá sức có thể đổ bệnh; bệnh giảm thu nhập + máu,
// chữa ở /hospital. Tách phần QUYẾT ĐỊNH (hàm thuần, dễ test) khỏi phần GỌI DB.
const config = require('../config');
const { t } = require('./i18n');

/** Quyết định bệnh theo trạng thái người chơi + 1 số ngẫu nhiên `roll` (0..1). HÀM THUẦN.
 *  Trả: { incomeMult, healthLoss, newlySick, note }. */
function diseaseOutcome(user, roll, locale = 'vi') {
    const d = config.DISEASE;
    if (user && user.sick) {
        return {
            incomeMult: d.SICK_INCOME_MULT,
            healthLoss: d.SICK_HEALTH_LOSS,
            newlySick: false,
            note: t(locale, 'disease.sick_active_note', { pct: Math.round((1 - d.SICK_INCOME_MULT) * 100), loss: d.SICK_HEALTH_LOSS }),
        };
    }
    const health = user && user.health != null ? user.health : 100;
    const chance = d.CATCH_CHANCE * (health < d.LOW_HEALTH_THRESHOLD ? d.LOW_HEALTH_MULT : 1);
    if (roll < chance) {
        return {
            incomeMult: 1,
            healthLoss: 0,
            newlySick: true,
            note: t(locale, 'disease.newly_sick_note'),
        };
    }
    return { incomeMult: 1, healthLoss: 0, newlySick: false, note: '' };
}

/** Áp dụng bệnh sau một hành động kiếm tiền: trừ máu / đánh dấu bệnh qua DB.
 *  Trả { incomeMult, note } để caller nhân vào payout & ghép mô tả. */
async function applyDisease(db, userId, user, locale = 'vi') {
    const out = diseaseOutcome(user, Math.random(), locale);
    // `disease.sick_active_note` nêu thẳng "mất {loss} máu", nên ghi hụt là câu đó sai.
    // Chỉ ghi log chứ không đổi chữ: đây là HÌNH PHẠT hụt theo hướng có lợi cho người chơi,
    // và `common.payout_unconfirmed` nói về "phần thưởng" nên dán vào đây sẽ gây hiểu sai hơn.
    if (out.healthLoss > 0 && (await db.addHealth(userId, -out.healthLoss)) === null) {
        console.error(`[DISEASE] ghi máu hụt user=${userId} loss=${out.healthLoss} — note đã khoe số này`);
    }
    if (out.newlySick) await db.setSick(userId, true);
    return { incomeMult: out.incomeMult, note: out.note };
}

module.exports = { diseaseOutcome, applyDisease };
