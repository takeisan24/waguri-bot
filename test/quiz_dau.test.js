// ============================================================
// test/quiz_dau.test.js — Chặn đáp án đố vui MẤT DẤU quay lại.
//
// VÌ SAO CÓ: `src/data/quiz.js` lưu đáp án ở dạng đã bỏ dấu vì chúng dùng để SO KHỚP,
// rồi `dovui.js` dùng lại chính `item.a[0]` làm chuỗi HIỂN THỊ. Kết quả: hết giờ,
// Waguri nói "Đáp án đúng là **trai dat**". 23 trên 25 câu tiếng Việt đều vậy.
// Một nhân vật Nhật bước ra từ truyện mà nói tiếng Việt mất dấu thì hỏng vai.
//
// Webhook báo lỗi (thêm ngày 21-08) KHÔNG bao giờ bắt được loại này: mã chạy đúng,
// không ném gì cả, chỉ dữ liệu sai. Lỗi nội dung chỉ có gate riêng hoặc mắt người.
//
// Gate này gác HAI chiều, vì sửa một chiều rất dễ làm hỏng chiều kia:
//   · a[0] phải đẹp để HIỂN THỊ
//   · nhưng người gõ KHÔNG DẤU vẫn phải thắng như trước
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const QUIZ = require('../src/data/quiz');
const { _norm: norm } = require('../src/commands/fun/dovui.js');

const CO_DAU = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;

// Đáp án KHÔNG có dấu một cách chính đáng. Thêm vào đây phải kèm lý do thật.
// Số thuần được miễn tự động, không cần liệt kê.
const KHONG_DAU_CO_LY_DO = {
    Fansipan:  'tên riêng phiên âm quốc tế — bản thân nó không mang dấu',
    Oxy:       'tên nguyên tố theo phiên âm quốc tế',
    Argentina: 'tên riêng nước ngoài',
    Seoul:     'tên riêng nước ngoài',
    Voi:       'từ tiếng Việt vốn không mang dấu nào',
};

test('quiz: mọi a[0] đều có dấu, hoặc được miễn trừ có lý do', () => {
    const xau = [];
    for (const { q, a } of QUIZ) {
        const hien = a[0];
        if (/^\d+$/.test(hien)) continue;                 // số thuần
        if (CO_DAU.test(hien)) continue;
        if (KHONG_DAU_CO_LY_DO[hien]) continue;
        xau.push(`"${hien}"  (câu: ${q})`);
    }
    assert.deepStrictEqual(xau, [],
        'Đáp án hiển thị mất dấu. Viết lại a[0] có dấu đầy đủ, hoặc thêm vào ' +
        'KHONG_DAU_CO_LY_DO kèm lý do thật. So khớp KHÔNG bị ảnh hưởng vì dovui.js ' +
        'chạy item.a.map(norm) trước khi so.');
});

test('quiz: người gõ KHÔNG DẤU vẫn thắng như trước (không đánh đổi)', () => {
    for (const { q, a } of QUIZ) {
        const accepted = a.map(norm);
        const goKhongDau = norm(a[0]);                    // đúng thứ người dùng gõ vội
        assert.ok(accepted.includes(goKhongDau),
            `Câu "${q}": gõ "${goKhongDau}" không còn được chấp nhận — làm đẹp phần hiển ` +
            'thị mà làm hỏng phần so khớp là đánh đổi sai.');
    }
});

test('quiz: mọi biến thể phụ đều chuẩn hoá về chuỗi không rỗng', () => {
    for (const { q, a } of QUIZ) {
        assert.ok(a.length >= 1, `Câu "${q}" không có đáp án nào.`);
        for (const v of a) {
            assert.ok(norm(v).length > 0, `Câu "${q}": biến thể ${JSON.stringify(v)} chuẩn hoá ra rỗng.`);
        }
    }
});

test('dovui: vẫn chuẩn hoá CẢ HAI vế trước khi so', () => {
    // Nếu ai đó bỏ .map(norm), dữ liệu có dấu sẽ không khớp được nữa với người gõ
    // không dấu — và test trên vẫn xanh vì nó tự chuẩn hoá. Nên phải soi thẳng mã.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'fun', 'dovui.js'), 'utf8');
    assert.match(src, /item\.a\.map\(norm\)/,
        'dovui.js không còn chuẩn hoá bộ đáp án — dữ liệu có dấu sẽ không khớp người gõ không dấu.');
    assert.match(src, /accepted\.includes\(norm\(m\.content\)\)/,
        'dovui.js không còn chuẩn hoá tin nhắn của người chơi trước khi so.');
});

test('quiz_en: KHÔNG áp luật dấu (tiếng Anh vốn không có)', () => {
    const EN = require('../src/data/quiz_en');
    assert.ok(EN.length > 0, 'quiz_en trống — kiểm tra lại đường dẫn.');
    for (const { a } of EN) assert.ok(a[0] && a[0].length > 0);
});
