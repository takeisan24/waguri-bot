// ============================================================
// test/web_leaderboard.test.js — route bảng xếp hạng web không được truy vấn cột ma,
// và không được nuốt lỗi.
//
// VÌ SAO CÓ: kiểm kê tầng web ngày 2026-08-23 tìm ra `/api/leaderboard?type=bakery` LUÔN
// trả rỗng. Gốc rễ là hai lỗi chồng lên nhau, và chính cái thứ hai làm cái thứ nhất tàng hình:
//
//   1. Route truy vấn thẳng `.from("bakeries").select("user_id, bakery_score, ...")` và
//      `.order("bakery_score")`. Bảng `bakeries` KHÔNG có cột đó — điểm số được TÍNH trong
//      hàm `get_bakery_leaderboard` (level*1000 + likes*50 + nhân viên*100). PostgREST trả
//      "column bakeries.bakery_score does not exist".
//   2. Mã viết `const { data } = await admin...` — chỉ lấy `data`, BỎ `error`. Nên lỗi biến
//      mất, `data` là null, `if (data && data.length)` không chạy, và kết quả là một danh
//      sách rỗng trông y như "chưa ai mở tiệm".
//
// Kèm một lỗ riêng tư: truy vấn thẳng không lọc `profile_public`, trong khi hai bảng xếp
// hạng kia lọc từ lâu. Người ẩn hồ sơ sẽ lộ kèm nguyên user_id.
//
// Cổng này soi MÃ NGUỒN route (không gọi mạng), vì đây là lớp lỗi chỉ hiện ra khi có dữ liệu
// thật — mà lúc phát hiện thì bảng `bakeries` đang rỗng, nên chạy thử cũng không thấy gì.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const F = path.join(__dirname, '..', 'web', 'src', 'app', 'api', 'leaderboard', 'route.ts');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(F, 'utf8'));

/** Cột THẬT của mỗi bảng, chép từ information_schema ngày 2026-08-23. */
const COT_THAT = {
    bakeries: ['user_id', 'level', 'stock', 'cake_progress', 'staff', 'decor',
        'last_collect_at', 'opened_at', 'likes_count'],
    users: ['user_id', 'wallet', 'bank', 'exp', 'username', 'avatar', 'profile_public',
        'exclude_from_economy', 'premium_until', 'prestige', 'level'],
};

