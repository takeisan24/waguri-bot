// ============================================================
// test/db_log_mang.test.js — Gác việc TÁCH LỖI MẠNG khỏi LỖI DB trong database.js.
//
// VÌ SAO CÓ: `[DATABASE ERROR] resolveExpiredAuctions(): TypeError: fetch failed ...
// EAI_AGAIN` từng làm mình đi soi hệ thống đấu giá suốt, trong khi đấu giá không hỏng
// gì — chỉ là DNS rớt vài giây, và vòng lặp đấu giá chạy mỗi 60s nên nó là cái kêu to
// nhất. Nay lỗi mạng được hạ xuống một dòng [NET] gọn.
//
// Hạ tiếng ồn thì dễ hỏng theo HAI HƯỚNG ĐỐI NGHỊCH, test này gác cả hai:
//   · bắt QUÁ TAY -> lỗi DB thật bị dán nhãn "mạng chập chờn" rồi nuốt mất, hỏng âm thầm
//   · bắt HỤT     -> log lại ngập như cũ, việc sửa thành công cốc
// Và một điều kiện bắt buộc thứ ba: KHÔNG BAO GIỜ im hoàn toàn — mạng hỏng dài phải tự
// leo thang về log đầy đủ, và lúc nối lại được phải có dòng tổng kết.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');

const { _log } = require('../src/database');
const { _gop } = require('../src/lib/logger');
const { laLoiMang, quyetDinhLog, logDbError, ghiNhanMangOk, datLaiMang, NET_LEO_THANG_MS } = _log;

const T0 = 1_700_000_000_000; // mốc cố định — không dùng Date.now() để test khỏi lung lay

function lamSach() { datLaiMang(); _gop.xoaHet(); }

/** Bắt mọi thứ bot in ra trong lúc chạy `fn`. */
function bat(fn) {
    const ra = { error: [], warn: [] };
    const eCu = console.error, wCu = console.warn;
    console.error = (...a) => ra.error.push(a);
    console.warn = (...a) => ra.warn.push(a);
    try { fn(); } finally { console.error = eCu; console.warn = wCu; }
    return ra;
}

// ── Phân loại ────────────────────────────────────────────────────────────────

test('mạng: nhận ra đúng cú lỗi thật đã xảy ra ngoài prod (EAI_AGAIN lồng trong cause)', () => {
    const err = new TypeError('fetch failed');
    err.cause = Object.assign(new Error('getaddrinfo EAI_AGAIN kuvlkaxregnanhzgqrbp.supabase.co'), { code: 'EAI_AGAIN' });
    assert.strictEqual(laLoiMang(err), true);
});

test('mạng: nhận ra cả khi chỉ còn CHUỖI — vài chỗ gọi truyền sẵn error?.message', () => {
    // aiOverview/chargeWealthTax/setClanWarCooldown truyền `error?.message || error`,
    // lúc đó không còn .code để soi, phải nhận diện bằng văn bản.
    assert.strictEqual(laLoiMang('TypeError: fetch failed'), true);
    assert.strictEqual(laLoiMang('read ECONNRESET'), true);
});

test('mạng: quá hạn SUPABASE_TIMEOUT_MS (AbortError) tính là mạng', () => {
    assert.strictEqual(laLoiMang(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })), true);
});

