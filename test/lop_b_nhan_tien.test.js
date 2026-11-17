// ============================================================
// test/lop_b_nhan_tien.test.js — vá 3 lỗ ngoài spec của PR #7 (spec-3-lo-ngoai-spec-2026-11-16).
//  (1) db.addMoneyLopB: nhánh trả/lỗi, KHÔNG gọi lại RPC khi không rõ (S1 #5-#8).
//  (2) crate.js / plant.js: nhãn nguồn TƯỜNG MINH, không còn addMoney dương suy nhãn từ tên tệp (S1 #11),
//      embed theo số thực nhận (S1 #24).
//  (3) 0166: thứ tự gọi trần trước UPDATE users, nguồn chỉ crate/plant, whitelist có bakery_order (S1 #10, #14).
//  (4) 0167 + lui: DROP đúng chữ ký, không còn chỗ gọi bakery_collect cũ.
// Thuần: client giả `.rpc()`, đọc mã nguồn. KHÔNG gọi DB thật.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const db = require('../src/database');

const ROOT = path.join(__dirname, '..');
const doc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const boCmtSql = s => s.replace(/--.*$/gm, '');

function client(ketQua) {
    const goi = [];
    return { goi, rpc: async (ten, args) => { goi.push([ten, args]); return typeof ketQua === 'function' ? ketQua() : ketQua; } };
}

// ---------- (1) addMoneyLopB ----------
test('addMoneyLopB: ok trả net (đã kẹp), gọi đúng 1 RPC với nhãn tường minh', async () => {
    const c = client({ data: 1000, error: null });
    const r = await db.addMoneyLopB('u1', 5000, 'crate', { client: c });
    assert.deepStrictEqual(r, { ok: true, net: 1000 });
    assert.strictEqual(c.goi.length, 1);
    assert.deepStrictEqual(c.goi[0], ['nhan_tien_lop_b', { p_user_id: 'u1', p_amount: 5000, p_source: 'crate' }]);
});

test('addMoneyLopB: net = 0 vẫn là ok (trần đã đầy)', async () => {
    const r = await db.addMoneyLopB('u1', 5000, 'plant', { client: client({ data: 0, error: null }) });
    assert.deepStrictEqual(r, { ok: true, net: 0 });
});

test('addMoneyLopB: thân lạ (null / > amount / không phải số) -> khong_ro, không ném', async () => {
    for (const data of [null, undefined, 9999, -1, 'x']) {
        const r = await db.addMoneyLopB('u1', 5000, 'crate', { client: client({ data, error: null }) });
        assert.strictEqual(r.ok, false, `data=${data}`);
        assert.strictEqual(r.loai, 'khong_ro');
    }
});

test('addMoneyLopB: lỗi RPC / lỗi mạng -> ok:false, đúng 1 lần gọi (không gọi lại, tránh trả đúp)', async () => {
    const c1 = client({ data: null, error: { code: 'PGRST000', message: 'conn' } });
    const r1 = await db.addMoneyLopB('u1', 5000, 'crate', { client: c1 });
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.loai, 'khong_ro');
    assert.strictEqual(c1.goi.length, 1);

    const c2 = client(() => { throw new Error('mang chet'); });
    const r2 = await db.addMoneyLopB('u1', 5000, 'plant', { client: c2 });
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.loai, 'khong_ro');
    assert.strictEqual(c2.goi.length, 1);
});

// ---------- (2) crate / plant ----------
test('crate.js và lib/plant.js: thưởng dương khai nguồn tường minh, không addMoney dương trần', () => {
    const crate = boCmt(doc('src', 'commands', 'games', 'crate.js'));
    const plant = boCmt(doc('src', 'lib', 'plant.js'));
    assert.match(crate, /db\.addMoneyLopB\(userId, amt, 'crate'\)/);
    assert.match(plant, /db\.addMoneyLopB\(nguoiNhan, reward, 'plant'\)/);
    // addMoney còn lại ở hai tệp chỉ được TRỪ (đối số số tiền bắt đầu bằng dấu trừ).
    for (const [ten, s] of [['crate.js', crate], ['plant.js', plant]]) {
        for (const m of s.matchAll(/db\.addMoney\(([^)]*)\)/g)) {
            assert.match(m[1], /,\s*-/, `${ten}: addMoney dương không khai nguồn: db.addMoney(${m[1]})`);
        }
    }
});

test('crate.js / plant.js: embed theo số thực nhận, khung jackpot theo net', () => {
    const crate = boCmt(doc('src', 'commands', 'games', 'crate.js'));
    const plant = boCmt(doc('src', 'lib', 'plant.js'));
    assert.match(crate, /ketQuaTien\.net === 0\) type = 'warning'/);
    assert.match(plant, /const noHu = daTra && thucNhan >= 5000;/);
    assert.match(plant, /reward: fmt\(thucNhan, locale\)/);
});

