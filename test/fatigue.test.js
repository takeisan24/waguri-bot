const test = require('node:test');
const assert = require('node:assert');
const { conditionMultiplier, conditionFactor } = require('../src/lib/fatigue');
const config = require('../src/config');

test('conditionFactor: >= THRESHOLD -> 1.0, dưới ngưỡng giảm dần về FLOOR', () => {
    const { THRESHOLD, FLOOR } = config.FATIGUE;
    assert.strictEqual(conditionFactor(1.0), 1.0);
    assert.strictEqual(conditionFactor(THRESHOLD), 1.0);     // đúng ngưỡng vẫn full
    assert.strictEqual(conditionFactor(0), FLOOR);            // cạn kiệt -> đáy
    // Giữa 0 và THRESHOLD: tuyến tính
    const mid = conditionFactor(THRESHOLD / 2);
    assert.ok(mid > FLOOR && mid < 1.0);
    assert.ok(Math.abs(mid - (FLOOR + (1 - FLOOR) * 0.5)) < 1e-9);
});

test('conditionMultiplier: năng lượng cao + khỏe -> 100%, không phạt oan', () => {
    // Năng lượng 90/100, sức khỏe 100 -> không giảm gì
    assert.strictEqual(conditionMultiplier(90, 100), 1.0);
    // Đúng ngưỡng 50% năng lượng -> vẫn full
    assert.strictEqual(conditionMultiplier(config.ENERGY.MAX * 0.5, 100), 1.0);
});

test('conditionMultiplier: CHỈ theo năng lượng (sức khỏe không phạt thu nhập)', () => {
    // Năng lượng đầy, sức khỏe thấp -> KHÔNG bị phạt (sức khỏe chỉ là cổng chặn, không trừ tiền)
    assert.strictEqual(conditionMultiplier(config.ENERGY.MAX, 20), 1.0);
    // Chỉ năng lượng quyết định hệ số
    const m = conditionMultiplier(config.ENERGY.MAX * 0.2, 40);
    assert.strictEqual(m, conditionFactor(0.2));
});

test('conditionMultiplier: không bao giờ thấp hơn FLOOR', () => {
    assert.ok(conditionMultiplier(0, 0) >= config.FATIGUE.FLOOR);
    assert.strictEqual(conditionMultiplier(0, 0), config.FATIGUE.FLOOR);
});

// ---------------- Lớp C: sàn mệt kẹp tuyệt đối (spec bịt lỗ /work, S1 #16) ----------------
test('Lớp C: payout × FLOOR <= FLOOR_CAP -> trùng hệt công thức cũ (mọi payout 1..800, mọi năng lượng)', () => {
    const { FLOOR, FLOOR_CAP } = config.FATIGUE;
    for (let payout = 1; payout <= 800; payout++) {
        assert.ok(payout * FLOOR <= FLOOR_CAP, 'điều kiện của ca: payout 1..800 nằm dưới trần');
        for (let energy = 0; energy <= config.ENERGY.MAX; energy++) {
            const cu = conditionMultiplier(energy, 100);
            const moi = conditionMultiplier(energy, 100, config.ENERGY.MAX, payout);
            assert.strictEqual(moi, cu, `payout=${payout} energy=${energy}`);
            assert.strictEqual(Math.round(payout * moi), Math.round(payout * cu));
        }
    }
});

test('Lớp C: dev 3.250, năng lượng 0 -> nhận đúng 400 và % mệt thật là 88 (không phải 50)', () => {
    const f = conditionMultiplier(0, 100, config.ENERGY.MAX, 3250);
    assert.strictEqual(Math.round(3250 * f), config.FATIGUE.FLOOR_CAP);
    assert.strictEqual(Math.round((1 - f) * 100), 88);
});

test('Lớp C: payout vượt trần (dai_gia 7.500) năng lượng 0 -> sàn = FLOOR_CAP, không phải 50%', () => {
    const f = conditionMultiplier(0, 100, config.ENERGY.MAX, 7500);
    assert.strictEqual(Math.round(7500 * f), config.FATIGUE.FLOOR_CAP);
    assert.ok(f < config.FATIGUE.FLOOR, 'hệ số hiệu dụng thấp hơn FLOOR vì sàn bị kẹp');
});

test('Lớp C: payout vượt trần vẫn đơn điệu theo năng lượng và không vượt payout', () => {
    for (const payout of [801, 1625, 3250, 7500, 60000]) {
        let truoc = -1;
        for (let e = 0; e <= config.ENERGY.MAX; e++) {
            const tien = payout * conditionMultiplier(e, 100, config.ENERGY.MAX, payout);
            assert.ok(tien >= truoc - 1e-9, `payout=${payout} e=${e}: tiền giảm khi năng lượng tăng`);
            assert.ok(tien <= payout + 1e-9);
            truoc = tien;
        }
    }
});

test('Lớp C: payout undefined / không hợp lệ -> như cũ', () => {
    for (const e of [0, 10, 30, 49, 80]) {
        const cu = conditionMultiplier(e, 100);
        assert.strictEqual(conditionMultiplier(e, 100, config.ENERGY.MAX, undefined), cu);
        assert.strictEqual(conditionMultiplier(e, 100, config.ENERGY.MAX, 0), cu);
        assert.strictEqual(conditionMultiplier(e, 100, config.ENERGY.MAX, NaN), cu);
        assert.strictEqual(conditionMultiplier(e, 100, config.ENERGY.MAX, -5), cu);
    }
});

test('Lớp C: năng lượng >= 50% -> hệ số 1 dù payout lớn đến đâu', () => {
    for (const payout of [100, 3250, 7500, 60000]) {
        assert.strictEqual(conditionMultiplier(config.ENERGY.MAX * 0.5, 100, config.ENERGY.MAX, payout), 1);
        assert.strictEqual(conditionMultiplier(config.ENERGY.MAX, 100, config.ENERGY.MAX, payout), 1);
    }
});
