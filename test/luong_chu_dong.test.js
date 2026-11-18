// ============================================================
// lib/luongChuDong.js + database.nhanThuNhapChuDong — nhánh chế độ/lỗi (S1 #1-#6, #15, #22).
// Thuần: mock bằng cách gán đè hàm trên module database.js (luongChuDong gọi `db.xxx`), khôi phục sau mỗi test.
// KHÔNG gọi DB/RPC thật.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');

const db = require('../src/database');
const { ghiLuongChuDong } = require('../src/lib/luongChuDong');
const config = require('../src/config');

const GOC = {
    nhanThuNhapChuDong: db.nhanThuNhapChuDong,
    addMoney: db.addMoney,
    layBandMode: db.layBandMode,
};
const GOC_LOG = { log: console.log, warn: console.warn, error: console.error };

let goi;      // { rpc: [...], add: [...] }
let nhatKy;   // { log: [], warn: [], error: [] }

function dung({ che, rpc, addOk = true }) {
    goi = { rpc: [], add: [] };
    nhatKy = { log: [], warn: [], error: [] };
    db.layBandMode = () => che;
    db.nhanThuNhapChuDong = async (...a) => { goi.rpc.push(a); return typeof rpc === 'function' ? rpc(...a) : rpc; };
    db.addMoney = async (...a) => { goi.add.push(a); return addOk; };
    for (const k of ['log', 'warn', 'error']) console[k] = (...a) => { nhatKy[k].push(a.join(' ')); };
}
test.afterEach(() => {
    Object.assign(db, GOC);
    Object.assign(console, GOC_LOG);
});

const OK = (net, netTinh, tongSau, tongTruoc = 0) => ({ ok: true, net, netTinh, tongTruoc, tongSau });
const LOI = (loai) => ({ ok: false, loai, ma: 'x' });

test('off: addMoney(gross) nhãn nguồn, KHÔNG gọi RPC', async () => {
    dung({ che: 'off' });
    const kq = await ghiLuongChuDong('u1', 3250, 'work');
    assert.deepStrictEqual(goi.rpc, []);
    assert.deepStrictEqual(goi.add, [['u1', 3250, 'wallet', 'work']]);
    assert.strictEqual(kq.daGhi, true);
    assert.strictEqual(kq.soGhi, 3250);
    assert.strictEqual(kq.giam, false);
});

test('log + ok: soGhi = net (ví đã +gross từ RPC), không addMoney; có [BAND LOG] khi net_tinh < gross', async () => {
    dung({ che: 'log', rpc: OK(3250, 325, 1200000) });
    const kq = await ghiLuongChuDong('u1', 3250, 'work');
    assert.strictEqual(goi.rpc.length, 1);
    assert.strictEqual(goi.add.length, 0);
    assert.strictEqual(kq.daGhi, true);
    assert.strictEqual(kq.soGhi, 3250);
    assert.strictEqual(kq.giam, false, 'chế độ log không bao giờ báo giảm cho người chơi');
    assert.ok(nhatKy.log.some((s) => s.includes('[BAND LOG]') && s.includes('net_tinh=325')));
});

test('log + ok nhưng net_tinh = gross: không in [BAND LOG]', async () => {
    dung({ che: 'log', rpc: OK(500, 500, 500) });
    await ghiLuongChuDong('u1', 500, 'gather');
    assert.ok(!nhatKy.log.some((s) => s.includes('[BAND LOG]')));
});

test('enforce + ok, net < gross: giam=true, sanDay theo tong_sau > 1.000.000', async () => {
    dung({ che: 'enforce', rpc: OK(1500, 1500, 150000, 148000) });
    let kq = await ghiLuongChuDong('u1', 3000, 'work');
    assert.strictEqual(kq.giam, true);
    assert.strictEqual(kq.sanDay, false);
    assert.strictEqual(kq.soGhi, 1500);

    dung({ che: 'enforce', rpc: OK(400, 400, 1200000) });
    kq = await ghiLuongChuDong('u1', 7500, 'work');
    assert.strictEqual(kq.giam, true);
    assert.strictEqual(kq.sanDay, true);
    assert.strictEqual(kq.soGhi, 400);
    assert.strictEqual(goi.add.length, 0, 'RPC đã ghi ví, JS không ghi lần hai');
});

test('enforce + ok, net = gross: không giảm, không sanDay', async () => {
    dung({ che: 'enforce', rpc: OK(2000, 2000, 2000) });
    const kq = await ghiLuongChuDong('u1', 2000, 'work');
    assert.strictEqual(kq.giam, false);
    assert.strictEqual(kq.sanDay, false);
});

test('S1#22: Lớp B kẹp net về 0 -> soGhi = 0 nhưng daGhi = true, in đúng số RPC trả', async () => {
    dung({ che: 'enforce', rpc: OK(0, 100, 5000) });
    const kq = await ghiLuongChuDong('u1', 100, 'work');
    assert.strictEqual(kq.daGhi, true);
    assert.strictEqual(kq.soGhi, 0);
});

