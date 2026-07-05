const { test } = require('node:test');
const assert = require('node:assert');
const { parseMemoryMarkers, sanitizeMemoryKey } = require('../src/lib/ai');

test('sanitizeMemoryKey: bỏ dấu tiếng Việt + chuẩn hoá snake_case', () => {
    assert.strictEqual(sanitizeMemoryKey('Món ăn yêu thích'), 'mon_an_yeu_thich');
    assert.strictEqual(sanitizeMemoryKey('Tên Pet!!'), 'ten_pet');
    assert.strictEqual(sanitizeMemoryKey('đồ ăn'), 'do_an');
    assert.strictEqual(sanitizeMemoryKey('  Tâm Trạng  '), 'tam_trang');
});

test('sanitizeMemoryKey: rác/rỗng -> chuỗi rỗng', () => {
    assert.strictEqual(sanitizeMemoryKey('!!!'), '');
    assert.strictEqual(sanitizeMemoryKey(''), '');
    assert.strictEqual(sanitizeMemoryKey('___'), '');
});

test('sanitizeMemoryKey: cắt tối đa 40 ký tự', () => {
    assert.ok(sanitizeMemoryKey('a'.repeat(100)).length <= 40);
});

test('parseMemoryMarkers: 1 marker -> tách fact + xoá khỏi câu trả lời', () => {
    const raw = 'Chào cậu nhé~ [[NHO: ten | Minh]]';
    const { facts, cleaned } = parseMemoryMarkers(raw);
    assert.deepStrictEqual(facts, [{ key: 'ten', value: 'Minh' }]);
    assert.strictEqual(cleaned, 'Chào cậu nhé~');
    assert.ok(!cleaned.includes('[['));
});

test('parseMemoryMarkers: khoá tiếng Việt có dấu được chuẩn hoá', () => {
    const { facts } = parseMemoryMarkers('Ngon lắm! [[NHO: Món ăn yêu thích | phở bò]]');
    assert.deepStrictEqual(facts, [{ key: 'mon_an_yeu_thich', value: 'phở bò' }]);
});

test('parseMemoryMarkers: không marker -> facts rỗng, cleaned == reply đã trim', () => {
    const { facts, cleaned } = parseMemoryMarkers('  Chỉ là câu chào bình thường  ');
    assert.deepStrictEqual(facts, []);
    assert.strictEqual(cleaned, 'Chỉ là câu chào bình thường');
});

test('parseMemoryMarkers: nhiều marker -> lấy hết fact hợp lệ', () => {
    const raw = 'Hí~ [[NHO: ten | An]] [[NHO: tam_trang | vui]]';
    const { facts, cleaned } = parseMemoryMarkers(raw);
    assert.strictEqual(facts.length, 2);
    assert.ok(!cleaned.includes('NHO'));
});

test('parseMemoryMarkers: marker thiếu value bị bỏ qua', () => {
    const { facts } = parseMemoryMarkers('[[NHO: ten | ]]');
    assert.deepStrictEqual(facts, []);
});

test('parseMemoryMarkers: gộp nhiều dòng trống sau khi xoá marker', () => {
    const raw = 'Dòng 1\n\n[[NHO: ten | Bo]]\n\n\nDòng 2';
    const { cleaned } = parseMemoryMarkers(raw);
    assert.ok(!/\n{3,}/.test(cleaned), 'không còn 3+ dòng trống liên tiếp');
    assert.ok(!cleaned.includes('[['));
});
