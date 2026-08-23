// ============================================================
// test/web_khong_nuot_loi.test.js — tầng web không được nuốt lỗi truy vấn.
//
// VÌ SAO CÓ: rà 2026-08-23 tìm ra 19 truy vấn viết `const { data } = await admin...` — chỉ
// lấy `data`, bỏ `error`. Hậu quả không phải "sập" mà là "rỗng": PostgREST trả lỗi, `data`
// thành null, giao diện hiện danh sách trống trông y hệt "chưa có dữ liệu".
//
// Chính cơ chế này đã giấu ba lỗi thật rất lâu — bảng xếp hạng tiệm bánh luôn rỗng, trang
// battle pass hiện mã vật phẩm thô, và cùng một truy vấn sai chép ra hai file.
//
// Hai chỗ trong 19 còn tệ hơn "im lặng": chúng GHI SAI DỮ LIỆU.
//   · toggleProfilePublic/toggleVoteReminder đọc-rồi-ghi với `?? true`, nên đọc hỏng một
//     nhịp là hồ sơ người dùng tự chuyển sang ẨN. Đã thay bằng RPC nguyên tử (0135).
//   · claimPremiumOrder bỏ `error` của lệnh UPDATE, nên người vừa chuyển tiền bấm nút mà
//     ghi hỏng thì rơi vào đúng nhánh "đã bấm rồi" — không ghi, không báo ai.
//
// Và một chỗ KHÔNG lọt vào phép quét vì nó `await` trần, không tách `data`:
//   · approvePremiumOrderWeb — owner bấm duyệt, RPC hỏng, owner tin là xong, khách trả tiền
//     không nhận gì.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web', 'src');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function duyet(d, o = []) {
    if (!fs.existsSync(d)) return o;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) duyet(p, o); else if (/\.(ts|tsx)$/.test(e.name)) o.push(p);
    }
    return o;
}
const rel = f => path.relative(WEB, f).replace(/\\/g, '/');
const FILES = duyet(WEB);

test('không truy vấn nào chỉ lấy `data` mà bỏ `error`', () => {
    assert.ok(FILES.length > 50, `Chỉ thấy ${FILES.length} file — đường dẫn đã đổi?`);

    const xau = [];
    for (const f of FILES) {
        if (rel(f) === 'lib/ghiLoi.ts') continue; // chính file helper, chuỗi mẫu nằm trong chú thích
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        for (const m of s.matchAll(/const\s*\{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await\s+(\w+)/g)) {
            if (!/supabase|admin|client|db/i.test(m[2])) continue;
            xau.push(rel(f));
        }
    }
    assert.deepStrictEqual([...new Set(xau)], [],
        'Có truy vấn bỏ `error`. Lỗi sẽ biến mất và giao diện hiện danh sách RỖNG trông y hệt '
        + '"chưa có dữ liệu" — không cách nào phân biệt hỏng với trống từ bên ngoài. '
        + 'Lấy cả `error` rồi gọi `ghiLoi("<nơi>", error)`.');
});

test('mọi truy vấn tách `error` ra đều DÙNG nó', () => {
    // Tách rồi bỏ đó thì y hệt như nuốt. Đếm: mỗi lần tách phải có một chốt xử lý.
    const xau = [];
    for (const f of FILES) {
        if (rel(f) === 'lib/ghiLoi.ts') continue;
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        // Lấy ĐÚNG TÊN biến lỗi rồi đếm số lần nó xuất hiện trong file.
        //
        // Hai bản trước đều sai, và cả hai đều sai theo kiểu khó thấy:
        //   1. dò trong cửa sổ 700 ký tự sau truy vấn -> bắt nhầm chữ `error` của NHÁNH KHÁC
        //      nằm ngay bên dưới, nên xoá chốt canh vẫn xanh.
        //   2. đếm chốt canh bằng `\w*[eE]rr\b` -> KHÔNG khớp `dbError`, vì sau `rr` còn chữ
        //      `o` nên `\b` hỏng. Kết quả là báo oan một file vốn xử lý lỗi hoàn toàn đúng.
        //
        // Đếm tên biến thì không có cửa sổ để lệch, không có khuôn để trượt: khai ra mà
        // không nhắc lại lần nào nữa thì đúng là bỏ đó.
        for (const m of s.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+(\w+)/g)) {
            if (!/supabase|admin|client|db/i.test(m[2])) continue;
            const kb = m[1];
            const mTen = kb.match(/\berror\s*:\s*(\w+)/) || (/\berror\b/.test(kb) ? [null, 'error'] : null);
            if (!mTen) continue;
            const ten = mTen[1];
            const soLan = (s.match(new RegExp(`\\b${ten}\\b`, 'g')) || []).length;
            if (soLan < 2) xau.push(`${rel(f)} — khai \`${ten}\` rồi không dùng lần nào`);
        }
    }
    assert.deepStrictEqual(xau, [], 'Tách `error` ra rồi không dùng thì y hệt như nuốt.');
});