test('S1#1: rollback + enforce -> addMoney(min(gross, 400)), warn [BAND FAIL] rollback', async () => {
    dung({ che: 'enforce', rpc: LOI('rollback') });
    let kq = await ghiLuongChuDong('u1', 3250, 'work');
    assert.deepStrictEqual(goi.add, [['u1', 400, 'wallet', 'work']]);
    assert.strictEqual(kq.soGhi, 400);
    assert.strictEqual(kq.loai, 'rollback');
    assert.ok(nhatKy.warn.some((s) => s.includes('[BAND FAIL] rollback')));

    dung({ che: 'enforce', rpc: LOI('rollback') });
    kq = await ghiLuongChuDong('u1', 77, 'gather');
    assert.deepStrictEqual(goi.add, [['u1', 77, 'wallet', 'gather']], 'gross < 400 -> không nâng lên 400 (INV-8)');
});

test('S1#2: rollback + log -> addMoney(gross) = hành vi hôm nay', async () => {
    dung({ che: 'log', rpc: LOI('rollback') });
    const kq = await ghiLuongChuDong('u1', 3250, 'work');
    assert.deepStrictEqual(goi.add, [['u1', 3250, 'wallet', 'work']]);
    assert.strictEqual(kq.soGhi, 3250);
});

test('S1#3: khong_ro ở CẢ HAI chế độ -> addMoney(min(gross, 400)) và KHÔNG gọi RPC lần hai (không trả 2 lần)', async () => {
    // Ghi chú: ca "pg_sleep" của S6 ("Lỗi loại không rõ — không trả 2 lần") được mô phỏng ở đây:
    // RPC có thể đã ghi ví, nên dự phòng chỉ <= 400 và đúng MỘT lần gọi RPC.
    for (const che of ['log', 'enforce']) {
        dung({ che, rpc: LOI('khong_ro') });
        const kq = await ghiLuongChuDong('u1', 3250, 'work');
        assert.strictEqual(goi.rpc.length, 1, `${che}: không được gọi lại RPC`);
        assert.deepStrictEqual(goi.add, [['u1', 400, 'wallet', 'work']], che);
        assert.strictEqual(kq.soGhi, 400);
        assert.strictEqual(kq.loai, 'khong_ro');
        assert.ok(nhatKy.warn.some((s) => s.includes('[BAND FAIL] khong_ro')));
    }
});

test('S1#4: addMoney dự phòng cũng false -> daGhi=false, soGhi=0, log [PAYOUT FAIL], không ném', async () => {
    dung({ che: 'enforce', rpc: LOI('rollback'), addOk: false });
    const kq = await ghiLuongChuDong('u1', 3250, 'work');
    assert.strictEqual(kq.daGhi, false);
    assert.strictEqual(kq.soGhi, 0);
    assert.ok(nhatKy.error.some((s) => s.includes('[PAYOUT FAIL]')));

    dung({ che: 'off', addOk: false });
    const k2 = await ghiLuongChuDong('u1', 3250, 'work');
    assert.strictEqual(k2.daGhi, false);
    assert.strictEqual(k2.soGhi, 0);
});

test('S1#15: gross <= 0 (hoặc không phải số) -> không gọi gì', async () => {
    for (const che of ['off', 'log', 'enforce']) {
        for (const g of [0, -5, NaN, undefined]) {
            dung({ che, rpc: OK(1, 1, 1) });
            const kq = await ghiLuongChuDong('u1', g, 'work');
            assert.strictEqual(goi.rpc.length + goi.add.length, 0, `${che}/${g}`);
            assert.strictEqual(kq.daGhi, false);
        }
    }
});

// ---------------- nhanThuNhapChuDong với client giả ----------------
const clientTra = (res) => ({ rpc: async () => res });
const clientNem = (err) => ({ rpc: async () => { throw err; } });
const chay = (client, mode = 'enforce') => db.nhanThuNhapChuDong('u1', 3250, 'work', { client, mode });
const loi = (code) => { const e = { message: 'm' }; if (code !== undefined) e.code = code; return e; };

test('helper: error có mã Postgres/PostgREST -> loai rollback', async () => {
    for (const code of ['P0001', '22023', 'PGRST301', '23505', '42883']) {
        const r = await chay(clientTra({ data: null, error: loi(code) }));
        assert.strictEqual(r.ok, false, code);
        assert.strictEqual(r.loai, 'rollback', code);
    }
});

