// test/db_gates.test.js — Gác CHÍNH CÁC GATE soi DB.
//
// Các gate này chạy bằng `check-db-drift.js` và cần khoá DB thật, nên không chạy được trong
// `npm test`. Nhưng phần CẤU TRÚC thì kiểm tĩnh được: nhánh có tồn tại trong vân tay không,
// gate có ĐỌC nhánh đó không, quyền có bị khoá đúng không.
//
// Vì sao cần: nhánh vân tay mà không ai đọc thì là mã chết — đúng lỗi đã xảy ra với hai khoá
// lore `thi_cu`/`tsumugi` nằm im trong JSON mà findMatchingLore() không bao giờ chạm tới.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const THU_MUC = path.join(__dirname, '..', 'supabase', 'migrations');
const driftSrc = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'check-db-drift.js'), 'utf8');
const snapshot = require('../supabase/schema-snapshot.json');

// Mỗi nhánh "danh sách vi phạm" trong vân tay schema. Tất cả PHẢI rỗng trên DB lành mạnh.
const NHANH_VI_PHAM = [
    'bang_chua_bat_rls',
    'definer_khong_ghim_search_path',
    'rang_buoc_trung',
    'ham_goi_bang_khong_ton_tai',
    'ham_ghi_cot_khong_ton_tai',
];

test('vân tay: mọi nhánh vi phạm đều có trong ảnh chụp và ĐANG RỖNG', () => {
    for (const nhanh of NHANH_VI_PHAM) {
        assert.ok(Array.isArray(snapshot[nhanh]),
            `Ảnh chụp thiếu nhánh ${nhanh} — chạy lại npm run db:snapshot sau khi áp migration`);
        assert.deepStrictEqual(snapshot[nhanh], [],
            `DB prod đang có vi phạm ở ${nhanh}: ${JSON.stringify(snapshot[nhanh])}`);
    }
});

test('vân tay: mọi nhánh vi phạm đều ĐƯỢC ĐỌC bởi check-db-drift', () => {
    const khongDoc = NHANH_VI_PHAM.filter(n => !driftSrc.includes(n));
    assert.deepStrictEqual(khongDoc, [],
        'Nhánh có trong vân tay nhưng KHÔNG gate nào đọc -> mã chết, vi phạm sẽ trôi qua: '
        + khongDoc.join(', '));
});

test('vân tay: gate bắt tuyệt đối trên CẢ test lẫn ảnh chụp prod', () => {
    // So hai chiều không đủ: một vi phạm có ở CẢ hai DB thì hai bên vẫn "khớp" nhau.
    // Đó chính là cách `inventory` giữ hai ràng buộc UNIQUE trùng suốt gần hai năm.
    assert.ok(/\[\['test', test\], \['ảnh chụp prod', chuan\]\]/.test(driftSrc),
        'Gate phải duyệt CẢ hai nguồn, không chỉ DB test');
});

test('migration 0127: gate cột có phạm vi và quyền đúng', () => {
    const file = fs.readdirSync(THU_MUC).find(f => f.includes('orphan_column_refs'));
    assert.ok(file, 'Thiếu migration gate cột');
    const sql = fs.readFileSync(path.join(THU_MUC, file), 'utf8');

    assert.ok(/cot_update/.test(sql) && /cot_insert/.test(sql),
        'Phải soi cả hai khuôn ghi: UPDATE ... SET và INSERT INTO');
    assert.ok(/to_regclass\('public\.' \|\| c\.bang\) IS NOT NULL/.test(sql),
        'Phải bỏ qua bảng không tồn tại — đã có nhánh ham_goi_bang_khong_ton_tai lo phần đó');
    assert.ok(/revoke all on function public\.schema_fingerprint\(\) from public, anon, authenticated/i.test(sql),
        'schema_fingerprint lộ cấu trúc toàn hệ thống — phải REVOKE khỏi anon/authenticated');
    assert.ok(/set search_path/i.test(sql), 'SECURITY DEFINER phải ghim search_path');
});

test('migration 0126: xoá hàm lottery chết nhưng GIỮ hai bảng', () => {
    const file = fs.readdirSync(THU_MUC).find(f => f.includes('dead_lottery'));
    assert.ok(file, 'Thiếu migration dọn lottery');
    const sql = fs.readFileSync(path.join(THU_MUC, file), 'utf8');

    assert.ok(/drop function if exists public\.lottery_/.test(sql), 'Phải drop hàm lottery');
    assert.ok(!/drop table[^\n]*lottery/i.test(sql),
        'KHÔNG được drop bảng lottery — delete_user_data (xoá dữ liệu GDPR) và resetUser() còn tham chiếu');
    assert.ok(/PHAI con nguyen|PHẢI còn nguyên/.test(sql),
        'Phải có chốt khẳng định hai bảng còn nguyên sau khi chạy');

    // Code phía bot vẫn phải giữ tham chiếu bảng — nếu ai xoá nốt là xoá dữ liệu người dùng hụt.
    const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'database.js'), 'utf8');
    assert.ok(/\['lottery_tickets', 'user_id'\]/.test(dbSrc),
        'resetUser() phải còn xoá lottery_tickets — bảng vẫn tồn tại');
});
