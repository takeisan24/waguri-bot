// ============================================================
// test/canh_ack.test.js — Gác bộ đo ACK lúc chạy.
//
// VÌ SAO ĐO LÚC CHẠY: quét tĩnh luồng ack của 81 lệnh (21-08-2026) cho 15 báo mà quá nửa
// là SAI — ack hay nằm trong hàm được gọi lồng nhau (`action.js` uỷ thác cho `runCouple`),
// còn `return` trong callback `.map()` thì trông y hệt một nhánh thoát sớm. Xem chú thích
// đầy đủ ở `src/lib/canhAck.js`.
//
// Bộ đo này quan sát interaction thật nên KHÔNG có dương tính giả. Nhưng chính vì vậy nó
// phải im lặng tuyệt đối ở đường bình thường: mỗi báo nhầm là một lần người ta bớt tin
// kênh log, và kênh log là thứ duy nhất cho biết lệnh nào đang chết câm trên prod.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { mock } = require('node:test');

// Chặn logger TRƯỚC khi nạp canhAck, để quan sát được nó có báo hay không.
const duongLogger = require.resolve('../src/lib/logger');
const loggerGoc = require(duongLogger);
const daBao = [];
require.cache[duongLogger].exports = {
    ...loggerGoc,
    logError: (tieuDe, err, meta) => daBao.push({ tieuDe, loi: String(err && err.message || err), meta }),
};

const { theoDoiAck, kiemAutocomplete, NGUONG_ACK_MS } = require('../src/lib/canhAck');

const gia = (o = {}) => ({ replied: false, deferred: false, user: { id: 'u1' }, guildId: 'g1', ...o });
const reset = () => { daBao.length = 0; };

test('ack: lệnh trả lời tử tế -> IM LẶNG tuyệt đối', () => {
    reset();
    const it = gia({ replied: true });
    theoDoiAck(it, '/daily').xong(false);
    assert.deepStrictEqual(daBao, [], 'báo nhầm ở đường bình thường là cách nhanh nhất làm kênh log mất giá trị');
});

test('ack: lệnh deferReply() rồi cũng im lặng', () => {
    reset();
    theoDoiAck(gia({ deferred: true }), '/work').xong(false);
    assert.deepStrictEqual(daBao, []);
});

test('ack: chạy xong mà KHÔNG ack -> báo, kèm tên lệnh', () => {
    reset();
    theoDoiAck(gia(), '/vidu').xong(false);
    assert.strictEqual(daBao.length, 1);
    assert.match(daBao[0].tieuDe, /Chạy xong mà KHÔNG ack: \/vidu/);
    assert.strictEqual(daBao[0].meta.command, '/vidu');
    assert.strictEqual(daBao[0].meta.guild, 'g1');
});

test('ack: lệnh NÉM LỖI thì KHÔNG báo trùng (lỗi đã log riêng)', () => {
    reset();
    theoDoiAck(gia(), '/vidu').xong(true);
    assert.deepStrictEqual(daBao, [],
        'lỗi execute() đã được logError ghi ở interactionCreate — báo thêm ở đây là hai tin cho một sự việc');
});

test('ack: quá hạn mà chưa ack -> báo NGAY tại mốc, không đợi execute xong', () => {
    reset();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const it = gia();
        theoDoiAck(it, '/cham');           // chưa gọi xong() — mô phỏng lệnh còn đang chạy
        mock.timers.tick(NGUONG_ACK_MS + 1);
        assert.strictEqual(daBao.length, 1, 'phải báo tại mốc: người dùng đã thấy "did not respond" rồi');
        assert.match(daBao[0].tieuDe, /Chưa ack sau \d+ms: \/cham/);
    } finally { mock.timers.reset(); }
});

test('ack: ack kịp trước mốc -> hẹn giờ không được báo', () => {
    reset();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        const it = gia();
        theoDoiAck(it, '/kip');
        it.deferred = true;                // lệnh ack trong lúc chờ
        mock.timers.tick(NGUONG_ACK_MS + 1);
        assert.deepStrictEqual(daBao, []);
    } finally { mock.timers.reset(); }
});

test('ack: xong() huỷ hẹn giờ -> KHÔNG báo hai lần cho cùng một sự việc', () => {
    reset();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
        // Interaction CHƯA ack: xong() báo một lần, và sau đó KHÔNG được báo thêm lần nào.
        //
        // ĐÃ ĐO, không phải suy đoán — `canhAck` có HAI lớp chặn báo trùng
        // (`clearTimeout(hen)` và cờ `ketThuc`), mỗi lớp tự nó đã đủ:
        //     nguyên vẹn        -> 0 đỏ
        //     gỡ clearTimeout   -> 0 đỏ   (cờ đỡ)
        //     gỡ cờ ketThuc     -> 0 đỏ   (clearTimeout đỡ)
        //     gỡ CẢ HAI         -> 1 đỏ   ← chỗ test này thật sự gác
        // Nên đừng đọc test này là "gate cho clearTimeout". Nó gác HÀNH VI: sau khi lệnh
        // kết thúc, đúng một tin được báo và không có tin thứ hai — bất kể lớp nào giữ.
        const it = gia();
        theoDoiAck(it, '/nhanh').xong(false);
        assert.strictEqual(daBao.length, 1, 'xong() phải báo đúng một lần');
        mock.timers.tick(NGUONG_ACK_MS * 3);
        assert.strictEqual(daBao.length, 1,
            'mất cờ ketThuc -> hẹn giờ nổ sau khi lệnh đã kết thúc và báo tin thứ hai cho cùng một sự việc');
    } finally { mock.timers.reset(); }
});

test('ack: TÊN LỆNH nằm trong tiêu đề, để logger gộp trùng theo từng lệnh', () => {
    reset();
    theoDoiAck(gia(), '/a').xong(false);
    theoDoiAck(gia(), '/b').xong(false);
    assert.notStrictEqual(daBao[0].tieuDe, daBao[1].tieuDe,
        'logger gộp theo (tiêu đề + dòng đầu của lỗi). Chung tiêu đề thì mọi lệnh dồn vào MỘT khoá ' +
        'và chỉ lệnh đầu tiên được báo — 80 lệnh còn lại chết câm trong im lặng.');
});

test('autocomplete: đã respond -> im lặng; chưa respond -> báo', () => {
    reset();
    kiemAutocomplete({ responded: true, user: { id: 'u1' }, guildId: 'g1' }, '/store');
    assert.deepStrictEqual(daBao, []);

    kiemAutocomplete({ responded: false, user: { id: 'u1' }, guildId: 'g1' }, '/store');
    assert.strictEqual(daBao.length, 1);
    assert.match(daBao[0].tieuDe, /Autocomplete không respond\(\): \/store/);
});
