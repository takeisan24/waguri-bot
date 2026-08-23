// ============================================================
// test/ai_taianh.test.js — tầng tải ảnh phải chặn đúng thứ cần chặn.
//
// Đây là phần DUY NHẤT của tính năng phụ thuộc hạ tầng ngoài (CDN Discord), nên nó cũng là
// phần dễ hỏng theo kiểu không ai ngờ. Ba rào quan trọng nhất:
//
//   · host trắng -> bot đi lấy URL người lạ gửi là mở cửa SSRF vào mạng nội bộ
//   · trần byte  -> `attachment.size` là số Discord KHAI, không phải byte thật nhận được
//   · timeout    -> CDN chậm không được treo lượt chat
//
// LƯU Ý CHI PHÍ: KHÔNG có tầng thu nhỏ ảnh, và đó là cố ý. Đo 2026-08-23 thấy giá ảnh gần
// như phẳng ~1095 token bất kể kích thước (ảnh 2×2 và 1920×1080 tốn như nhau), nên resize
// không tiết kiệm được token nào.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { taiAnh, TRAN_BYTE, mimeTuDuoi } = require('../src/lib/ai/taiAnh');

const PNG_NHO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z4AATAxIHAgLAAAA//8DAAJ2AV52ZQe5AAAAAElFTkSuQmCC', 'base64');

/** Thay fetch toàn cục trong một lần chạy. */
async function voiFetch(gia, fn) {
    const cu = global.fetch;
    global.fetch = gia;
    try { return await fn(); } finally { global.fetch = cu; }
}
const traVe = (buf, headers = {}) => async () => ({
    ok: true,
    headers: { get: k => headers[k] ?? null },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
});

const dinhKem = (o = {}) => ({
    url: 'https://cdn.discordapp.com/attachments/1/2/a.png',
    contentType: 'image/png',
    name: 'a.png',
    size: 100,
    ...o,
});

test('ảnh hợp lệ từ CDN Discord -> trả base64 kèm mimeType', async () => {
    const ra = await voiFetch(traVe(PNG_NHO), () => taiAnh(dinhKem()));
    assert.ok(ra, 'Ảnh hợp lệ mà trả null thì tính năng coi như không tồn tại.');
    assert.strictEqual(ra.mimeType, 'image/png');
    assert.strictEqual(ra.data, PNG_NHO.toString('base64'));
});

test('CHẶN host lạ — đây là rào chống SSRF', async () => {
    let goi = 0;
    const ra = await voiFetch(async () => { goi++; return traVe(PNG_NHO)(); },
        () => taiAnh(dinhKem({ url: 'https://evil.example.com/a.png' })));
    assert.strictEqual(ra, null);
    assert.strictEqual(goi, 0, 'Phải chặn TRƯỚC khi gọi mạng, không phải sau.');
});

test('CHẶN http (không mã hoá) dù đúng host', async () => {
    const ra = await voiFetch(traVe(PNG_NHO),
        () => taiAnh(dinhKem({ url: 'http://cdn.discordapp.com/a.png' })));
    assert.strictEqual(ra, null);
});

test('nhận media.discordapp.net — CDN thứ hai của Discord', async () => {
    const ra = await voiFetch(traVe(PNG_NHO),
        () => taiAnh(dinhKem({ url: 'https://media.discordapp.net/attachments/1/2/a.png' })));
    assert.ok(ra, 'Discord dùng cả hai host; bỏ sót một cái là ảnh hỏng ngẫu nhiên.');
});

test('CHẶN mimeType không phải ảnh xem được', async () => {
    for (const ct of ['image/gif', 'application/pdf', 'video/mp4', 'image/svg+xml']) {
        const ra = await voiFetch(traVe(PNG_NHO), () => taiAnh(dinhKem({ contentType: ct, name: 'x.bin' })));
        assert.strictEqual(ra, null, `${ct} lẽ ra phải bị chặn.`);
    }
});