test('helper: error không mã / EPIPE / ECONNRESET / ném / AbortError -> khong_ro', async () => {
    const ca = [
        clientTra({ data: null, error: loi() }),
        clientTra({ data: null, error: loi('EPIPE') }),
        clientTra({ data: null, error: loi('ECONNRESET') }),
        clientNem(new Error('boom')),
        clientNem(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    ];
    for (const [i, c] of ca.entries()) {
        const r = await chay(c);
        assert.strictEqual(r.ok, false, `ca ${i}`);
        assert.strictEqual(r.loai, 'khong_ro', `ca ${i}`);
    }
});

test('helper: data là mảng 1 dòng hoặc object đều đọc được', async () => {
    const row = { net: 3250, net_tinh: 3250, tong_truoc: 0, tong_sau: 3250 };
    for (const data of [[row], row]) {
        const r = await chay(clientTra({ data, error: null }));
        assert.deepStrictEqual(r, { ok: true, net: 3250, netTinh: 3250, tongTruoc: 0, tongSau: 3250 });
    }
});

test('helper: payload lạ (rỗng, thiếu trường, net âm, không phải số) -> khong_ro', async () => {
    const xau = [null, [], {}, { net: 'abc', net_tinh: 1, tong_sau: 1 }, { net: -5, net_tinh: 1, tong_sau: 1 }, { net: 1, tong_sau: 1 }];
    for (const data of xau) {
        const r = await chay(clientTra({ data, error: null }));
        assert.strictEqual(r.ok, false, JSON.stringify(data));
        assert.strictEqual(r.loai, 'khong_ro', JSON.stringify(data));
    }
});

test('helper: chế độ lạ -> gửi p_mode=enforce lên RPC + console.error đúng MỘT lần', async () => {
    db._band.datLaiBaoBandMode();
    const guiLen = [];
    const client = {
        rpc: async (ten, args) => {
            guiLen.push([ten, args]);
            return { data: [{ net: 1, net_tinh: 1, tong_truoc: 0, tong_sau: 1 }], error: null };
        },
    };
    nhatKy = { log: [], warn: [], error: [] };
    console.error = (...a) => nhatKy.error.push(a.join(' '));
    await db.nhanThuNhapChuDong('u1', 10, 'work', { client, mode: 'xyz' });
    await db.nhanThuNhapChuDong('u1', 10, 'work', { client, mode: 'xyz' });
    assert.strictEqual(guiLen.length, 2);
    assert.strictEqual(guiLen[0][0], 'nhan_thu_nhap_chu_dong');
    assert.strictEqual(guiLen[0][1].p_mode, 'enforce');
    assert.strictEqual(guiLen[1][1].p_mode, 'enforce');
    assert.strictEqual(nhatKy.error.filter((s) => s.includes('[BAND]')).length, 1);
    db._band.datLaiBaoBandMode();
});

test("helper: mode 'off' lỡ truyền vào -> gửi 'log' (không bao giờ gửi 'off' lên RPC)", async () => {
    let pMode;
    const client = {
        rpc: async (_t, a) => {
            pMode = a.p_mode;
            return { data: [{ net: 1, net_tinh: 1, tong_truoc: 0, tong_sau: 1 }], error: null };
        },
    };
    await db.nhanThuNhapChuDong('u1', 10, 'work', { client, mode: 'off' });
    assert.strictEqual(pMode, 'log');
});

test("layBandMode: 'xyz' -> 'enforce'; giá trị hợp lệ giữ nguyên", () => {
    db._band.datLaiBaoBandMode();
    console.error = () => {};
    assert.strictEqual(db.layBandMode('xyz'), 'enforce');
    assert.strictEqual(db.layBandMode(null), 'enforce');
    for (const m of ['off', 'log', 'enforce']) assert.strictEqual(db.layBandMode(m), m);
    db._band.datLaiBaoBandMode();
});

test('phanLoaiLoiRpc: bảng mã', () => {
    const { phanLoaiLoiRpc: p } = db._band;
    assert.strictEqual(p({ code: 'P0001' }), 'rollback');
    assert.strictEqual(p({ code: 'PGRST202' }), 'rollback');
    assert.strictEqual(p({ code: 'EPIPE' }), 'khong_ro');
    assert.strictEqual(p({ code: 'ECONNRESET' }), 'khong_ro');
    assert.strictEqual(p({}), 'khong_ro');
    assert.strictEqual(p(null), 'khong_ro');
});

test('config: BAND_ERR_CAP <= 400 (dự phòng không bao giờ nhỉnh hơn sàn dải)', () => {
    assert.ok(config.WORK.BAND_ERR_CAP <= 400);
});

// Review bảo mật 16/11: lỗi có thể xảy ra SAU khi COMMIT mà mất ack phải là 'khong_ro' — coi nhầm là
// 'rollback' thì chế độ log trả đủ gross lần hai. Lỗi xảy ra TRƯỚC khi chạy vẫn là 'rollback'.
test('phanLoaiLoiRpc: mất kết nối/tắt server -> khong_ro; lỗi trước khi chạy -> rollback', () => {
    const p = (code) => db._band.phanLoaiLoiRpc({ code });
    for (const c of ['PGRST000', 'PGRST001', '08006', '08003', '53300', '57P01', '57014', '58030', 'XX000', 'EPIPE', ''])
        assert.strictEqual(p(c), 'khong_ro', c);
    for (const c of ['PGRST002', 'PGRST202', 'PGRST301', 'P0001', '22023', '42883', '23514'])
        assert.strictEqual(p(c), 'rollback', c);
});
