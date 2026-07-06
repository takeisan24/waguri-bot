// test/i18n.test.js
// Test đơn vị (Unit test) cho module i18n
const test = require('node:test');
const assert = require('node:assert');
const { t, getLanguage } = require('../src/lib/i18n');

test('i18n: Nhận diện ngôn ngữ chuẩn xác', () => {
    assert.strictEqual(getLanguage('en-US'), 'en');
    assert.strictEqual(getLanguage('en'), 'en');
    assert.strictEqual(getLanguage('vi-VN'), 'vi');
    assert.strictEqual(getLanguage('vi'), 'vi');
    assert.strictEqual(getLanguage('ja'), 'vi', 'Mặc định ngôn ngữ không hỗ trợ sẽ là tiếng Việt (vi)');
    assert.strictEqual(getLanguage(null), 'vi', 'Mặc định null sẽ là tiếng Việt (vi)');
});

test('i18n: Dịch khoá đơn giản', () => {
    // Tiếng Việt
    assert.strictEqual(t('vi', 'common.currency'), 'VNĐ');
    assert.strictEqual(t('vi', 'common.item_not_found'), 'Mình không tìm thấy vật phẩm này~');
    
    // Tiếng Anh
    assert.strictEqual(t('en', 'common.currency'), 'VND');
    assert.strictEqual(t('en', 'common.item_not_found'), 'I couldn\'t find this item~');
});

test('i18n: Dịch có tham số động (Interpolation)', () => {
    // Tiếng Việt
    const resVi = t('vi', 'common.insufficient_funds', { cost: 5000, currency: 'VNĐ' });
    assert.strictEqual(resVi, 'Ví cậu không đủ **5000** VNĐ rồi~ 😟');

    // Tiếng Anh
    const resEn = t('en', 'common.insufficient_funds', { cost: 5000, currency: 'VND' });
    assert.strictEqual(resEn, 'Your wallet doesn\'t have enough **5000** VND~ 😟');
});

test('i18n: Dịch lồng sâu (Nested JSON keys)', () => {
    assert.strictEqual(t('vi', 'common.btn.confirm'), 'Xác nhận');
    assert.strictEqual(t('en', 'common.btn.confirm'), 'Confirm');
});

test('i18n: Fallback an toàn', () => {
    // Khoá không tồn tại ➔ trả về chính khoá đó
    assert.strictEqual(t('vi', 'common.not_exist_key'), 'common.not_exist_key');
    
    // Dịch tiếng Anh nhưng thiếu khoá (nếu giả định thiếu) ➔ fallback về tiếng Việt của khoá đó
    // Ở đây ta có thể giả định một khoá chỉ có ở vi.json nhưng en.json không định nghĩa
    // Do vi.json và en.json hiện tại đồng bộ hoàn toàn, ta chỉ test rằng không bị crash
    assert.strictEqual(t('en', 'common.not_exist_key'), 'common.not_exist_key');
});
