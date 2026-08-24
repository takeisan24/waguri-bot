// ============================================================
// test/loi_db_khong_noi_doi_ve_vi.test.js — DB hỏng thì được phép báo lỗi, KHÔNG được nói
// người chơi hết tiền.
//
// VÌ SAO CÓ: các hàm bọc trong `database.js` trả boolean, và nhánh `catch` cũng trả `false`.
// Nên `false` mang HAI nghĩa lẫn lộn: "người dùng không đủ" và "DB hỏng". Nơi gọi không
// phân biệt được, và biến nó thành lời KHẲNG ĐỊNH về tài sản của người dùng.
//
// Nặng nhất là `addMoney` — đường ĐẶT CƯỢC của cả 5 trò cờ bạc. Lúc Supabase chập chờn
// (log prod đã có `EAI_AGAIN`), người chơi bị báo "không đủ 5.000 xu để cược" KÈM SỐ TIỀN
// CỤ THỂ, dù ví đầy. Sai kiểu đó khó nghi ngờ hơn hẳn một cái crash.
//
// Quy mô đo được 2026-08-24: 44 hàm bọc trả boolean nuốt lỗi DB, 22 nơi gọi biến nó thành
// lời khẳng định sai. (Lần đếm đầu ra 10/11 vì regex chỉ khớp `return data === true` nên bỏ
// sót `addMoney`, vốn trả `data !== null` — khi quét KIỂU TRẢ VỀ đừng chỉ khớp một dạng.)
//
// CÁCH VÁ (do phiên pet-update-4o8 nghĩ ra, đã chứng minh ở `takeItem`): đổi `catch` trả
// `null`. Mọi nơi gọi dùng `if (!x)` giữ NGUYÊN hành vi vì `null` cũng falsy — nên không
// phải sửa chỗ nào; rồi tách nhánh dần ở từng chỗ. Không cần một đợt sửa lớn 22 chỗ.
//
// Cổng này chốt hai thứ: hàm bọc phải trả `null` khi DB lỗi, và những nơi gọi ĐÃ tách nhánh
// thì không được gộp lại.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const doc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Cắt thân một hàm `async function <ten>` cho tới dấu `}` ở cột 0. */
function thanHam(src, ten) {
    const i = src.indexOf(`async function ${ten}(`);
    if (i < 0) return null;
    const j = src.indexOf('\n}', i);
    return j < 0 ? src.slice(i) : src.slice(i, j + 2);
}

// Các hàm bọc mà `false` của chúng đang/đã từng bị biến thành lời khẳng định về tài sản.
const HAM_BOC = [
    'addMoney', 'takeItem', 'transferBank', 'transferMoneyWithTax',
    'transferItem', 'stakeCollect', 'stakeSettle', 'setCosmeticWithFee',
];

test('hàm bọc: nhánh catch trả `null`, không phải `false`', () => {
    const db = doc('src', 'database.js');
    const xau = [];
    for (const ten of HAM_BOC) {
        const than = thanHam(db, ten);
        if (!than) { xau.push(`${ten}: không tìm thấy hàm`); continue; }
        const iCatch = than.indexOf('catch');
        if (iCatch < 0) { xau.push(`${ten}: không có nhánh catch`); continue; }
        const sauCatch = than.slice(iCatch);
        if (!/return\s+null\s*;/.test(sauCatch)) {
            xau.push(`${ten}: nhánh catch không trả \`null\``);
        }
    }
    assert.deepStrictEqual(xau, [],
        'Nhánh `catch` trả `false` nghĩa là lỗi DB không phân biệt được với "người dùng không\n'
        + 'đủ". Trả `null` thay vào đó: mọi nơi gọi dùng `if (!x)` giữ nguyên hành vi, và chỗ\n'
        + 'nào muốn tách thì kiểm `=== null`.');
});

