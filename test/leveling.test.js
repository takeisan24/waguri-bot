// Test thuần cho lib/leveling — chạy bằng: npm test
const test = require('node:test');
const assert = require('node:assert');
const { expForLevel, getLevelFromExp, getProgress } = require('../src/lib/leveling');

test('expForLevel theo công thức BASE*(L-1)^2', () => {
    assert.strictEqual(expForLevel(1), 0);
    assert.strictEqual(expForLevel(2), 100);
    assert.strictEqual(expForLevel(3), 400);
    assert.strictEqual(expForLevel(5), 1600);
    assert.strictEqual(expForLevel(15), 19600);
});

test('getLevelFromExp quy đổi ngược chính xác', () => {
    assert.strictEqual(getLevelFromExp(0), 1);
    assert.strictEqual(getLevelFromExp(99), 1);
    assert.strictEqual(getLevelFromExp(100), 2);
    assert.strictEqual(getLevelFromExp(399), 2);
    assert.strictEqual(getLevelFromExp(400), 3);
    assert.strictEqual(getLevelFromExp(19600), 15);
});

test('getProgress tính EXP còn lại tới level kế', () => {
    const p = getProgress(150);
    assert.strictEqual(p.level, 2);
    assert.strictEqual(p.expIntoLevel, 50);   // 150 - 100
    assert.strictEqual(p.expForNextLevel, 300); // 400 - 100
    assert.strictEqual(p.expRemaining, 250);   // 400 - 150
});
