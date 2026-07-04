// Test thuần cho lib/bakery — tính doanh thu nướng (mirror RPC). Chạy: npm test
const test = require('node:test');
const assert = require('node:assert');
const { levelInfo, maxLevel, fillingStockGain, computeBake, cakesFromRevenue, computeBonuses, getEffectiveStats } = require('../src/lib/bakery');

const MIN = 60000;

test('levelInfo kẹp trong [1..max] và trả đúng thông số', () => {
    assert.strictEqual(levelInfo(1).rate, 20);
    assert.strictEqual(levelInfo(0).rate, 20);      // <1 -> cấp 1
    assert.strictEqual(levelInfo(99).rate, 100);    // >max -> cấp cao nhất
    assert.strictEqual(maxLevel(), 5);
});

test('computeBake: giới hạn theo THỜI GIAN (kho & trần dư)', () => {
    const r = computeBake({ stock: 1_000_000, level: 1, lastCollectMs: 0 }, 100 * MIN);
    assert.strictEqual(r.bakedMin, 100);
    assert.strictEqual(r.revenue, 2000);            // 100 phút × 20
    assert.strictEqual(r.capped, false);
    assert.strictEqual(r.stockLimited, false);
});

test('computeBake: chạm TRẦN capacity (thời gian dư)', () => {
    const r = computeBake({ stock: 1_000_000, level: 1, lastCollectMs: 0 }, 1000 * MIN);
    assert.strictEqual(r.revenue, 12000);           // = cap cấp 1
    assert.strictEqual(r.capped, true);
});

test('computeBake: hết NGUYÊN LIỆU trước (stock-limited)', () => {
    const r = computeBake({ stock: 1000, level: 1, lastCollectMs: 0 }, 100 * MIN);
    assert.strictEqual(r.revenue, 1000);            // floor(1000/20)=50 phút × 20
    assert.strictEqual(r.newStock, 0);
    assert.strictEqual(r.stockLimited, true);
});

test('computeBake: chưa đủ 1 phút -> không nướng gì', () => {
    const r = computeBake({ stock: 1_000_000, level: 1, lastCollectMs: 0 }, 30 * 1000);
    assert.strictEqual(r.revenue, 0);
    assert.strictEqual(r.newStock, 1_000_000);
});

test('cakesFromRevenue: hybrid tặng bánh mỗi CAKE_EVERY', () => {
    assert.deepStrictEqual(cakesFromRevenue(10000, 20000), { cakes: 2, newProgress: 0 });
    assert.deepStrictEqual(cakesFromRevenue(0, 7000), { cakes: 0, newProgress: 7000 });
    assert.deepStrictEqual(cakesFromRevenue(14000, 2000), { cakes: 1, newProgress: 1000 });
});

test('fillingStockGain: giá × sl × markup (floor)', () => {
    assert.strictEqual(fillingStockGain(3000, 2), 4800);  // 3000×2×0.8
    assert.strictEqual(fillingStockGain(5000, 1), 4000);
    assert.strictEqual(fillingStockGain(0, 5), 0);
});

test('computeBonuses & getEffectiveStats: tính toán chính xác và đầy đủ bonus nhân viên và nội thất', () => {
    const b0 = computeBonuses([], []);
    assert.strictEqual(b0.rateMult, 1.0);
    assert.strictEqual(b0.capMult, 1.0);
    assert.strictEqual(b0.wagePct, 0.0);
    assert.strictEqual(b0.cakeDiscount, 0.0);

    const b1 = computeBonuses(['rintaro'], ['noi_that']);
    assert.strictEqual(b1.rateMult, 1.20);
    assert.strictEqual(b1.capMult, 1.0);
    assert.strictEqual(b1.wagePct, 0.08);

    const b2 = computeBonuses(['ayato'], []);
    assert.strictEqual(b2.cakeDiscount, 0.20);

    const eff = getEffectiveStats(1, ['rintaro', 'subaru'], ['noi_that', 'trang_suc']);
    assert.strictEqual(eff.rate, 25);
    assert.strictEqual(eff.cap, 15000);
});
