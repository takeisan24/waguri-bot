// ============================================================
// test/nhat_ky_vong_doi.test.js — Gác lib/nhatKyVongDoi.js (spec docs/spec-nhat-ky-vong-doi.md, S6 1–7).
//
// Chạy thật mọi đường với fetch GIẢ + thư mục tạm; không gọi mạng, không đụng `.runtime/` thật.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { taoNhatKy, HANG } = require('../src/lib/nhatKyVongDoi');

const URL_GIA = 'https://discord.invalid/api/webhooks/1/bi-mat';

function moiTruong({ url = URL_GIA, fetchFn, t0 = 1_800_000_000_000, timeoutMs = 50 } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vongdoi-'));
    const file = path.join(dir, 'sub', 'vong-doi.json');
    const goi = [];
    let gio = t0;
    let thoat = null;
    const nk = taoNhatKy({
        docUrl: () => url,
        fetchFn: fetchFn || (async (u, init) => { goi.push({ u, body: JSON.parse(init.body) }); return { ok: true }; }),
        now: () => gio,
        fileTrangThai: file,
        timeoutMs,
        exitFn: (c) => { thoat = c; },
        memoryUsage: () => ({ heapUsed: 120 * 1048576, rss: 300 * 1048576 }),
        build: () => ({ version: '2.6.0', commit: 'abc1234', startedAt: new Date(gio).toISOString() }),
    });
    return {
        nk, goi, file,
        tien: (ms) => { gio += ms; },
        thoat: () => thoat,
        don: () => fs.rmSync(dir, { recursive: true, force: true }),
    };
}

const tieuDe = (g) => g.body.embeds[0].title;
const moTa = (g) => g.body.embeds[0].description;

test('không có LOG_WEBHOOK_URL -> không gọi fetch, file trạng thái vẫn được ghi', async () => {
    const m = moiTruong({ url: null });
    m.nk.baoKhoiDong({ guilds: { cache: { size: 3 } } });
    assert.strictEqual(await m.nk.guiSuKien('x', 'y'), false);
    assert.strictEqual(m.goi.length, 0);
    assert.ok(fs.existsSync(m.file), 'vẫn phải ghi nhịp kể cả khi không có webhook');
    m.don();
});

test('payload đúng tiêu đề, không chứa URL webhook', async () => {
    const m = moiTruong();
    await m.nk.guiSuKien('🌸 thử', 'nội dung');
    assert.strictEqual(m.goi.length, 1);
    assert.strictEqual(tieuDe(m.goi[0]), '🌸 thử');
    assert.ok(!JSON.stringify(m.goi[0].body).includes('bi-mat'));
    m.don();
});