test('contentType null -> suy từ đuôi file, không đoán bừa', async () => {
    const co = await voiFetch(traVe(PNG_NHO), () => taiAnh(dinhKem({ contentType: null, name: 'anh.JPEG' })));
    assert.ok(co, 'Discord CÓ THỂ trả contentType null; tin mỗi nó là mất ảnh.');
    assert.strictEqual(co.mimeType, 'image/jpeg');

    const khong = await voiFetch(traVe(PNG_NHO), () => taiAnh(dinhKem({
        contentType: null, name: 'khongro', url: 'https://cdn.discordapp.com/attachments/1/2/khongro'
    })));
    assert.strictEqual(khong, null, 'Cả contentType lẫn đuôi đều mù thì BỎ, không đoán.');
});

test('mimeTuDuoi bỏ qua tham số truy vấn của URL đã ký', async () => {
    assert.strictEqual(mimeTuDuoi('a.png?ex=1&is=2&hm=3'), 'image/png');
});

test('CHẶN theo size Discord khai, trước khi tốn một lần gọi mạng', async () => {
    let goi = 0;
    const ra = await voiFetch(async () => { goi++; return traVe(PNG_NHO)(); },
        () => taiAnh(dinhKem({ size: TRAN_BYTE + 1 })));
    assert.strictEqual(ra, null);
    assert.strictEqual(goi, 0);
});

test('CHẶN theo byte THẬT kể cả khi size khai nhỏ', async () => {
    // `attachment.size` là số Discord khai. Tin nó mà không cắt lúc tải thì một tệp khổng lồ
    // vẫn vào được RAM.
    const to = Buffer.alloc(TRAN_BYTE + 1024, 1);
    const ra = await voiFetch(traVe(to), () => taiAnh(dinhKem({ size: 10 })));
    assert.strictEqual(ra, null, 'Phải chốt chặn theo byte thật nhận được, không theo số khai.');
});

test('CHẶN theo content-length khi máy chủ khai vượt trần', async () => {
    const ra = await voiFetch(traVe(PNG_NHO, { 'content-length': String(TRAN_BYTE + 1) }),
        () => taiAnh(dinhKem()));
    assert.strictEqual(ra, null);
});

test('tệp rỗng -> bỏ', async () => {
    const ra = await voiFetch(traVe(Buffer.alloc(0)), () => taiAnh(dinhKem()));
    assert.strictEqual(ra, null);
});

test('CDN lỗi hoặc timeout -> trả null, KHÔNG ném ra ngoài', async () => {
    // Ném ra ngoài là lượt chat chết hẳn. Hỏng ảnh chỉ được phép làm mất ảnh.
    const loi = await voiFetch(async () => { throw new Error('AbortError'); }, () => taiAnh(dinhKem()));
    assert.strictEqual(loi, null);

    const khongOk = await voiFetch(async () => ({ ok: false, headers: { get: () => null } }), () => taiAnh(dinhKem()));
    assert.strictEqual(khongOk, null);
});

test('cờ tắt khẩn AI_ANH_BAT=0 chặn mọi ảnh mà không gọi mạng', async () => {
    const cu = process.env.AI_ANH_BAT;
    process.env.AI_ANH_BAT = '0';
    try {
        let goi = 0;
        const ra = await voiFetch(async () => { goi++; return traVe(PNG_NHO)(); }, () => taiAnh(dinhKem()));
        assert.strictEqual(ra, null);
        assert.strictEqual(goi, 0, 'Tắt rồi mà vẫn gọi mạng thì cờ tắt không có tác dụng gì.');
    } finally {
        if (cu === undefined) delete process.env.AI_ANH_BAT; else process.env.AI_ANH_BAT = cu;
    }
});

test('đính kèm không có url -> bỏ, không nổ', async () => {
    assert.strictEqual(await taiAnh(null), null);
    assert.strictEqual(await taiAnh({}), null);
    assert.strictEqual(await taiAnh({ url: 'khong-phai-url' }), null);
});