test('hai nút bật/tắt hồ sơ dùng RPC nguyên tử, KHÔNG đọc-rồi-ghi', () => {
    const s = boCmt(fs.readFileSync(path.join(WEB, 'app', 'dashboard', 'actions.ts'), 'utf8'));

    assert.match(s, /rpc\(\s*["']toggle_user_flag["']/,
        'Nút bật/tắt phải đi qua RPC `toggle_user_flag` (0135).');
    assert.ok(!/\?\?\s*true\s*\)\s*as boolean/.test(s),
        'Còn khuôn đọc-rồi-ghi `?? true`. Đọc hỏng một nhịp là ghi giá trị suy từ MẶC ĐỊNH chứ '
        + 'không phải từ trạng thái thật — hồ sơ người dùng tự chuyển sang ẩn.');
    assert.ok(!/from\("users"\)\s*\.update\(\{\s*profile_public/.test(s),
        'Vẫn còn lệnh UPDATE profile_public trực tiếp từ web.');
});

test('đường TIỀN báo cho owner khi ghi hỏng, không chỉ ghi log', () => {
    const s = boCmt(fs.readFileSync(path.join(WEB, 'app', 'dashboard', 'premium', 'actions.ts'), 'utf8'));

    // (a) người mua bấm "đã chuyển khoản"
    const iClaim = s.indexOf('claimPremiumOrder');
    const khoiClaim = s.slice(iClaim, s.indexOf('approvePremiumOrderWeb'));
    assert.match(khoiClaim, /error\s*:\s*\w+/,
        'claimPremiumOrder phải lấy `error` của lệnh UPDATE.');
    // Soi bên TRONG nhánh `if (loiBao)`, không chỉ soi cả khối.
    //
    // Bản đầu chỉ `assert.match(khoiClaim, /alertOwner\(/)` — nên bọc lời gọi bằng
    // `if (false)` vẫn xanh. Cùng lỗi đã mắc ba lần hôm nay: kiểm chuỗi chữ thay vì kiểm
    // hành vi.
    const iLoi = khoiClaim.indexOf('if (loiBao)');
    assert.ok(iLoi > -1, 'Mất nhánh `if (loiBao)` — lỗi ghi nhận lại bị nuốt.');
    const nhanhLoi = khoiClaim.slice(iLoi, iLoi + 900);
    assert.match(nhanhLoi, /await alertOwner\(/,
        'Ghi hỏng ở đây phải BÁO OWNER, không chỉ log: người vừa chuyển tiền sẽ chờ mãi một '
        + 'lời duyệt không bao giờ tới, và không ai biết để sửa.');
    assert.ok(!/if\s*\(\s*false\s*\)/.test(nhanhLoi),
        'Lời gọi alertOwner đang bị vô hiệu hoá bằng `if (false)`.');
    assert.match(nhanhLoi, /redirect\(/,
        'Người mua cũng phải được báo để bấm lại, không chỉ owner.');

    // (b) owner bấm duyệt
    const khoiDuyet = s.slice(s.indexOf('approvePremiumOrderWeb'));
    assert.ok(!/^\s*await admin\.rpc\(\s*["']approve_premium_order["']/m.test(khoiDuyet),
        '`approve_premium_order` đang được await trần, bỏ cả `error` lẫn kết quả nghiệp vụ. '
        + 'Owner sẽ tin là đã duyệt trong khi khách không nhận được gì.');
    assert.match(khoiDuyet, /\.ok\s*===\s*true|\?\.ok/,
        'Phải kiểm `data.ok` — RPC trả jsonb và có thể nói ok:false (not_found, wrong_kind).');
    assert.match(khoiDuyet, /alertOwner\(/, 'Duyệt hỏng phải báo owner.');
});

test('helper ghiLoi tồn tại và không tự ném lỗi', () => {
    const f = path.join(WEB, 'lib', 'ghiLoi.ts');
    assert.ok(fs.existsSync(f), 'Mất web/src/lib/ghiLoi.ts.');
    const s = fs.readFileSync(f, 'utf8');
    assert.match(s, /if\s*\(\s*!loi\s*\)\s*return false/,
        'ghiLoi phải trả về ngay khi không có lỗi — nó được gọi vô điều kiện ở mọi nơi.');
    assert.match(s, /\[web\]/, 'Giữ tiền tố [web] để grep được trong log Vercel.');
});