test('KHÔNG bắt quá tay: lỗi DB thật vẫn là lỗi DB', () => {
    assert.strictEqual(laLoiMang({ code: 'PGRST116', message: 'no rows returned' }), false);
    assert.strictEqual(laLoiMang({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
    assert.strictEqual(laLoiMang(new Error('Không đủ xu')), false);
    // Bẫy dễ mắc nhất: có chữ "timeout" nhưng là Postgres huỷ câu lệnh, KHÔNG phải mạng.
    assert.strictEqual(laLoiMang(new Error('canceling statement due to statement timeout')), false);
    assert.strictEqual(laLoiMang(null), false);
});

// ── Nhịp in ──────────────────────────────────────────────────────────────────

test('lỗi DB: luôn in ĐẦY ĐỦ, không gộp, không hoãn', () => {
    lamSach();
    for (let i = 0; i < 5; i++) {
        assert.strictEqual(quyetDinhLog({ code: '23505' }, T0 + i * 1000).kieu, 'day-du',
            'lỗi DB mà bị gộp là mất dấu lỗi thật');
    }
});

test('mạng: lần đầu LUÔN thấy, các lần lặp mới im', () => {
    lamSach();
    const err = { code: 'EAI_AGAIN' };
    assert.strictEqual(quyetDinhLog(err, T0).kieu, 'gon', 'lần đầu phải báo ngay');
    for (let i = 1; i <= 30; i++) {
        assert.strictEqual(quyetDinhLog(err, T0 + i * 1000).kieu, 'im', `lần ${i} phải im`);
    }
});

test('mạng: gộp theo MÃ LỖI chứ không theo hàm — một cú rớt mạng chỉ đẻ ra một dòng', () => {
    lamSach();
    // Đây là điểm chính: rớt DNS làm hỏng hàng chục hàm khác nhau cùng lúc.
    assert.strictEqual(quyetDinhLog({ code: 'EAI_AGAIN' }, T0).kieu, 'gon');
    assert.strictEqual(quyetDinhLog({ code: 'EAI_AGAIN' }, T0 + 60).kieu, 'im', 'hàm khác, cùng mã -> vẫn im');
    // Nhưng mã lỗi KHÁC thì không được che nhau.
    assert.strictEqual(quyetDinhLog({ code: 'ECONNREFUSED' }, T0 + 61).kieu, 'gon');
});

test('mạng hỏng DÀI: tự leo thang về log đầy đủ, đúng MỘT lần, kèm số lượt đã hỏng', () => {
    lamSach();
    const err = { code: 'EAI_AGAIN' };
    quyetDinhLog(err, T0);                       // mở đợt
    quyetDinhLog(err, T0 + 1000);                // im
    const qd = quyetDinhLog(err, T0 + NET_LEO_THANG_MS);
    assert.strictEqual(qd.kieu, 'leo-thang', 'mất kết nối kéo dài KHÔNG được im lặng');
    assert.strictEqual(qd.luot, 3, 'phải nói đúng đã hỏng bao nhiêu lượt');
    assert.ok(qd.giay >= NET_LEO_THANG_MS / 1000);
    // Đã kêu rồi thì thôi, không kêu lại mỗi lượt.
    assert.notStrictEqual(quyetDinhLog(err, T0 + NET_LEO_THANG_MS + 1000).kieu, 'leo-thang');
});

test('nối lại được: in dòng tổng kết rồi đặt lại bộ đếm', () => {
    lamSach();
    quyetDinhLog({ code: 'EAI_AGAIN' }, T0);
    quyetDinhLog({ code: 'EAI_AGAIN' }, T0 + 5000);
    const ra = bat(() => ghiNhanMangOk(T0 + 9000));
    assert.strictEqual(ra.warn.length, 1, 'phải báo là đã hồi phục');
    assert.match(String(ra.warn[0][0]), /kết nối lại/i);
    assert.match(String(ra.warn[0][0]), /2 lượt/, 'phải nói mất bao nhiêu lượt gọi');
    // Đặt lại rồi thì lần gọi trót lọt sau đó phải im.
    assert.strictEqual(bat(() => ghiNhanMangOk(T0 + 10_000)).warn.length, 0);
});

test('mạng lành: gọi trót lọt mà chưa từng hỏng thì KHÔNG in gì', () => {
    lamSach();
    assert.strictEqual(bat(() => ghiNhanMangOk(T0)).warn.length, 0);
});

// ── Đầu ra thực tế ───────────────────────────────────────────────────────────

test('logDbError: lỗi DB giữ NGUYÊN định dạng cũ (168 chỗ gọi không đổi hành vi)', () => {
    lamSach();
    const err = { code: '23505', message: 'duplicate key' };
    const ra = bat(() => logDbError('[DATABASE ERROR] buyItem():', err));
    assert.strictEqual(ra.warn.length, 0);
    assert.deepStrictEqual(ra.error, [['[DATABASE ERROR] buyItem():', err]],
        'nhãn và đối tượng lỗi phải đi qua y nguyên, kể cả tham số phụ');
});

test('logDbError: lỗi mạng ra MỘT dòng warn, vẫn đủ tên hàm và nguyên nhân', () => {
    lamSach();
    const err = new TypeError('fetch failed');
    err.cause = Object.assign(new Error('getaddrinfo EAI_AGAIN'), { code: 'EAI_AGAIN' });
    const ra = bat(() => logDbError('[DATABASE ERROR] resolveExpiredAuctions():', err));
    assert.strictEqual(ra.error.length, 0, 'lỗi mạng không được dán nhãn DATABASE ERROR nữa');
    assert.strictEqual(ra.warn.length, 1);
    const dong = String(ra.warn[0][0]);
    assert.match(dong, /^\[NET\]/);
    assert.match(dong, /EAI_AGAIN/, 'phải giữ nguyên nhân để còn chẩn đoán được');
    assert.match(dong, /resolveExpiredAuctions/, 'phải giữ tên hàm để biết chỗ nào hỏng');
    assert.doesNotMatch(dong, /\n/, 'gọn trong một dòng — cả stack là thứ đang cần bỏ');
});

test('logDbError: giữ luôn tham số phụ của logError(method, err, extra)', () => {
    lamSach();
    const err = new Error('Không đủ xu');
    const extra = { guild: '123' };
    const ra = bat(() => logDbError('[DATABASE ERROR] in antinukePruneIncidents:', err, extra));
    assert.deepStrictEqual(ra.error, [['[DATABASE ERROR] in antinukePruneIncidents:', err, extra]]);
});
