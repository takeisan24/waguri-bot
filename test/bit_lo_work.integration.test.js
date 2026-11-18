require('../src/lib/envLoader');
const test = require('node:test');
const assert = require('node:assert');

// ============================================================
// Tích hợp RPC nhan_thu_nhap_chu_dong (0163) + Lớp B (0165) trên DB TEST.
// AN TOÀN: chỉ chạy với TEST_SUPABASE_* (DB test riêng), không bao giờ đụng prod. Thiếu -> SKIP.
// Spec: docs/spec-bit-lo-work-2026-10-19.md S6 + S1 #1-#3, #6, #7, #12, #22-#25.
// ============================================================
const hasTestDb = process.env.ENABLE_TEST_SUPABASE === 'true' &&
                  process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (hasTestDb) {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
}

if (!hasTestDb) {
    test('Bỏ qua Integration Test bịt lỗ /work — thiếu TEST_SUPABASE_* (không chạy để tránh đụng prod)', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const { netTinh } = require('./helpers/bangDai');

    const U = `test_band_${Math.random().toString(36).slice(2, 10)}`;
    const KHOA = 'thu_nhap_ngay';
    const KHOA_B = 'thu_nhap_lop_b';

    // Ngày VN tính ở JS (UTC+7, không có DST) — cùng cách RPC tính (now() at time zone 'Asia/Ho_Chi_Minh').
    const ngayVn = (lui = 0) => new Date(Date.now() + 7 * 3600e3 - lui * 86400e3).toISOString().slice(0, 10);

    async function datBoDem(count, { khoa = KHOA, lui = 0 } = {}) {
        const { error } = await supabase.from('daily_counters')
            .upsert({ user_id: U, key: khoa, day: ngayVn(lui), count }, { onConflict: 'user_id,key' });
        assert.ifError(error);
    }
    async function docBoDem(khoa = KHOA) {
        const { data } = await supabase.from('daily_counters').select('count, day').eq('user_id', U).eq('key', khoa).maybeSingle();
        return data ? Number(data.count) : null;
    }
    async function viVao() {
        const { data } = await supabase.from('users').select('wallet').eq('user_id', U).single();
        return Number(data.wallet);
    }
    async function datVi(v) { await supabase.from('users').update({ wallet: v }).eq('user_id', U); }
    async function sachDaTao() {
        await supabase.from('economy_ledger').delete().eq('user_id', U);
        await supabase.from('daily_counters').delete().eq('user_id', U);
        await supabase.from('inventory').delete().eq('user_id', U);
    }
    async function dong() {
        const { data } = await supabase.from('economy_ledger').select('*').eq('user_id', U).order('id');
        return data || [];
    }
    const nhan = (gross, source = 'work', mode = 'enforce') => db.nhanThuNhapChuDong(U, gross, source, { mode });

    test.before(async () => {
        await supabase.from('users').delete().eq('user_id', U);
        await sachDaTao();
        const { error } = await supabase.from('users').insert({ user_id: U, wallet: 0, username: 'BandIT' });
        assert.ifError(error);
    });
    test.beforeEach(async () => { await sachDaTao(); await datVi(0); });
    test.after(async () => {
        await sachDaTao();
        await supabase.from('users').delete().eq('user_id', U);
    });

    test('Happy path (enforce): count = gross, ví +net, sổ cái đúng 1 dòng source work = net', async () => {
        const r = await nhan(3250);
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.net, 3250);
        assert.strictEqual(await docBoDem(), 3250);
        assert.strictEqual(await viVao(), 3250);
        const rows = (await dong()).filter((x) => x.source === 'work');
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(Number(rows[0].delta), 3250);
    });

    test("Log mode: count 1.500.000 -> ví +gross, net_tinh = min(floor(gross×0,1), 400)", async () => {
        await datBoDem(1500000);
        for (const g of [3250, 7500, 77]) {
            const truoc = await viVao();
            const r = await nhan(g, 'work', 'log');
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.net, g, 'log: không ai thiệt');
            assert.strictEqual(r.netTinh, Math.min(Math.floor(g * 0.1), 400));
            assert.strictEqual(await viVao() - truoc, g);
        }
    });

    test('Enforce trên 1M: ví tăng đúng min(floor(gross×0,1), 400)', async () => {
        await datBoDem(1200000);
        for (const [g, mong] of [[7500, 400], [3250, 325], [77, 7]]) {
            const truoc = await viVao();
            const r = await nhan(g);
            assert.strictEqual(r.net, mong);
            assert.strictEqual(await viVao() - truoc, mong);
        }
    });

    test('Vắt mốc: count 95.000 + gross 20.000 -> nhận 12.500, count = 115.000', async () => {
        await datBoDem(95000);
        const r = await nhan(20000);
        assert.strictEqual(r.net, 12500);
        assert.strictEqual(r.tongTruoc, 95000);
        assert.strictEqual(await docBoDem(), 115000);
        assert.strictEqual(await viVao(), 12500);
    });

    test('RPC khớp bản mô phỏng ở vài điểm quanh mốc 100k / 300k / 1M', async () => {
        const ca = [[99999, 2], [299999, 7], [999000, 10000], [999500, 2000], [1000000, 2000], [150000, 4000]];
        for (const [c, g] of ca) {
            await datBoDem(c);
            const r = await nhan(g);
            assert.strictEqual(r.net, Number(netTinh(c, g)), `count=${c} gross=${g}`);
        }
    });

    test('Qua ngày VN: day = hôm qua, count 2.000.000 -> nhận đủ, count = gross mới', async () => {
        await datBoDem(2000000, { lui: 1 });
        const r = await nhan(3250);
        assert.strictEqual(r.net, 3250);
        assert.strictEqual(r.tongTruoc, 0);
        assert.strictEqual(await docBoDem(), 3250);
    });

    test('Tham số sai (gross 0, > 10M, nguồn crate) -> ok:false loai rollback, count và ví không đổi', async () => {
        await datBoDem(5000);
        const log = console.error; console.error = () => {};
        try {
            for (const [g, src] of [[0, 'work'], [10000001, 'work'], [3250, 'crate'], [-5, 'gather']]) {
                const r = await nhan(g, src);
                assert.strictEqual(r.ok, false, `${g}/${src}`);
                assert.strictEqual(r.loai, 'rollback', `${g}/${src}`);
            }
        } finally { console.error = log; }
        assert.strictEqual(await docBoDem(), 5000);
        assert.strictEqual(await viVao(), 0);
    });

    test("Tham số sai: p_mode 'off' gọi thẳng RPC -> lỗi 22023, count không đổi", async () => {
        await datBoDem(5000);
        const { error } = await supabase.rpc('nhan_thu_nhap_chu_dong', { p_user_id: U, p_gross: 100, p_source: 'work', p_mode: 'off' });
        assert.ok(error, 'phải lỗi');
        assert.strictEqual(error.code, '22023');
        assert.strictEqual(await docBoDem(), 5000);
    });

    test('RACE: 4 lượt song song gross 30.000 từ count 50.000 -> count 170.000, tổng net = tổng ví tăng = 85.000, không deadlock', async () => {
        await datBoDem(50000);
        const kq = await Promise.all([1, 2, 3, 4].map(() => nhan(30000)));
        assert.ok(kq.every((r) => r.ok), JSON.stringify(kq));
        assert.strictEqual(await docBoDem(), 170000);
        const tongNet = kq.reduce((s, r) => s + r.net, 0);
        // Mọi khúc là bội số của 10.000 nên tổng không phụ thuộc thứ tự.
        const mong = Number(netTinh(50000, 120000));
        assert.strictEqual(mong, 85000);
        assert.strictEqual(tongNet, mong);
        assert.strictEqual(await viVao(), mong);
        const rows = (await dong()).filter((x) => x.source === 'work');
        assert.strictEqual(rows.length, 4);
        assert.strictEqual(rows.reduce((s, x) => s + Number(x.delta), 0), mong);
    });

    test('RACE: lượt ĐẦU TIÊN trong ngày (chưa có hàng) song song 3 lượt -> không đếm thiếu', async () => {
        const kq = await Promise.all([1, 2, 3].map(() => nhan(10000)));
        assert.ok(kq.every((r) => r.ok), JSON.stringify(kq));
        assert.strictEqual(await docBoDem(), 30000);
        assert.strictEqual(await viVao(), 30000);
    });

    // ---------------- Lớp B (0165) — chỉ chạy khi hàm đã áp ----------------
    async function layBDaAp() {
        const { error } = await supabase.rpc('ap_tran_lop_b', { p_user_id: U, p_amount: 0, p_source: 'work' });
        if (!error) return { ap: true };
        const chuaCo = error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message || '');
        return { ap: !chuaCo, ly_do: `ap_tran_lop_b chưa có trên DB test (${error.code}): 0165 chưa được áp` };
    }

    test('Lớp B — work trả số thật: thu_nhap_lop_b = 1.999.900 -> /work gross 3.250 nhận đúng 100, ví +100', async (t) => {
        const b = await layBDaAp();
        if (!b.ap) return t.skip(b.ly_do);
        await datBoDem(1999900, { khoa: KHOA_B });
        await datBoDem(10000);
        const r = await nhan(3250);
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.net, 100);
        assert.strictEqual(await viVao(), 100);
        assert.strictEqual(await docBoDem(KHOA_B), 2000000);
    });

    test('Lớp B — bán đồ bị bắt: thu_nhap_lop_b = 1.999.000 -> sell_item món có giá cao nhận đúng 1.000', async (t) => {
        const b = await layBDaAp();
        if (!b.ap) return t.skip(b.ly_do);
        const { data: mon } = await supabase.from('items').select('id, price').gte('price', 4000).order('price').limit(1);
        assert.ok(mon && mon[0], 'cần ít nhất một vật phẩm giá >= 4.000 trong DB test');
        const gainDay = Math.floor(Number(mon[0].price) * 0.5);
        assert.ok(gainDay > 1000, 'món chọn phải bán được > 1.000 để bị kẹp');
        await datBoDem(1999000, { khoa: KHOA_B });
        await supabase.from('inventory').insert({ user_id: U, item_id: mon[0].id, quantity: 1 });
        const { data, error } = await supabase.rpc('sell_item', { p_user_id: U, p_item_id: mon[0].id, p_quantity: 1 });
        assert.ifError(error);
        assert.strictEqual(data.status, 'ok');
        assert.strictEqual(Number(data.gain), 1000, 'JSON nói đúng số đã kẹp');
        assert.strictEqual(await viVao(), 1000);
        assert.strictEqual(await docBoDem(KHOA_B), 2000000);
    });
}
