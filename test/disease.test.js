const test = require('node:test');
const assert = require('node:assert');
const { diseaseOutcome } = require('../src/lib/disease');
const config = require('../src/config');

test('Disease: đang bệnh -> phạt thu nhập + mất máu', () => {
    const o = diseaseOutcome({ sick: true, health: 80 }, 0.99);
    assert.strictEqual(o.incomeMult, config.DISEASE.SICK_INCOME_MULT);
    assert.strictEqual(o.healthLoss, config.DISEASE.SICK_HEALTH_LOSS);
    assert.strictEqual(o.newlySick, false);
});

test('Disease: chưa bệnh, roll thấp -> đổ bệnh', () => {
    const o = diseaseOutcome({ sick: false, health: 100 }, 0); // roll 0 < chance
    assert.strictEqual(o.newlySick, true);
    assert.strictEqual(o.incomeMult, 1);
    assert.strictEqual(o.healthLoss, 0);
});

test('Disease: chưa bệnh, roll cao -> không sao', () => {
    const o = diseaseOutcome({ sick: false, health: 100 }, 0.99);
    assert.strictEqual(o.newlySick, false);
    assert.strictEqual(o.note, '');
});

test('Disease: máu thấp -> tỉ lệ mắc cao gấp đôi', () => {
    const d = config.DISEASE;
    const roll = d.CATCH_CHANCE * 1.5; // > base, < base*2 -> chỉ mắc khi máu thấp
    const lowHealth = diseaseOutcome({ sick: false, health: d.LOW_HEALTH_THRESHOLD - 1 }, roll);
    const okHealth = diseaseOutcome({ sick: false, health: 100 }, roll);
    assert.strictEqual(lowHealth.newlySick, true);
    assert.strictEqual(okHealth.newlySick, false);
});