test('đặt cược: 5 trò cờ bạc phải tách lỗi DB khỏi "không đủ tiền"', () => {
    // Năm trò đầu đặt cược qua `db.addMoney(userId, -bet)`; hai trò lobby (duangua,
    // xocdia) đặt qua `db.stakeCollect(...)`. Hai đường khác nhau nhưng CÙNG một lớp
    // lỗi, nên gác chung — thiếu trò nào là trò đó lặng lẽ quay về nói dối.
    const TRO = ['coinflip', 'taixiu', 'baucua', 'blackjack', 'crate'];
    const TRO_LOBBY = ['duangua', 'xocdia'];
    const xau = [];
    for (const tro of TRO) {
        const s = doc('src', 'commands', 'games', `${tro}.js`);

        // CHỈ soi đường ĐẶT CƯỢC (số tiền ÂM). Các lời gọi `addMoney` khác trong cùng tệp
        // là đường TRẢ THƯỞNG — chúng chỉ ghi log chứ không nói gì với người chơi, nên không
        // thuộc lớp lỗi này. Bản đầu của cổng soi cả tệp và bắt nhầm cả 4 trò.
        if (/if\s*\(\s*!\s*await\s+db\.addMoney\(\s*\w+\s*,\s*-/.test(s)) {
            xau.push(`${tro}: đường đặt cược còn dùng \`if (!await db.addMoney(...))\` — gộp lỗi DB với hết tiền`);
            continue;
        }
        if (!/const\s+daTru\s*=\s*await\s+db\.addMoney\(/.test(s)) {
            xau.push(`${tro}: không giữ kết quả addMoney vào biến`);
            continue;
        }
        if (!/daTru\s*!==\s*true/.test(s)) {
            xau.push(`${tro}: không kiểm \`daTru !== true\``);
        }
        if (!/daTru\s*===\s*null/.test(s)) {
            xau.push(`${tro}: không tách nhánh \`daTru === null\` (lỗi DB)`);
        }
        if (!/common\.retry_later/.test(s)) {
            xau.push(`${tro}: không có thông điệp riêng cho lỗi DB`);
        }
    }
    for (const tro of TRO_LOBBY) {
        const s = doc('src', 'commands', 'games', `${tro}.js`);
        if (/if\s*\(\s*!\s*await\s+db\.stakeCollect\(/.test(s)) {
            xau.push(`${tro}: đường đặt cược còn dùng \`if (!await db.stakeCollect(...))\``);
            continue;
        }
        if (!/const\s+daThu\s*=\s*await\s+db\.stakeCollect\(/.test(s)) xau.push(`${tro}: không giữ kết quả stakeCollect`);
        if (!/daThu\s*!==\s*true/.test(s)) xau.push(`${tro}: không kiểm \`daThu !== true\``);
        if (!/daThu\s*===\s*null/.test(s)) xau.push(`${tro}: không tách nhánh lỗi DB`);
    }

    assert.deepStrictEqual(xau, [],
        'Đặt cược là chỗ đau nhất của lớp lỗi này: thông điệp còn kèm SỐ TIỀN cụ thể nên\n'
        + 'nghe rất thuyết phục, mà người chơi thì đang có đủ tiền.');
});

test('chuyển tiền: bank và give cũng phải tách', () => {
    const xau = [];

    const bank = doc('src', 'commands', 'economy', 'bank.js');
    if (!/const\s+kq\s*=\s*await\s+db\.transferBank\(/.test(bank)) xau.push('bank.js: không giữ kết quả transferBank');
    if (!/kq\s*!==\s*true/.test(bank)) xau.push('bank.js: không kiểm `kq !== true`');
    if (!/kq\s*===\s*null/.test(bank)) xau.push('bank.js: không tách nhánh lỗi DB');

    const give = doc('src', 'commands', 'economy', 'give.js');
    if (!/const\s+kq\s*=\s*await\s+db\.transferMoneyWithTax\(/.test(give)) xau.push('give.js: không giữ kết quả');
    if (!/kq\s*!==\s*true/.test(give)) xau.push('give.js: không kiểm `kq !== true`');
    if (!/kq\s*===\s*null/.test(give)) xau.push('give.js: không tách nhánh lỗi DB');

    assert.deepStrictEqual(xau, [],
        'Hai lệnh này nói thẳng về số dư người dùng, nên nói sai ở đây đặc biệt tai hại.');
});

test('khoá i18n dùng cho lỗi DB phải tồn tại ở CẢ hai ngôn ngữ', () => {
    for (const ngu of ['vi', 'en']) {
        const j = require(`../src/locales/${ngu}.json`);
        assert.ok(j.common && j.common.retry_later,
            `${ngu}: thiếu khoá common.retry_later — nhánh lỗi DB sẽ hiện chuỗi rỗng.`);
    }
});
