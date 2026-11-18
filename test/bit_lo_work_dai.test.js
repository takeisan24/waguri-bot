// ============================================================
// Lớp A (bảng dải thu nhập ngày) — kiểm bằng bản mô phỏng đúng SQL 0163 + cổng tĩnh trên file SQL.
// Thuần, KHÔNG DB. Bản chạy thật nằm ở test/bit_lo_work.integration.test.js.
// Spec: docs/spec-bit-lo-work-2026-10-19.md (S1 #8,#9,#12,#24 · S6 "Vắt mốc", "Dải 4", "Đơn điệu").
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { netTinh } = require('./helpers/bangDai');

const ROOT = path.join(__dirname, '..');
const doc = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const n = (truoc, gross) => Number(netTinh(truoc, gross));

test('Dải: ví dụ trong spec cho đúng số (vắt mốc, sàn 400, tỉ lệ 10% trên 1M)', () => {
    assert.strictEqual(n(95000, 20000), 12500, '5.000×1 + 15.000×0,5');
    assert.strictEqual(n(999000, 10000), 500, '1.000×0,1 + min(900,400)');
    assert.strictEqual(n(999500, 2000), 200, '500×0,1 + min(150,400)');
    assert.strictEqual(n(999000, 2000), 200);
    assert.strictEqual(n(1000000, 2000), 200);
    assert.strictEqual(n(1000000, 10000), 400, 'sàn 400');
    // Trên 1M: min(floor(gross × 0,1), 400)
    assert.strictEqual(n(1200000, 7500), 400);
    assert.strictEqual(n(1200000, 3250), 325);
    assert.strictEqual(n(1200000, 77), 7);
});

test('Dải: tổng < 100.000 nhận đủ gross; dải 2 nhận một nửa (INV happy path / S1 #26)', () => {
    assert.strictEqual(n(0, 3250), 3250);
    assert.strictEqual(n(50000, 40000), 40000);
    assert.strictEqual(n(150000, 4000), 2000);
    assert.strictEqual(n(400000, 10000), 1000);
});

const GROSS = [77, 400, 2000, 4000, 10000, 180000];

test('INV-10: quét count 0 -> 1.200.000 bước 500, cùng gross thì net không bao giờ tăng', () => {
    for (const g of GROSS) {
        let truoc = Infinity;
        for (let c = 0; c <= 1200000; c += 500) {
            const v = n(c, g);
            assert.ok(v <= truoc, `gross=${g} count=${c}: net ${v} > ${truoc} của count liền trước`);
            truoc = v;
        }
    }
});

test('INV-10: quét từng xu trong ±2.000 quanh 100.000 / 300.000 / 1.000.000, net không tăng', () => {
    for (const moc of [100000, 300000, 1000000]) {
        for (const g of GROSS) {
            let truoc = Infinity;
            for (let c = moc - 2000; c <= moc + 2000; c += 1) {
                const v = n(c, g);
                assert.ok(v <= truoc, `moc=${moc} gross=${g} count=${c}: net ${v} > ${truoc}`);
                truoc = v;
            }
        }
    }
});

test('INV-8: net không bao giờ vượt gross (mọi count, mọi gross trong bộ mẫu)', () => {
    for (const g of GROSS) {
        for (let c = 0; c <= 1300000; c += 250) {
            assert.ok(n(c, g) <= g, `gross=${g} count=${c}`);
        }
        for (const moc of [100000, 300000, 1000000]) {
            for (let c = moc - 2000; c <= moc + 2000; c++) assert.ok(n(c, g) <= g);
        }
    }
});

test('Dải: floor MỘT lần cho cả lượt (không floor từng khúc) — vắt mốc lẻ không lệch 1 xu', () => {
    // 99.999 + 3: 1×1,0 + 2×0,5 = 2 ; floor từng khúc cũng 2. Chọn ca lẻ: 99.999 + 2 -> 1 + 0,5 = 1,5 -> 1.
    assert.strictEqual(n(99999, 2), 1);
    // 99.999 + 4: 1 + 1,5 = 2,5 -> 2 (floor từng khúc cũng ra 1 + 1 = 2); 99.999 + 6: 1 + 2,5 = 3,5 -> 3.
    assert.strictEqual(n(99999, 6), 3);
    // Khúc 3 lẻ: 299.999 + 12 -> 1×0,5 + 11×0,1 = 1,6 -> 1 (floor từng khúc: 0 + 1 = 1) ; 299.999 + 15 -> 0,5 + 1,4 = 1,9 -> 1
    assert.strictEqual(n(299999, 15), 1);
    // Ca phân biệt được: 0,5 + 0,6 = 1,1 -> 1, nhưng floor từng khúc = 0 + 0 = 0.
    assert.strictEqual(n(299999, 7), 1);
});

// ---------------- Cổng tĩnh trên SQL ----------------
const boCommentSql = (s) => s.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

test('SQL 0163: ngày theo giờ VN, không dùng CURRENT_DATE, SECURITY INVOKER, pin search_path, chỉ service_role', () => {
    const sql = doc('supabase/migrations/0163_thu_nhap_ngay_ap_dai.sql');
    const code = boCommentSql(sql);
    assert.ok(sql.includes('Asia/Ho_Chi_Minh'));
    assert.ok(!/current_date/i.test(code), 'thân hàm không được dùng CURRENT_DATE (UTC -> đổi ngày lúc 07:00 VN)');
    assert.ok(/security\s+invoker/i.test(code) || !/security\s+definer/i.test(code));
    assert.ok(!/security\s+definer/i.test(code));
    assert.ok(/set\s+search_path/i.test(code), 'phải pin search_path');
    assert.ok(/revoke[^;]*\banon\b/i.test(code), 'phải thu quyền anon');
    assert.ok(/grant[^;]*service_role/i.test(code), 'phải cấp cho service_role');
    // Bộ đếm cộng bằng bigint và kẹp int ở cả hai nhánh (S1 #24)
    assert.ok((code.match(/least\s*\(/gi) || []).length >= 2);
    assert.ok(code.includes('2147483647'));
});

test('SQL 0165: sell_item_market vẫn SECURITY DEFINER (không bị hạ quyền nhầm)', () => {
    const sql = doc('supabase/migrations/0165_increment_balance_luoi_an_toan.sql');
    const i = sql.search(/create or replace function public\.sell_item_market/i);
    assert.ok(i >= 0, 'phải định nghĩa lại sell_item_market');
    const j = sql.indexOf('$function$', sql.indexOf('AS $function$', i) + 5);
    const dau = sql.slice(i, sql.indexOf('AS $function$', i));
    assert.ok(/security\s+definer/i.test(dau), 'phần đầu hàm phải có SECURITY DEFINER');
    assert.ok(j > i);
});

test('Rollback 0165: DROP ap_tran_lop_b nằm SAU mọi CREATE OR REPLACE (nếu không hàm bán vẫn gọi hàm đã mất)', () => {
    const sql = boCommentSql(doc('supabase/rollback/lui_0165_lop_b.sql'));
    const drop = sql.search(/drop\s+function\s+if\s+exists\s+public\.ap_tran_lop_b/i);
    assert.ok(drop >= 0, 'phải có DROP ap_tran_lop_b');
    const re = /create or replace function/gi;
    let m; let dem = 0;
    while ((m = re.exec(sql))) { dem++; assert.ok(m.index < drop, `CREATE OR REPLACE #${dem} nằm sau DROP`); }
    assert.ok(dem >= 4, `phải khôi phục đủ các hàm, thấy ${dem}`);
});
