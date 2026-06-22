const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { verifyPayos, objToQueryStr } = require('../src/lib/payosVerify');

const KEY = 'test_checksum_key_123';

// Chuỗi canonical tính TAY (độc lập với code) cho 1 payload phẳng: sort key alphabet, join k=v&.
const data = {
    orderCode: 7,
    amount: 25000,
    description: 'WAGURIABCD1234',
    reference: 'FT24123',
    code: '00',
};
const canonical = 'amount=25000&code=00&description=WAGURIABCD1234&orderCode=7&reference=FT24123';
const goodSig = crypto.createHmac('sha256', KEY).update(canonical).digest('hex');

test('objToQueryStr dựng đúng chuỗi canonical (sort key)', () => {
    // sortObjByKey + objToQueryStr phải khớp chuỗi tính tay dù thứ tự field đảo lộn
    assert.strictEqual(objToQueryStr(require('../src/lib/payosVerify').sortObjByKey(data)), canonical);
});

test('verifyPayos chấp nhận chữ ký hợp lệ', () => {
    assert.strictEqual(verifyPayos(data, goodSig, KEY), true);
});

test('verifyPayos vẫn đúng khi field đảo thứ tự (vì có sort)', () => {
    const reordered = { code: '00', amount: 25000, reference: 'FT24123', description: 'WAGURIABCD1234', orderCode: 7 };
    assert.strictEqual(verifyPayos(reordered, goodSig, KEY), true);
});

test('verifyPayos từ chối chữ ký sai / sai key / thiếu dữ liệu', () => {
    assert.strictEqual(verifyPayos(data, goodSig.replace(/.$/, '0'), KEY), false); // sửa 1 ký tự
    assert.strictEqual(verifyPayos(data, goodSig, 'wrong_key'), false);
    assert.strictEqual(verifyPayos(data, '', KEY), false);
    assert.strictEqual(verifyPayos(null, goodSig, KEY), false);
    assert.strictEqual(verifyPayos({ ...data, amount: 9999 }, goodSig, KEY), false); // data bị đổi
});
