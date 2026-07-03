// Test thuần cho data/quests — bộ nhiệm vụ hằng ngày random-tất-định. Chạy: npm test
const test = require('node:test');
const assert = require('node:assert');
const { PINNED, POOL, DAILY_POOL_COUNT, pickDailyQuests } = require('../src/data/quests');

test('luôn kèm PINNED (điểm danh + vote) và đúng số lượng', () => {
    const qs = pickDailyQuests('123', '2026-07-03');
    assert.strictEqual(qs.length, PINNED.length + DAILY_POOL_COUNT);
    for (const p of PINNED) assert.ok(qs.find(q => q.id === p.id), `thiếu PINNED ${p.id}`);
    // Có quest vote + daily như yêu cầu (checklist mặc định).
    assert.ok(qs.find(q => q.key === 'vote'), 'phải có nhiệm vụ vote');
    assert.ok(qs.find(q => q.key === 'daily'), 'phải có nhiệm vụ điểm danh');
});

test('tất định: cùng user + cùng ngày -> cùng bộ (gọi /quest nhiều lần vẫn ổn định)', () => {
    const a = pickDailyQuests('user-A', '2026-07-03').map(q => q.id);
    const b = pickDailyQuests('user-A', '2026-07-03').map(q => q.id);
    assert.deepStrictEqual(a, b);
});

test('phần random nằm trong POOL và không trùng key', () => {
    const qs = pickDailyQuests('user-B', '2026-07-03');
    const extras = qs.filter(q => !PINNED.find(p => p.id === q.id));
    const keys = new Set();
    for (const q of extras) {
        assert.ok(POOL.find(p => p.id === q.id), `quest lạ không thuộc POOL: ${q.id}`);
        assert.ok(!keys.has(q.key), `trùng key trong ngày: ${q.key}`);
        keys.add(q.key);
    }
});

test('đa dạng: đổi ngày (hoặc đổi người) làm bộ random thay đổi ít nhất một lần', () => {
    const base = pickDailyQuests('user-C', '2026-07-03').map(q => q.id).join(',');
    const otherDays = ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08']
        .map(d => pickDailyQuests('user-C', d).map(q => q.id).join(','));
    assert.ok(otherDays.some(x => x !== base), 'bộ nhiệm vụ nên khác nhau giữa các ngày');
});

test('mọi quest có đủ trường hợp lệ (id/key/required>0/reward>0)', () => {
    for (const q of [...PINNED, ...POOL]) {
        assert.ok(q.id && q.name && q.key, `quest thiếu trường: ${JSON.stringify(q)}`);
        assert.ok(q.required > 0 && q.reward > 0, `required/reward không hợp lệ: ${q.id}`);
    }
});
