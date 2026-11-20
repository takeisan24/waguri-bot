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

test('gateway: mất 10s không báo, mất 45s báo đúng một tin', async () => {
    const m = moiTruong();
    m.nk.khiShardNgat(0, 1006);
    m.tien(10_000);
    m.nk.khiShardNoiLai(0);
    m.nk.khiShardNgat(0, 1006);
    m.tien(20_000);
    m.nk.khiShardNgat(0);          // shardReconnecting không được đặt lại mốc
    m.tien(25_000);
    m.nk.khiShardNoiLai(0);
    m.nk.khiShardNoiLai(0);        // ready + resume cùng lúc -> vẫn một tin
    await new Promise(r => setImmediate(r));
    assert.strictEqual(m.goi.length, 1);
    assert.match(moTa(m.goi[0]), /45 giây.*code 1006/);
    m.don();
});

test('thoatSauKhiBao: gửi rồi mới exit(1), gọi hai lần chỉ chạy một lần, file ghi kết cục lỗi', async () => {
    const m = moiTruong();
    m.nk.batDau();
    const p1 = m.nk.thoatSauKhiBao('Uncaught Exception', new Error('boom'));
    const p2 = m.nk.thoatSauKhiBao('Uncaught Exception', new Error('lần hai'));
    await Promise.all([p1, p2]);
    assert.strictEqual(m.thoat(), 1);
    assert.strictEqual(m.goi.length, 1);
    assert.match(tieuDe(m.goi[0]), /Bot thoát: Uncaught Exception/);
    const f = JSON.parse(fs.readFileSync(m.file, 'utf8'));
    assert.strictEqual(f.ketThuc.kieu, 'loi');
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
    assert.doesNotThrow(() => { nk.batDau(); nk.ghiNhip(); nk.baoKhoiDong(null); });
});