test('fetch treo -> tự huỷ theo timeout, không ném', async () => {
    const m = moiTruong({
        fetchFn: (u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort')))),
        timeoutMs: 30,
    });
    const bd = Date.now();
    // AbortSignal.timeout dùng timer unref: giữ event loop sống như trên prod (bot luôn có việc).
    const giu = setTimeout(() => {}, 2000);
    assert.strictEqual(await m.nk.guiSuKien('treo', ''), false);
    clearTimeout(giu);
    assert.ok(Date.now() - bd < 1000);
    m.don();
});

test('fetch ném lỗi / trả 500 -> false, không ném', async () => {
    const m1 = moiTruong({ fetchFn: async () => { throw new Error('mạng'); } });
    assert.strictEqual(await m1.nk.guiSuKien('a', ''), false);
    const m2 = moiTruong({ fetchFn: async () => ({ ok: false, status: 500 }) });
    assert.strictEqual(await m2.nk.guiSuKien('a', ''), false);
    m1.don(); m2.don();
});

test('kết cục lần trước: không có / hỏng / tắt gọn / lỗi / chết bất thường', () => {
    const { moTaLanTruoc } = moiTruong().nk._test;
    assert.match(moTaLanTruoc(null), /Không rõ/);
    assert.match(moTaLanTruoc({ rac: 1 }), /Không rõ/);
    const goc = { lastBeat: '2026-11-20T01:27:00Z', heapUsedMb: 210, rssMb: 360, commit: 'abc1234', startedAt: '2026-11-19T00:00:00Z' };
    assert.match(moTaLanTruoc({ ...goc, ketThuc: { kieu: 'tat', lyDo: 'SIGTERM', luc: goc.lastBeat } }), /tắt gọn.*SIGTERM/);
    assert.match(moTaLanTruoc({ ...goc, ketThuc: { kieu: 'loi', lyDo: 'Watchdog', luc: goc.lastBeat } }), /thoát do lỗi.*Watchdog/);
    const bt = moTaLanTruoc({ ...goc, ketThuc: null });
    assert.match(bt, /chết bất thường/);
    assert.match(bt, /heap 210 MB/);
    assert.match(bt, /RSS 360 MB/);
});

test('vòng đời qua file: chạy -> chết thẳng -> lần sau báo chết bất thường', () => {
    const m = moiTruong();
    m.nk.batDau();
    m.nk.ghiNhip();
    // tiến trình "bị kill": không gọi baoTat. Tiến trình mới đọc lại cùng file.
    const m2nk = taoNhatKy({
        docUrl: () => URL_GIA, fetchFn: async (u, init) => { m.goi.push({ body: JSON.parse(init.body) }); return { ok: true }; },
        fileTrangThai: m.file, now: () => 1_800_000_100_000,
        memoryUsage: () => ({ heapUsed: 1, rss: 1 }),
        build: () => ({ version: '2.6.0', commit: 'def5678', startedAt: 'x' }),
    });
    m2nk.baoKhoiDong({ guilds: { cache: { size: 1 } } });
    const tin = m.goi.at(-1);
    assert.match(moTa(tin), /chết bất thường/);
    m.don();
});

test('crash loop: bộ đếm sống qua file -> tin thứ 7 trong 10 phút bị bỏ', async () => {
    const m = moiTruong();
    let gio = 1_800_000_000_000;
    for (let i = 0; i < HANG.TRAN_TIN + 1; i++) {
        // mỗi vòng là một TIẾN TRÌNH mới (taoNhatKy mới) dùng chung file
        const nk = taoNhatKy({
            docUrl: () => URL_GIA,
            fetchFn: async (u, init) => { m.goi.push({ body: JSON.parse(init.body) }); return { ok: true }; },
            fileTrangThai: m.file, now: () => gio,
            memoryUsage: () => ({ heapUsed: 1, rss: 1 }),
            build: () => ({ version: '2.6.0', commit: 'c', startedAt: new Date(gio).toISOString() }),
        });
        nk.baoKhoiDong({});
        await new Promise(r => setImmediate(r));
        await new Promise(r => setImmediate(r));
        gio += 30_000;
    }
    assert.strictEqual(m.goi.length, HANG.TRAN_TIN);
    m.don();
});

test('BAND: 230 dòng -> một tin, 25 dòng mẫu, mô tả < 4000; rỗng thì không gửi', async () => {
    const m = moiTruong();
    assert.strictEqual(await m.nk.xaBandLog(), false);
    for (let i = 0; i < 230; i++) m.nk.ghiBandLog(`[BAND LOG] user=${i % 7} src=work gross=900 net_tinh=450 tong_sau=${100000 + i}`, String(i % 7));
    assert.strictEqual(await m.nk.xaBandLog(), true);
    assert.strictEqual(m.goi.length, 1);
    const d = moTa(m.goi[0]);
    assert.match(d, /\*\*230 dòng\*\* · 7 người/);
    assert.strictEqual((d.match(/\[BAND LOG\]/g) || []).length, HANG.BAND_MAU);
    assert.ok(d.length < 4000);
    assert.strictEqual(await m.nk.xaBandLog(), false, 'đã xả thì bộ đệm rỗng');
    m.don();
});

test('gateway: mất 10s không báo, mất 45s báo đúng một tin (đường thật: shardReconnecting không kèm code)', async () => {
    const m = moiTruong();
    m.nk.khiShardNgat(0);
    m.tien(10_000);
    m.nk.khiShardNoiLai(0);
    m.nk.khiShardNgat(0);
    m.tien(20_000);
    m.nk.khiShardNgat(0);          // reconnecting lặp lại không được đặt lại mốc
    m.tien(25_000);
    m.nk.khiShardNoiLai(0);
    m.nk.khiShardNoiLai(0);        // ready + resume cùng lúc -> vẫn một tin
    await new Promise(r => setImmediate(r));
    assert.strictEqual(m.goi.length, 1);
    assert.match(moTa(m.goi[0]), /45 giây/);
    assert.doesNotMatch(moTa(m.goi[0]), /code/);
    m.don();
});

test('hạn mức mạng tách riêng: mạng chập chờn không chiếm chỗ của tin thoát', async () => {
    const m = moiTruong();
    m.nk.batDau();
    for (let i = 0; i < 8; i++) {
        m.nk.khiShardNgat(0);
        m.tien(40_000);
        m.nk.khiShardNoiLai(0);
        await new Promise(r => setImmediate(r));
    }
    const soMang = m.goi.length;
    assert.strictEqual(soMang, HANG.TRAN_MANG, 'tin mạng bị giới hạn ở hạn mức riêng');
    await m.nk.thoatSauKhiBao('Watchdog', new Error('x'));
    assert.strictEqual(m.goi.length, soMang + 1);
    assert.match(tieuDe(m.goi.at(-1)), /Bot thoát: Watchdog/);
    m.don();
});

test('thoatSauKhiBao: gửi XONG rồi mới exit(1), gọi hai lần chỉ chạy một lần, file ghi kết cục lỗi', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vongdoi-'));
    const file = path.join(dir, 'f.json');
    const goi = [];
    let luc = null;
    const nk = taoNhatKy({
        docUrl: () => URL_GIA,
        fetchFn: async (u, init) => { await new Promise(r => setTimeout(r, 20)); goi.push(JSON.parse(init.body)); return { ok: true }; },
        fileTrangThai: file, timeoutMs: 500,
        exitFn: (c) => { luc = { c, soTin: goi.length }; },
        memoryUsage: () => ({ heapUsed: 1, rss: 1 }),
        build: () => ({ version: 'x', commit: 'c', startedAt: 'x' }),
    });
    nk.batDau();
    await Promise.all([
        nk.thoatSauKhiBao('Uncaught Exception', new Error('boom')),
        nk.thoatSauKhiBao('Uncaught Exception', new Error('lần hai')),
    ]);
    assert.deepStrictEqual(luc, { c: 1, soTin: 1 }, 'exit phải chạy SAU khi tin đã gửi');
    assert.match(goi[0].embeds[0].title, /Bot thoát: Uncaught Exception/);
    assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).ketThuc.kieu, 'loi');
    assert.strictEqual(nk.dangThoat(), true);
    assert.strictEqual(await nk.baoTat('SIGTERM'), false, 'đang thoát do lỗi thì đường tắt không chạy');
    fs.rmSync(dir, { recursive: true, force: true });
});

