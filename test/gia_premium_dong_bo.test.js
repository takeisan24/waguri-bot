// ============================================================
// test/gia_premium_dong_bo.test.js — bảng giá Premium chỉ được có MỘT sự thật.
//
// VÌ SAO CÓ: `create_premium_order(p_user, p_plan, p_months, p_amount)` từng nhận số tháng
// và số tiền DO BÊN GỌI TRUYỀN VÀO mà không kiểm gì. Trong khi bảng giá được chép tay ở HAI
// nơi độc lập, hai ngôn ngữ khác nhau:
//
//     src/config/index.js      PREMIUM.PLANS     (bot Discord)
//     web/src/lib/premium.ts   PREMIUM_PLANS     (web)
//
// Sửa giá một bên rồi quên bên kia là người dùng trả 25.000₫ mà nhận 6 tháng, hoặc trả
// 99.000₫ mà nhận 1 tháng. Đây đúng kiểu sai làm mất uy tín, vì nó xảy ra ĐÚNG LÚC người ta
// vừa đưa tiền — và tiền thì đã chuyển rồi, không rút lại được.
//
// Migration 0133 đưa bảng giá chuẩn vào DB và bắt `create_premium_order` đối chiếu. Cổng này
// gác nốt hai bảng trong MÃ, để chúng không lệch nhau rồi làm mọi đơn bị DB từ chối — lúc đó
// người dùng bấm mua và không mua được gì cả, cũng tệ ngang.
//
// Cổng KHÔNG gọi mạng: đọc bảng DB từ file migration 0133 (nguồn đã commit).
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..');

/** Bảng giá của bot. */
function giaBot() {
    const plans = require('../src/config').PREMIUM.PLANS;
    const ra = {};
    for (const [k, v] of Object.entries(plans)) ra[k] = { months: v.months, amount: v.amount };
    return ra;
}

