const test = require('node:test');
const assert = require('node:assert');
const { assignRoles, checkWin, resolveNight, tallyVotes, wolfCount, ROLES } = require('../src/lib/masoi/engine');

test('wolfCount theo số người', () => {
    assert.strictEqual(wolfCount(4), 1);
    assert.strictEqual(wolfCount(8), 2);
    assert.strictEqual(wolfCount(12), 3);
});

test('assignRoles: đủ vai & số sói đúng', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `u${i}`);
    const roles = assignRoles(ids);
    assert.strictEqual(Object.keys(roles).length, 8);
    const counts = {};
    for (const r of Object.values(roles)) counts[r] = (counts[r] || 0) + 1;
    assert.strictEqual(counts.werewolf, 2);
    assert.strictEqual(counts.seer, 1);
    assert.strictEqual(counts.guard, 1);
    assert.strictEqual(counts.witch, 1);
    assert.strictEqual(counts.hunter, 1);
    // mọi vai hợp lệ
    for (const r of Object.values(roles)) assert.ok(ROLES[r]);
});

test('checkWin: dân thắng khi hết sói', () => {
    const players = { a: { role: 'villager', alive: true }, b: { role: 'seer', alive: true }, c: { role: 'werewolf', alive: false } };
    assert.strictEqual(checkWin(players), 'village');
});

test('checkWin: sói thắng khi số sói >= còn lại', () => {
    const players = { a: { role: 'werewolf', alive: true }, b: { role: 'villager', alive: true } };
    assert.strictEqual(checkWin(players), 'wolves');
});

test('checkWin: chưa kết thúc', () => {
    const players = { a: { role: 'werewolf', alive: true }, b: { role: 'villager', alive: true }, c: { role: 'seer', alive: true } };
    assert.strictEqual(checkWin(players), null);
});

test('resolveNight: sói cắn, không ai cứu -> chết', () => {
    const r = resolveNight({ wolfVotes: { w1: 'v1' } });
    assert.strictEqual(r.victim, 'v1');
    assert.deepStrictEqual(r.deaths, ['v1']);
});

test('resolveNight: bảo vệ che đúng nạn nhân -> sống', () => {
    const r = resolveNight({ wolfVotes: { w1: 'v1' }, guard: 'v1' });
    assert.deepStrictEqual(r.deaths, []);
});

test('resolveNight: phù thủy cứu nạn nhân + đầu độc người khác', () => {
    const r = resolveNight({ wolfVotes: { w1: 'v1' }, witchHeal: true, witchPoison: 'v2' });
    assert.ok(!r.deaths.includes('v1'));
    assert.ok(r.deaths.includes('v2'));
});

test('resolveNight: sói bất đồng -> đa số bị cắn', () => {
    const r = resolveNight({ wolfVotes: { w1: 'v1', w2: 'v1', w3: 'v2' } });
    assert.strictEqual(r.victim, 'v1');
});

test('tallyVotes: đa số bị treo', () => {
    assert.strictEqual(tallyVotes({ a: 'x', b: 'x', c: 'y' }), 'x');
});

test('tallyVotes: hòa -> không treo ai', () => {
    assert.strictEqual(tallyVotes({ a: 'x', b: 'y' }), null);
});
