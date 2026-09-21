const test = require('node:test');
const assert = require('node:assert');
const {
    computeMarketMultiplier,
    murmurMix32,
    BASE_MARKET_ITEMS,
    getLiveMarketPrices,
    getMarketHistory,
    generateSparkline,
    getPast4HourBlocks,
} = require('../src/lib/market');
const db = require('../src/database');

test('Market Engine: Multipliers remain within bounds [0.70, 1.50]', () => {
    const items = Object.keys(BASE_MARKET_ITEMS);
    for (const item of items) {
        for (let i = 0; i < 24; i++) {
            const timeBlock = `2026-218-${i}`;
            const mult = computeMarketMultiplier(item, timeBlock);
            assert.ok(mult >= 0.70, `Multiplier ${mult} for ${item} < 0.70`);
            assert.ok(mult <= 1.50, `Multiplier ${mult} for ${item} > 1.50`);
        }
    }
});

test('Market Engine: Deterministic hash outputs identical value for same block', () => {
    const mult1 = computeMarketMultiplier('trai_1500', '2026-100-2');
    const mult2 = computeMarketMultiplier('trai_1500', '2026-100-2');
    assert.strictEqual(mult1, mult2);
});

test('Market Engine: MurmurMix32 avalanche mixer behaves deterministically and unsigned 32-bit', () => {
    assert.strictEqual(murmurMix32(0), 0);
    const m1 = murmurMix32(1234567);
    const m2 = murmurMix32(1234567);
    assert.strictEqual(m1, m2);
    assert.ok(m1 >= 0 && m1 <= 4294967295);
});

test('Market Engine: Eliminates linear ramp within same day (Roadmap §2.2)', () => {
    // Đo đạc tỉ lệ chuyển khối liền nhau thay đổi +-1%:
    // Bản cũ (0098) dốc tuyến tính khiến +-1% chiếm 82.3%.
    // Bản mới với MurmurMix32 phải giảm xuống dưới 5% (phân phối đều ~2.47%).
    const items = Object.keys(BASE_MARKET_ITEMS);
    let stepPm1 = 0;
    let totalSteps = 0;

    for (const id of items) {
        for (let d = 1; d <= 10; d++) {
            for (let b = 0; b < 6; b++) {
                const nextD = b === 5 ? d + 1 : d;
                const nextB = (b + 1) % 6;
                const m1 = Math.round(computeMarketMultiplier(id, `2026-${d}-${b}`) * 100);
                const m2 = Math.round(computeMarketMultiplier(id, `2026-${nextD}-${nextB}`) * 100);
                if (Math.abs(m2 - m1) === 1) stepPm1++;
                totalSteps++;
            }
        }
    }

    const pct = (stepPm1 / totalSteps) * 100;
    assert.ok(pct < 5.0, `Tỉ lệ chuyển khối +-1% (${pct.toFixed(2)}%) vẫn còn quá cao, chưa khử được dốc tuyến tính`);
});

test('Market Engine: getMarketHistory returns chronological 0-DB derived data', () => {
    const history = getMarketHistory('ca_koi_nhat', 6);
    assert.strictEqual(history.length, 6);

    for (let i = 0; i < history.length; i++) {
        const point = history[i];
        assert.ok(point.blockKey);
        assert.ok(point.multiplier >= 0.70 && point.multiplier <= 1.50);
        assert.ok(Number.isInteger(point.price) && point.price > 0);
        if (i > 0) {
            assert.ok(point.timestamp > history[i - 1].timestamp, 'Lịch sử phải được sắp xếp theo thời gian tăng dần');
        }
    }
});

test('Market Engine: generateSparkline outputs valid Unicode sparkline graphs', () => {
    assert.strictEqual(generateSparkline([]), '');
    assert.strictEqual(generateSparkline([100, 100, 100]), '▄▄▄');

    const lineAsc = generateSparkline([10, 20, 30, 40, 50]);
    assert.strictEqual(lineAsc.length, 5);
    assert.strictEqual(lineAsc[0], ' ');
    assert.strictEqual(lineAsc[4], '█');
});

test('Market Engine: getLiveMarketPrices returns valid structure with sparkline and 24h range', async () => {
    const prices = await getLiveMarketPrices();
    assert.strictEqual(prices.length, Object.keys(BASE_MARKET_ITEMS).length);

    for (const p of prices) {
        assert.ok(p.itemId);
        assert.ok(p.currentPrice > 0);
        assert.ok(p.multiplier >= 0.70 && p.multiplier <= 1.50);
        assert.ok(['UP', 'DOWN', 'STABLE'].includes(p.trend));
        assert.ok(p.sparkline && p.sparkline.length === 6);
        assert.ok(p.low24h <= p.high24h);
        assert.ok(Array.isArray(p.history) && p.history.length === 6);
    }
});

test('Market DB: sellItemMarket helper gracefully handles invalid inputs without crashing', async () => {
    const res = await db.sellItemMarket('non_existent_user_999999', 'trai_1500', 0);
    assert.ok(res);
});

