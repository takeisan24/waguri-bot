const { test } = require('node:test');
const assert = require('node:assert');
const { extractPremiumCode } = require('../src/lib/paymatch');

test('trích đúng mã từ nội dung CK chuẩn', () => {
    assert.strictEqual(extractPremiumCode('WAGURIABCD1234'), 'WAGURIABCD1234');
});

test('trích được khi có tiền tố/hậu tố ngân hàng thêm vào', () => {
    assert.strictEqual(extractPremiumCode('CT DEN:123 WAGURIABCD1234 GD 456'), 'WAGURIABCD1234');
    assert.strictEqual(extractPremiumCode('chuyen tien waguriabcd1234 cam on'), 'WAGURIABCD1234');
});

test('không có mã -> null', () => {
    assert.strictEqual(extractPremiumCode('chuyen tien mua hang'), null);
    assert.strictEqual(extractPremiumCode(''), null);
    assert.strictEqual(extractPremiumCode(null), null);
    assert.strictEqual(extractPremiumCode(undefined), null);
});

test('mã sai định dạng (không đủ 8 hex / có ký tự ngoài hex) -> null', () => {
    assert.strictEqual(extractPremiumCode('WAGURIXYZ'), null);       // không phải hex
    assert.strictEqual(extractPremiumCode('WAGURI12'), null);        // thiếu ký tự
    assert.strictEqual(extractPremiumCode('WAGURIGHIJKLMN'), null);  // G-N không phải hex
});