/** Bảng giá của web — đọc từ TypeScript bằng regex, vì test chạy bằng node thuần. */
function giaWeb() {
    const src = fs.readFileSync(path.join(GOC, 'web', 'src', 'lib', 'premium.ts'), 'utf8');
    const ra = {};
    for (const m of src.matchAll(/^\s*(m\d+)\s*:\s*\{\s*months:\s*(\d+)\s*,\s*amount:\s*(\d+)/gm)) {
        ra[m[1]] = { months: Number(m[2]), amount: Number(m[3]) };
    }
    return ra;
}

/** Bảng giá chuẩn trong DB — đọc từ migration 0133 đã commit. */
function giaDb() {
    const f = path.join(GOC, 'supabase', 'migrations', '0133_premium_plans_canonical.sql');
    const src = fs.readFileSync(f, 'utf8');
    const khoi = src.slice(src.indexOf('INSERT INTO public.premium_plans'));
    const ra = {};
    for (const m of khoi.matchAll(/\('(m\d+)',\s*(\d+),\s*(\d+)\)/g)) {
        ra[m[1]] = { months: Number(m[2]), amount: Number(m[3]) };
    }
    return ra;
}

test('ba bảng giá (bot · web · DB) khớp nhau từng gói', () => {
    const bot = giaBot(), web = giaWeb(), db = giaDb();

    assert.ok(Object.keys(bot).length >= 3, 'Không đọc được bảng giá bot — test cần cập nhật.');
    assert.ok(Object.keys(web).length >= 3, 'Không đọc được bảng giá web — cách viết premium.ts đã đổi.');
    assert.ok(Object.keys(db).length >= 3, 'Không đọc được bảng giá trong migration 0133.');

    const moiGoi = [...new Set([...Object.keys(bot), ...Object.keys(web), ...Object.keys(db)])].sort();
    const lech = [];
    for (const g of moiGoi) {
        const b = bot[g], w = web[g], d = db[g];
        if (!b) { lech.push(`${g}: bot KHÔNG có gói này`); continue; }
        if (!w) { lech.push(`${g}: web KHÔNG có gói này`); continue; }
        if (!d) { lech.push(`${g}: DB (0133) KHÔNG có gói này`); continue; }
        if (b.months !== w.months || b.months !== d.months)
            lech.push(`${g} số tháng lệch: bot=${b.months} web=${w.months} db=${d.months}`);
        if (b.amount !== w.amount || b.amount !== d.amount)
            lech.push(`${g} số tiền lệch: bot=${b.amount} web=${w.amount} db=${d.amount}`);
    }

    assert.deepStrictEqual(lech, [],
        'Bảng giá lệch nhau. DB sẽ TỪ CHỐI mọi đơn không khớp (migration 0133), nên người dùng '
        + 'bấm mua và không mua được gì. Sửa cả ba nơi cùng lúc:\n'
        + '  src/config/index.js · web/src/lib/premium.ts · supabase/migrations/0133_*.sql');
});

test('giá tăng dần theo số tháng, và mua dài phải rẻ hơn theo tháng', () => {
    const bot = giaBot();
    const ds = Object.entries(bot).sort((a, b) => a[1].months - b[1].months);

    for (let i = 1; i < ds.length; i++) {
        const [tenTruoc, truoc] = ds[i - 1];
        const [tenSau, sau] = ds[i];
        assert.ok(sau.amount > truoc.amount,
            `Gói ${tenSau} (${sau.months} tháng) không đắt hơn ${tenTruoc} (${truoc.months} tháng).`);
        const donGiaTruoc = truoc.amount / truoc.months;
        const donGiaSau = sau.amount / sau.months;
        assert.ok(donGiaSau < donGiaTruoc,
            `Gói ${tenSau} có đơn giá ${Math.round(donGiaSau)}₫/tháng, KHÔNG rẻ hơn ${tenTruoc} `
            + `(${Math.round(donGiaTruoc)}₫/tháng). Mua dài mà đắt hơn thì không ai mua, và trông như đặt giá nhầm.`);
    }
});

test('migration 0133 giữ đủ ba rào của cổng thanh toán', () => {
    const src = fs.readFileSync(
        path.join(GOC, 'supabase', 'migrations', '0133_premium_plans_canonical.sql'), 'utf8');

    // Bỏ dòng bình luận SQL trước khi soi. Bản đầu của test này chỉ dò chuỗi chữ, nên
    // BÌNH LUẬN HOÁ lệnh REVOKE vẫn xanh, và đổi `RAISE EXCEPTION` thành `RAISE NOTICE`
    // cũng xanh — tức nó đóng dấu khống. Đo lại ngày 2026-08-23 mới lộ ra.
    const ma = src.replace(/^\s*--.*$/gm, '');

    assert.match(ma, /RAISE EXCEPTION 'don lech gia/,
        'Đơn lệch giá phải NÉM LỖI. `RAISE NOTICE` chỉ ghi log rồi cho đơn đi tiếp — người dùng '
        + 'vẫn nhận sai số tháng, mà lại không ai biết.');
    assert.match(ma, /RAISE EXCEPTION 'goi khong ton tai/,
        'Gói không có thật cũng phải ném lỗi, không phải ghi log.');
    assert.match(ma, /VALUES \(v_code, p_user, p_plan, v_plan\.months, v_plan\.amount\)/,
        'Đơn phải ghi số tháng/số tiền lấy từ BẢNG GIÁ CHUẨN, không phải từ tham số bên gọi. '
        + 'Ghi theo tham số thì phép đối chiếu ở trên chỉ là trang trí.');

    assert.match(ma, /^\s*REVOKE ALL ON FUNCTION public\.grant_premium/m,
        '`grant_premium` phải bị thu quyền khỏi anon — một hàm tên "cấp Premium" không có lý do '
        + 'gì mở ra Internet. (Lệnh bị bình luận hoá cũng tính là mất.)');
    assert.match(ma, /^\s*REVOKE ALL ON FUNCTION public\.create_premium_order/m,
        'Hàm tạo đơn cũng phải bị thu quyền khỏi anon.');
});