test('route không select/order theo cột KHÔNG TỒN TẠI', () => {
    const s = src();
    const loi = [];

    // Bắt mọi cụm .from("bang") ... .select("a, b, c") đi liền nhau
    for (const m of s.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)([\s\S]{0,400}?)(?=\.from\(|$)/g)) {
        const bang = m[1];
        const than = m[2];
        const cotThat = COT_THAT[bang];
        if (!cotThat) continue; // bảng chưa có trong bảng tra — bỏ qua, không đoán

        const sel = than.match(/\.select\(\s*["'`]([^"'`]+)["'`]/);
        if (sel) {
            for (const c of sel[1].split(',').map(x => x.trim()).filter(Boolean)) {
                const ten = c.replace(/\(.*/, '').trim();
                if (ten && ten !== '*' && !cotThat.includes(ten)) loi.push(`${bang}.select("${ten}") — cột không tồn tại`);
            }
        }
        for (const o of than.matchAll(/\.order\(\s*["'`](\w+)["'`]/g)) {
            if (!cotThat.includes(o[1])) loi.push(`${bang}.order("${o[1]}") — cột không tồn tại`);
        }
    }

    assert.deepStrictEqual([...new Set(loi)], [],
        'Truy vấn cột ma. PostgREST trả lỗi, và nếu mã bỏ `error` thì kết quả là danh sách '
        + 'RỖNG trông y như "chưa có dữ liệu" — hỏng im lặng, không ai biết.');
});

test('mọi truy vấn trong route đều ĐỌC và DÙNG `error`, không nuốt', () => {
    const s = src();

    // (a) Không được bỏ hẳn `error` khi tách kết quả.
    const chiLayData = [...s.matchAll(/const\s*\{\s*data(?:\s*:\s*\w+)?\s*\}\s*=\s*await\s+admin/g)];
    assert.strictEqual(chiLayData.length, 0,
        `${chiLayData.length} truy vấn chỉ lấy \`data\` mà bỏ \`error\`. Đây chính là thứ đã làm `
        + 'lỗi "cột không tồn tại" tàng hình suốt.');

    // (b) Tách ra rồi thì phải THẬT SỰ DÙNG.
    //
    // Bản đầu của test này chỉ kiểm (a), nên xoá dòng `console.error` mà vẫn để
    // `{ data, error }` là lọt — tức nó đóng dấu khống. Đo lại ngày 2026-08-23 mới lộ.
    const soTruyVan = [...s.matchAll(/await\s+admin/g)].length;
    assert.ok(soTruyVan >= 3, `Chỉ thấy ${soTruyVan} truy vấn — cấu trúc route đã đổi, test cần cập nhật.`);

    // Đếm thay vì dò theo cửa sổ ký tự.
    //
    // Bản trước dò trong ~700 ký tự sau mỗi truy vấn, và nó bắt nhầm chữ `error` của NHÁNH
    // KHÁC nằm ngay bên dưới — nên xoá dòng canh lỗi ở nhánh level vẫn xanh. Đếm thì không
    // đánh lừa được: mỗi truy vấn phải có đúng một chốt canh của riêng nó.
    const soCanhLoi = [...s.matchAll(/if\s*\(\s*!?\s*(?:error|\w*[eE]rr)\b/g)].length;
    assert.ok(soCanhLoi >= soTruyVan,
        `${soTruyVan} truy vấn nhưng chỉ ${soCanhLoi} chốt canh lỗi. Tách \`error\` ra rồi bỏ đó `
        + 'không dùng thì y hệt như nuốt: truy vấn hỏng vẫn cho ra danh sách rỗng, trông như '
        + '"chưa có dữ liệu". Mỗi truy vấn cần một `if (error)` hoặc `if (!error && ...)`.');
});

test('bảng xếp hạng tiệm bánh dùng RPC (có lọc riêng tư) chứ không truy vấn thẳng', () => {
    const s = src();
    const khoiBakery = s.slice(s.indexOf('type === "bakery"'), s.indexOf('} else if'));
    assert.ok(khoiBakery.length > 20, 'Không tách được nhánh bakery — test cần cập nhật.');

    assert.match(khoiBakery, /admin\.rpc\(\s*["'`]get_bakery_leaderboard["'`]/,
        'Nhánh tiệm bánh phải gọi RPC `get_bakery_leaderboard`. Truy vấn thẳng bảng thì '
        + 'KHÔNG lọc profile_public, nên người đã chọn ẩn hồ sơ vẫn lộ kèm nguyên user_id — '
        + 'trong khi hai bảng xếp hạng kia đã lọc từ lâu.');
    assert.ok(!/\.from\(\s*["'`]bakeries["'`]/.test(khoiBakery),
        'Nhánh tiệm bánh vẫn truy vấn thẳng bảng `bakeries`.');
});

test('hai nhánh còn lại vẫn lọc hồ sơ ẩn và tài khoản vận hành', () => {
    const s = src();
    for (const [ten, moc] of [['level', 'type === "level"'], ['wealth', 'Wealth']]) {
        const i = s.indexOf(moc);
        if (i === -1) continue;
        const khoi = s.slice(i, i + 900);
        if (!/\.from\(\s*["'`]users["'`]/.test(khoi)) continue; // nhánh này chỉ dùng RPC -> ok
        assert.match(khoi, /profile_public/,
            `Nhánh ${ten} truy vấn thẳng bảng users mà không lọc profile_public.`);
        assert.match(khoi, /exclude_from_economy/,
            `Nhánh ${ten} không loại tài khoản vận hành (0099).`);
    }
});

test('tham số vào route được chặn biên, không tin người gọi', () => {
    const s = src();
    assert.match(s, /Math\.min\(Math\.max\(/,
        '`limit` phải bị kẹp biên — không kẹp thì ai đó xin limit=100000 là quét sạch bảng.');
    assert.match(s, /\/\^\\d\{[\d,]+\}\$\//,
        '`guild` phải được kiểm bằng regex chỉ nhận chữ số.');
});