test('locale: có đủ vi + en cho chuỗi bị-kẹp', () => {
    for (const l of ['vi', 'en']) {
        const j = require(`../src/locales/${l}.json`);
        assert.ok(j.commands.crate.cap_hit, `${l}: thiếu commands.crate.cap_hit`);
        assert.ok(j.plant.box_cap_hit, `${l}: thiếu plant.box_cap_hit`);
        assert.ok(j.plant.box_cap_hit_gift, `${l}: thiếu plant.box_cap_hit_gift`);
    }
});

// ---------- (3) 0166 ----------
test('0166: whitelist 8 nguồn có bakery_order; nhan_tien_lop_b chỉ nhận crate/plant', () => {
    const sql = boCmtSql(doc('supabase', 'migrations', '0166_lop_b_nhan_tien_va_don_vip.sql'));
    assert.match(sql, /'plant', 'bakery_collect_v2', 'bakery_order'\)/);
    assert.match(sql, /p_source not in \('crate', 'plant'\)/);
    assert.match(sql, /errcode = '22023'/);
    // Không phụ thuộc has_function_privilege kiểu mặc định: thu quyền cả public.
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.nhan_tien_lop_b\(text, bigint, text\) FROM public, anon, authenticated/);
    assert.match(sql, /GRANT\s+EXECUTE ON FUNCTION public\.nhan_tien_lop_b\(text, bigint, text\) TO service_role/);
});

test('0166: nhánh v_ghi <= 0 trả sớm, cờ chỉ đặt ngay trước increment_balance và xoá ngay sau', () => {
    const sql = boCmtSql(doc('supabase', 'migrations', '0166_lop_b_nhan_tien_va_don_vip.sql'));
    const i = sql.indexOf('FUNCTION public.nhan_tien_lop_b');
    const f = sql.slice(i, sql.indexOf('$function$;', sql.indexOf('$function$', i) + 10));
    const iSom = f.indexOf('if v_ghi <= 0');
    const iCo = f.indexOf("set_config('app.lop_b_da_ap', '1', true)");
    const iIb = f.indexOf('increment_balance(');
    const iXoa = f.indexOf("set_config('app.lop_b_da_ap', '', true)");
    assert.ok(iSom > -1 && iSom < iCo && iCo < iIb && iIb < iXoa, 'thứ tự: trả sớm -> đặt cờ -> ghi ví -> xoá cờ');
});

test('0166: deliver_bakery_order gọi ap_tran_lop_b TRƯỚC UPDATE users, giữ SECURITY DEFINER', () => {
    const sql = boCmtSql(doc('supabase', 'migrations', '0166_lop_b_nhan_tien_va_don_vip.sql'));
    const i = sql.indexOf('FUNCTION public.deliver_bakery_order');
    const f = sql.slice(i, sql.indexOf('REVOKE EXECUTE ON FUNCTION public.deliver_bakery_order', i));
    const iTran = f.indexOf("ap_tran_lop_b(p_user_id, p_reward_coins, 'bakery_order')");
    const iUsers = f.indexOf('UPDATE public.users');
    assert.ok(iTran > -1, 'thiếu lời gọi trần');
    assert.ok(iTran < iUsers, 'ap_tran_lop_b phải đứng TRƯỚC UPDATE public.users (thứ tự khoá, chống deadlock)');
    assert.match(f, /SECURITY DEFINER/);
    assert.match(f, /wallet = wallet \+ v_coins/);
    assert.doesNotMatch(f, /wallet = wallet \+ p_reward_coins/, 'không được cộng số chưa kẹp');
    assert.match(f, /'capped'/);
});

// ---------- (4) 0167 + lui ----------
test('0167: DROP đúng chữ ký bakery_collect cũ; mã không còn gọi nó', () => {
    const sql = boCmtSql(doc('supabase', 'migrations', '0167_xoa_bakery_collect_cu.sql'));
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.bakery_collect\(text, integer, bigint, bigint\);/);
    assert.strictEqual(typeof db.bakeryCollect, 'undefined', 'wrapper JS bakeryCollect phải được gỡ');
    assert.strictEqual(typeof db.bakeryCollectV2, 'function', 'v2 vẫn phải còn');
    const dbSrc = boCmt(doc('src', 'database.js'));
    assert.doesNotMatch(dbSrc, /rpc\('bakery_collect'/);
});

test('lui_0167 thu cả PUBLIC; lui_0166 ghi đúng thứ tự lùi', () => {
    const l7 = doc('supabase', 'rollback', 'lui_0167_bakery_collect_cu.sql');
    assert.match(l7, /REVOKE EXECUTE ON FUNCTION public\.bakery_collect\(text, integer, bigint, bigint\) FROM public, anon, authenticated;/);
    const l6 = doc('supabase', 'rollback', 'lui_0166_lop_b_nhan_tien.sql');
    assert.match(l6, /lui_0167 -> lui_0166 -> lui_0165/);
    assert.match(l6, /DROP FUNCTION IF EXISTS public\.nhan_tien_lop_b/);
    // ap_tran_lop_b lùi về 7 nguồn (không còn bakery_order).
    assert.doesNotMatch(boCmtSql(l6), /'bakery_order'/);
});