test('nhịp không ghi đè kết cục: tắt chậm rồi interval nhịp chạy -> file vẫn "tat"', async () => {
    const m = moiTruong();
    m.nk.batDau();
    await m.nk.baoTat('SIGTERM');
    m.nk.ghiNhip();
    assert.strictEqual(JSON.parse(fs.readFileSync(m.file, 'utf8')).ketThuc.kieu, 'tat');
    m.don();
});

test('chuỗi restart giữ nguyên nhân gốc: chết thẳng -> chết trước Ready -> lần Ready báo cả hai', async () => {
    const m = moiTruong();
    const tao = (commit) => taoNhatKy({
        docUrl: () => URL_GIA,
        fetchFn: async (u, init) => { m.goi.push({ body: JSON.parse(init.body) }); return { ok: true }; },
        fileTrangThai: m.file, now: () => 1_800_000_000_000, exitFn: () => {},
        memoryUsage: () => ({ heapUsed: 400 * 1048576, rss: 500 * 1048576 }),
        build: () => ({ version: 'x', commit, startedAt: '2026-11-20T00:00:00Z' }),
    });
    tao('a1').batDau();                                      // lần 1: chạy rồi bị kill (không ghi kết cục)
    const lan2 = tao('a2');
    lan2.batDau();                                           // lần 2: chưa Ready đã thoát do lỗi
    await lan2.thoatSauKhiBao('Watchdog', new Error('x'));
    const lan3 = tao('a3');
    lan3.batDau();
    lan3.baoKhoiDong({});
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    const d = moTa(m.goi.at(-1));
    assert.match(d, /chết bất thường.*heap 400 MB/);
    assert.match(d, /thoát do lỗi\*\* \(Watchdog\)/);
    // đã báo thành công -> lần 4 chỉ báo kết cục của lần 3
    const lan4 = tao('a4');
    lan4.batDau();
    lan4.baoKhoiDong({});
    await new Promise(r => setImmediate(r));
    const d4 = moTa(m.goi.at(-1));
    assert.doesNotMatch(d4, /Watchdog/);
    assert.match(d4, /chết bất thường/);
    m.don();
});

test('baoTat: ghi kết cục tắt gọn + gửi tin tắt + xả BAND', async () => {
    const m = moiTruong();
    m.nk.batDau();
    m.nk.ghiBandLog('[BAND LOG] user=1', '1');
    await m.nk.baoTat('SIGTERM');
    const ten = m.goi.map(tieuDe).sort();
    assert.deepStrictEqual(ten, ['📊 BAND LOG', '🌙 Bot đang tắt'].sort());
    assert.strictEqual(JSON.parse(fs.readFileSync(m.file, 'utf8')).ketThuc.kieu, 'tat');
    m.don();
});

test('thư mục không ghi được -> không ném', () => {
    const nk = taoNhatKy({
        docUrl: () => undefined,
        fileTrangThai: path.join(__filename, 'khong-the', 'f.json'), // cha là một FILE -> mkdir hỏng
        build: () => ({ version: 'x', commit: null, startedAt: 'x' }),
    });
    const warn = console.warn;
    let soWarn = 0;
    console.warn = () => { soWarn++; };
    try {
        assert.doesNotThrow(() => { nk.batDau(); nk.ghiNhip(); nk.ghiNhip(); nk.baoKhoiDong(null); });
    } finally { console.warn = warn; }
    assert.strictEqual(soWarn, 1, 'chỉ cảnh báo ghi file đúng một lần');
});
