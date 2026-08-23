// ============================================================
// test/logger_gop.test.js — Gác logic GỘP TRÙNG của kênh log lỗi.
//
// VÌ SAO CÓ: chiến thuật đã chốt ngày 21-08 là KHÔNG quét trước toàn bộ 206 đơn vị nữa,
// mà để người dùng chạm vào rồi vá theo lỗi báo về. Chiến thuật đó chỉ đứng được nếu
// kênh log vừa KHÔNG bỏ sót lỗi thật, vừa KHÔNG bị một lệnh hỏng nhấn chìm.
//
// Trước đây `logError` chỉ có throttle theo TỔNG (15 log/phút). Một lệnh hỏng mà 50 người
// gõ sẽ ngốn sạch hạn mức đó và che mất mọi lỗi khác — đúng lúc cần nhìn thấy chúng nhất.
//
// Hai kiểu hỏng đối nghịch nhau, test này gác cả hai:
//   · gộp QUÁ TAY  -> lỗi thật của lệnh khác bị nuốt, không ai biết
//   · gộp HỤT      -> kênh log ngập, mất tác dụng
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { _gop } = require('../src/lib/logger');
const { khoaCua, chotGop, GOP_MS, SKIP_GOP_MS, xoaHet } = _gop;

const T0 = 1_700_000_000_000; // mốc thời gian cố định — không dùng Date.now() để test ổn định

test('gộp: lần đầu LUÔN được gửi, và chưa dồn lần nào', () => {
    xoaHet();
    assert.strictEqual(chotGop('a', T0), 0, 'lỗi mới phải báo ngay, không chờ');
});

test('gộp: lần lặp trong cửa sổ bị im, nhưng ĐƯỢC ĐẾM chứ không mất', () => {
    xoaHet();
    chotGop('a', T0);
    for (let i = 1; i <= 49; i++) {
        assert.strictEqual(chotGop('a', T0 + i * 1000), null, `lần ${i} phải im`);
    }
    // Hết cửa sổ: phải báo lại, kèm đúng số lần đã dồn.
    assert.strictEqual(chotGop('a', T0 + GOP_MS + 1), 49,
        'số lần dồn phải khớp — sai số ở đây làm mình đánh giá nhầm mức nghiêm trọng');
});

test('gộp: khoá khác nhau KHÔNG che nhau (chống gộp quá tay)', () => {
    xoaHet();
    assert.strictEqual(chotGop('a', T0), 0);
    assert.strictEqual(chotGop('b', T0), 0, 'lỗi của lệnh khác phải qua được, dù lệnh kia đang lặp');
    assert.strictEqual(chotGop('a', T0 + 1000), null);
    assert.strictEqual(chotGop('b', T0 + 1000), null);
});

test('gộp: sau khi báo lại thì bộ đếm về 0', () => {
    xoaHet();
    chotGop('a', T0);
    chotGop('a', T0 + 1000);
    assert.strictEqual(chotGop('a', T0 + GOP_MS + 1), 1);
    // Chu kỳ mới, chưa lặp lần nào -> phải là 0, không cộng dồn từ chu kỳ trước.
    assert.strictEqual(chotGop('a', T0 + GOP_MS * 2 + 2), 0);
});

test('khoá: cùng lệnh + cùng câu lỗi -> MỘT khoá', () => {
    const e1 = new Error('interaction.fetchReply is not a function');
    const e2 = new Error('interaction.fetchReply is not a function');
    assert.strictEqual(khoaCua('Lỗi lệnh prefix', e1), khoaCua('Lỗi lệnh prefix', e2));
});

test('khoá: câu lỗi khác nhau -> khoá khác nhau', () => {
    const e1 = new Error('interaction.fetchReply is not a function');
    const e2 = new Error('interaction.inGuild is not a function');
    assert.notStrictEqual(khoaCua('Lỗi lệnh prefix', e1), khoaCua('Lỗi lệnh prefix', e2),
        'hai bug khác nhau mà chung khoá thì cái thứ hai không bao giờ hiện ra');
});

test('khoá: chỉ lấy DÒNG ĐẦU của stack — cùng lỗi ở stack khác nhau vẫn gộp', () => {
    const e = new Error('boom');
    e.stack = 'Error: boom\n    at A (/x.js:1:1)';
    const e2 = new Error('boom');
    e2.stack = 'Error: boom\n    at B (/y.js:9:9)';
    assert.strictEqual(khoaCua('t', e), khoaCua('t', e2));
});

test('gộp: Map có trần, không phình vô hạn khi bot chạy dài ngày', () => {
    xoaHet();
    for (let i = 0; i < 400; i++) chotGop('k' + i, T0);
    // Dọn theo cửa sổ DÀI NHẤT (SKIP_GOP_MS), không phải GOP_MS.
    const gia = Math.max(GOP_MS, SKIP_GOP_MS) * 2;
    chotGop('moi', T0 + gia + 1);
    assert.ok(_gop.chotGop('moi2', T0 + gia + 2) === 0, 'vẫn hoạt động sau khi dọn');
});

// ------------------------------------------------------------------
// SKIP dùng CHUNG bộ gộp nhưng cửa sổ dài hơn. Vì sao quan trọng: một "bỏ qua" phản ánh
// TRẠNG THÁI cấu hình đứng yên hàng giờ. Server có người ra/vào liên tục từng đẩy ra hàng
// trăm dòng y hệt nhau trong ít phút và nhấn chìm mọi log khác.
// ------------------------------------------------------------------
test('SKIP: cửa sổ gộp phải DÀI HƠN cửa sổ lỗi', () => {
    assert.ok(SKIP_GOP_MS > GOP_MS, 'gộp SKIP bằng cửa sổ lỗi thì vẫn còn ngập log');
});

test('SKIP: trong cửa sổ dài chỉ ra MỘT dòng, dù lặp bao nhiêu lần', () => {
    xoaHet();
    assert.strictEqual(chotGop('s', T0, SKIP_GOP_MS), 0, 'lần đầu vẫn phải thấy');
    // Ngay cả khi đã quá cửa sổ LỖI (10 phút) thì SKIP vẫn phải im.
    assert.strictEqual(chotGop('s', T0 + GOP_MS + 1, SKIP_GOP_MS), null,
        'SKIP không được dùng cửa sổ ngắn của logError');
    for (let i = 1; i <= 200; i++) chotGop('s', T0 + i * 1000, SKIP_GOP_MS);
    assert.strictEqual(chotGop('s', T0 + SKIP_GOP_MS + 1, SKIP_GOP_MS), 201,
        'hết cửa sổ phải báo lại kèm ĐỦ số lần đã dồn — mất số đếm là mất tín hiệu tình huống đang lặp');
});

test('SKIP: guild khác nhau KHÔNG che nhau', () => {
    xoaHet();
    assert.strictEqual(chotGop('[SKIP:x]|lý do|guildId=1', T0, SKIP_GOP_MS), 0);
    assert.strictEqual(chotGop('[SKIP:x]|lý do|guildId=2', T0, SKIP_GOP_MS), 0,
        'server thứ hai gặp cùng vấn đề vẫn phải hiện ra, không bị server đầu nuốt mất');
});
