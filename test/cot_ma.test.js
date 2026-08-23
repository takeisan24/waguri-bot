// ============================================================
// test/cot_ma.test.js — không truy vấn cột KHÔNG TỒN TẠI, ở bất kỳ đâu trong codebase.
//
// VÌ SAO CÓ: ngày 2026-08-23 tìm ra `/api/leaderboard?type=bakery` LUÔN rỗng vì select cột
// `bakeries.bakery_score` — cột không có thật (điểm số được TÍNH trong RPC). Vá xong mới
// phát hiện **bản sao y hệt** ở `leaderboard/page.tsx`: cùng truy vấn sai chép ra hai nơi,
// vá một chỗ là còn nguyên chỗ kia. Và quét rộng ra còn tìm thêm `items.emoji` ở trang
// battle pass, khiến trang đó hiện MÃ vật phẩm thô thay vì tên đẹp.
//
// Lớp lỗi này nguy hiểm vì nó KHÔNG làm sập gì cả:
//   · PostgREST trả lỗi thay vì dữ liệu
//   · mã thường viết `const { data } = await ...` nên lỗi bị nuốt
//   · kết quả là danh sách RỖNG, trông y hệt "chưa có ai dùng tính năng này"
//
// Không có cách nào phân biệt "hỏng" với "chưa có dữ liệu" từ bên ngoài. Chỉ cổng này thấy.
//
// Đối chiếu với `supabase/schema-snapshot.json` — ảnh chụp schema THẬT của prod, được sinh
// lại bằng `npm run db:snapshot` mỗi khi áp migration.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase', 'schema-snapshot.json'), 'utf8'));

const COT = {};
for (const [bang, ds] of Object.entries(snap.tables)) {
    COT[bang] = new Set(ds.map(x => String(x).split(':')[0]));
}

function duyet(d, o = []) {
    if (!fs.existsSync(d)) return o;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) duyet(p, o); else if (/\.(js|ts|tsx)$/.test(e.name)) o.push(p);
    }
    return o;
}
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('không select/order/lọc theo cột không tồn tại', () => {
    assert.ok(Object.keys(COT).length > 30, 'Ảnh chụp schema đọc không ra — chạy `npm run db:snapshot`.');

    const files = duyet(path.join(ROOT, 'src')).concat(duyet(path.join(ROOT, 'web', 'src')));
    assert.ok(files.length > 100, `Chỉ quét được ${files.length} file — đường dẫn đã đổi?`);

    const loi = [];
    for (const f of files) {
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        const ten = path.relative(ROOT, f).replace(/\\/g, '/');

        // Điểm dừng là dấu `;` — kết thúc câu lệnh, luôn nằm ngay cuối chuỗi truy vấn.
        //
        // Bản đầu dừng ở `.from(` kế tiếp hoặc dòng trống, với trần 600 ký tự. Đo ra mới thấy
        // nó hỏng nặng: ở leaderboard/page.tsx, `.from(` kế cách 628 ký tự và không có dòng
        // trống ở giữa, nên regex KHÔNG khớp gì cả và bỏ qua khối đó IM LẶNG — 3 trong 4 truy
        // vấn của file chưa từng được quét. Một cổng bỏ sót âm thầm còn tệ hơn không có cổng,
        // vì nó tạo cảm giác đã kiểm rồi.
        for (const m of s.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)([\s\S]{0,1500}?)(?=;|\.from\(|$)/g)) {
            const bang = m[1], than = m[2];
            const cot = COT[bang];
            if (!cot) continue; // bảng không có trong ảnh chụp -> không đoán

            const sel = than.match(/\.select\(\s*["'`]([^"'`]*)["'`]/);
            if (sel && sel[1].trim() && sel[1].trim() !== '*') {
                // Cú pháp QUAN HỆ của PostgREST: `items(name, type, price)` nghĩa là join sang
                // bảng `items` rồi lấy các cột ĐÓ. Bản đầu của test này tách theo dấu phẩy nên
                // hiểu `type` là cột của bảng gốc và báo oan `src/database.js`.
                // Cách chữa: cắt sạch mọi cụm `ten(...)` trước khi tách.
                const phang = sel[1].replace(/\w+\s*\([^)]*\)/g, '');
                for (const c of phang.split(',')) {
                    const t = c.trim().split(':')[0].trim();
                    if (!t || t === '*' || t.includes('(') || t.includes(')')) continue;
                    if (!cot.has(t)) loi.push(`${ten}  ${bang}.select("${t}")`);
                }
            }
            for (const o of than.matchAll(/\.(order|eq|neq|gt|gte|lt|lte|ilike|like)\(\s*["'`](\w+)["'`]/g)) {
                if (!cot.has(o[2])) loi.push(`${ten}  ${bang}.${o[1]}("${o[2]}")`);
            }
        }
    }

    assert.deepStrictEqual([...new Set(loi)], [],
        'Truy vấn cột không tồn tại. PostgREST trả LỖI thay vì dữ liệu, và nếu mã nuốt `error` '
        + 'thì kết quả là danh sách rỗng trông y hệt "chưa có dữ liệu" — hỏng im lặng, không ai '
        + 'biết. Đối chiếu cột thật trong supabase/schema-snapshot.json.');
});

test('cú pháp quan hệ PostgREST không bị báo oan', () => {
    // Chốt lại phép chữa ở trên bằng một ca thật đang có trong mã:
    // `src/database.js:575` viết `.select('quantity, item_id, items(name, type, price)')`.
    // `type` là cột của `items`, KHÔNG phải của `inventory`. Bản đầu của test báo oan chỗ này.
    const s = "inventory'\n.select('quantity, item_id, items(name, type, price)')";
    const sel = s.match(/\.select\(\s*["'`]([^"'`]*)["'`]/);
    const phang = sel[1].replace(/\w+\s*\([^)]*\)/g, '');
    const cot = phang.split(',').map(x => x.trim().split(':')[0].trim()).filter(x => x && !x.includes('(') && !x.includes(')'));
    assert.deepStrictEqual(cot, ['quantity', 'item_id'],
        'Phép cắt cụm quan hệ hỏng — sẽ báo oan mọi truy vấn có join.');
});
