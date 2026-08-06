const test = require('node:test');
const assert = require('node:assert');
const { computeMarketMultiplier, BASE_MARKET_ITEMS, getLiveMarketPrices } = require('../src/lib/market');
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

test('Market Engine: getLiveMarketPrices returns valid structure for all base items', async () => {
    const prices = await getLiveMarketPrices();
    assert.strictEqual(prices.length, Object.keys(BASE_MARKET_ITEMS).length);

    for (const p of prices) {
        assert.ok(p.itemId);
        assert.ok(p.currentPrice > 0);
        assert.ok(p.multiplier >= 0.70 && p.multiplier <= 1.50);
        assert.ok(['UP', 'DOWN', 'STABLE'].includes(p.trend));
    }
});

test('Market DB: sellItemMarket helper gracefully handles invalid inputs without crashing', async () => {
    const res = await db.sellItemMarket('non_existent_user_999999', 'trai_1500', 0);
    assert.ok(res);
});
