// ============================================================
// test/vay_he_thong_noi_that.test.js — Quỹ Tín Dụng Kikyo phải GIẢI NGÂN THẬT, một lần.
//
// CHUYỆN ĐÃ XẢY RA (đo trên prod 2026-10-22). `/loan borrow` gọi `loanCreate('SYSTEM', ...)`
// — RPC của đường vay P2P — với một bên cho vay KHÔNG TỒN TẠI. Bốn thứ sai cùng lúc:
//   1. RPC trừ ví `p_lender` với chốt `wallet >= principal + fee`; không có dòng `users`
//      nào mang `user_id = 'SYSTEM'` -> luôn trả `status = 'poor'`.
//   2. Lệnh lại kiểm `res.ok`, trong khi RPC trả `status` -> `undefined` -> nhánh thành công
//      KHÔNG BAO GIỜ tới được, nhánh lỗi luôn nổ.
//   3. Nếu sửa hai cái trên mà bỏ qua `await db.addMoney(...)` ngay bên dưới thì thành
//      TRẢ TIỀN HAI LẦN, vì RPC đã tự cộng ví người vay.
//   4. Lệnh ghi cứng lãi `amount * 0.14` trong khi `config.LOAN.INTEREST_PCT = 0.10`
//      -> người chơi được báo nợ 14% mà sổ ghi 10%. Vi phạm AGENTS.md §10.
// Bằng chứng nó chưa bao giờ chạy: 0 khoản vay `lender_id='SYSTEM'`, 0 dòng ledger về vay,
// trong khi 45 người đã đủ Cấp 5 (31 còn hoạt động 30 ngày) nên cổng cấp KHÔNG phải lý do.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const doc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const LOAN_JS = () => doc('src', 'commands', 'economy', 'loan.js');
const MIG = () => doc('supabase', 'migrations', '0157_loan_create_system.sql');

/** Bỏ chú thích TRƯỚC khi quét. Bản đầu của cổng này không bỏ, nên nó khớp đúng những
 *  dòng `//` tả lại lỗi cũ (`loanCreate('SYSTEM')`, `res.ok`, `* 0.14`) và báo đỏ oan —
 *  trong khi mã thật đã sạch. Quét văn bản mà không bỏ comment là cổng tự bắn vào chân. */
function boComment(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Chỉ phần thân nhánh `borrow` — đừng quét cả tệp, vì `pay` cũng có lời gọi tiền hợp lệ. */
function thanNhanhBorrow() {
    const s = boComment(LOAN_JS());
    const i = s.indexOf("if (sub === 'borrow')");
    assert.ok(i >= 0, 'không thấy nhánh borrow trong loan.js');
    const j = s.indexOf("if (sub === 'pay')", i);
    return s.slice(i, j > i ? j : undefined);
}

// ── 1. Không được dùng lại đường P2P cho bên cho vay là hệ thống ────────────────────
test('borrow gọi loan_create_system, KHÔNG gọi loanCreate với SYSTEM', () => {
    const than = thanNhanhBorrow();
    assert.match(than, /db\.loanCreateSystem\(/,
        'nhánh borrow phải dùng db.loanCreateSystem() — RPC riêng của quỹ hệ thống (0157).');
    assert.ok(!/loanCreate\(\s*['"]SYSTEM['"]/.test(than),
        "Vẫn gọi loanCreate('SYSTEM', ...): RPC đó trừ ví bên cho vay nên luôn trả 'poor'.");
});

// ── 2. Không được trả tiền hai lần ──────────────────────────────────────────────────
test('borrow KHÔNG tự cộng ví — RPC đã giải ngân trong cùng giao dịch', () => {
    const than = thanNhanhBorrow();
    assert.ok(!/db\.addMoney\(/.test(than),
        'Nhánh borrow còn gọi db.addMoney(): RPC 0157 đã cộng ví người vay, cộng thêm là TRẢ ĐÚP.');

    const sql = MIG();
    const iNo  = sql.search(/insert\s+into\s+loans/i);
    const iTra = sql.search(/update\s+users\s+set\s+wallet\s*=\s*wallet\s*\+/i);
    assert.ok(iNo >= 0 && iTra >= 0, 'RPC phải vừa ghi nợ vừa giải ngân');
    assert.ok(iNo < iTra, 'Thứ tự phải là ghi nợ -> giải ngân, trong CÙNG một hàm.');
});

// ── 3. Kiểm `status`, không kiểm `ok` ───────────────────────────────────────────────
test('borrow kiểm status chứ không kiểm res.ok (hợp đồng RPC là status)', () => {
    const than = thanNhanhBorrow();
    assert.match(than, /res\.status/, 'phải đọc res.status');
    assert.ok(!/res\.ok\b/.test(than),
        'Còn kiểm `res.ok` — RPC không bao giờ trả trường `ok`, nên nhánh thành công chết.');
});

// ── 4. Lãi/kỳ hạn lấy từ config, không ghi cứng ─────────────────────────────────────
test('borrow không ghi cứng lãi hay kỳ hạn — MỘT con số MỘT nguồn (§10)', () => {
    const than = thanNhanhBorrow();
    assert.ok(!/\*\s*0\.1[0-9]/.test(than),
        'Còn ghi cứng hệ số lãi trong lệnh. Lấy từ config hoặc từ số RPC trả về.');
    assert.ok(!/\b0\.02\b/.test(than), 'Còn ghi cứng lãi/ngày 0.02.');
    // Số khoe ra phải là số RPC trả về, để không thể lệch khỏi sổ.
    assert.match(than, /res\.interest|res\.remaining/,
        'Số lãi/tổng nợ khoe ra phải lấy từ RPC (res.interest / res.remaining).');
});

// ── 5. Mọi status của RPC đều có nhánh ──────────────────────────────────────────────
test('mọi status trong migration 0157 đều được lệnh xử lý', () => {
    const sql = MIG();
    const ds = [...new Set((sql.match(/'status'\s*,\s*'([a-z_]+)'/g) || [])
        .map(x => /'status'\s*,\s*'([a-z_]+)'/.exec(x)[1]))].sort();
    assert.ok(ds.length >= 6, `chỉ thấy ${ds.length} status: ${ds.join(', ')} — kỳ vọng >= 6`);

    const than = thanNhanhBorrow();
    // `ok` có nhánh riêng; nhóm bad_* được gom bằng kiểm phủ định `status !== 'ok'`.
    const phaiCoNhanhRieng = ds.filter(s => s !== 'ok' && !s.startsWith('bad_'));
    const thieu = phaiCoNhanhRieng.filter(s => !than.includes(`'${s}'`));
    assert.deepStrictEqual(thieu, [], `status không có nhánh riêng: ${thieu.join(', ')}`);
    assert.match(than, /status\s*!==\s*'ok'/,
        "thiếu kiểm phủ định cho nhóm bad_* — status lạ sẽ rơi xuống nhánh thành công.");
});

// ── 5b. Đọc ĐÚNG thuộc tính mà helper trả về ────────────────────────────────────────
test('loan.js đọc loansOf().owing, không phải .vay', () => {
    const js = boComment(LOAN_JS());
    assert.ok(!/loans\?\.vay|loans\.vay\b/.test(js),
        '`loansOf` trả { owing, owed }. Đọc `.vay` khiến activeLoan luôn undefined: /loan status '
        + 'không thấy nợ, /loan pay luôn báo "không có nợ", chốt chống vay trùng không nổ.');
    assert.match(js, /loans\?\.owing/, 'phải đọc .owing');

    // Khoá luôn hợp đồng ở phía helper, để lần sau đổi tên trường là cổng đỏ chứ không im.
    // BẪY đã mắc: bản đầu chỉ `match(/return \{ owing/)` trên 700 ký tự đầu — và nó khớp vào
    // câu `return { owing: [], owed: [] }` trong khối CATCH, nên đổi tên ở câu return THÀNH
    // CÔNG mà cổng vẫn xanh. Nay chốt theo cách không có đường lách: trong thân `loansOf`
    // tuyệt đối không được xuất hiện tên trường cũ.
    const dbSrc = boComment(doc('src', 'database.js'));
    const i = dbSrc.indexOf('async function loansOf');
    assert.ok(i >= 0, 'không thấy helper loansOf');
    const than = dbSrc.slice(i, dbSrc.indexOf('\n}', i) + 2);
    assert.ok(!/\b(vay|choVay)\b/.test(than),
        `loansOf đang trả tên trường khác { owing, owed }:\n${than}\n`
        + 'Đổi tên ở đây thì PHẢI đổi cả loan.js cùng lúc — nếu không activeLoan lại thành undefined.');
    const soReturn = (than.match(/return\s*\{\s*owing[^}]*owed/g) || []).length;
    assert.ok(soReturn >= 2,
        `chỉ ${soReturn} câu return dùng { owing, owed } — cả nhánh thành công LẪN nhánh catch đều phải dùng.`);
});

// ── 5c. Trả nợ: tham số thứ hai là NGƯỜI CHO VAY, không phải id khoản vay ───────────
test('loanRepay nhận lender_id, và kết quả kiểm bằng status', () => {
    const js = boComment(LOAN_JS());
    const goi = [...js.matchAll(/db\.loanRepay\(([^)]*)\)/g)].map(m => m[1]);
    assert.ok(goi.length >= 2, `chỉ thấy ${goi.length} lời gọi loanRepay, kỳ vọng >= 2`);
    for (const args of goi) {
        assert.ok(!/activeLoan\.id\b/.test(args),
            `loanRepay(${args}): tham số 2 là lenderId. Truyền id khoản vay làm RPC tìm `
            + "`lender_id = '<số id>'` -> không bao giờ khớp -> trả 'none'.");
        assert.match(args, /lender_id/, `loanRepay(${args}): phải truyền activeLoan.lender_id`);
    }
    assert.ok(!/repayRes\.ok\b/.test(js),
        'Còn kiểm `repayRes.ok` — loan_repay trả { status }, không có trường `ok`.');
    assert.ok(!/repayRes\.status\s*===\s*'paid'/.test(js),
        "loan_repay không bao giờ trả 'paid'; trả hết hay chưa chỉ đọc được từ `remaining`.");
});

// ── 6. Cửa phải khoá ────────────────────────────────────────────────────────────────
test('loan_create_system bị REVOKE khỏi khoá công khai và ghim search_path', () => {
    const sql = MIG();
    assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.loan_create_system[\s\S]{0,160}?from\s+public/i,
        'Postgres mặc định cấp PUBLIC EXECUTE — không REVOKE là ai cũng tự vay được.');
    assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.loan_create_system[\s\S]{0,160}?service_role/i,
        'thiếu GRANT cho service_role -> bot không gọi được');
    assert.match(sql, /set\s+search_path\s+to\s+'pg_catalog',\s*'public'/i, 'thiếu ghim search_path');
    assert.match(sql, /set_config\(\s*'app\.ledger_source'\s*,\s*'loan_system'/i,
        'thiếu nhãn ledger — cú nhảy cung tiền sau này sẽ bị đọc thành exploit');
});

// ── 7. Chạy THẬT handler: không status nào rơi xuống nhánh thành công ───────────────
const { makeInteraction, textOf, stubDb } = require('./helpers/mockInteraction');
const db = require('../src/database.js');

function chayBorrow(ketQua, { userId = '700000000000000001' } = {}) {
    const lenh = require('../src/commands/economy/loan.js');
    const { interaction, calls } = makeInteraction({
        sub: 'borrow', options: { amount: 10000 }, userId, locale: 'vi',
    });
    const hoan = stubDb(db, {
        loanCreateSystem: async () => ketQua,
        loansOf: async () => ({ vay: [], choVay: [] }),
        getUser: async () => ({ user_id: userId, locale: 'vi', exp: 250000, wallet: 0, bank: 0 }),
        getGuildSettings: async () => ({}),
        addMoney: async () => { throw new Error('borrow KHÔNG được gọi addMoney — RPC đã giải ngân'); },
        loanCreate: async () => { throw new Error("borrow KHÔNG được gọi loanCreate('SYSTEM')"); },
    });
    return lenh.execute(interaction).then(() => { hoan(); return textOf(calls); },
        e => { hoan(); throw e; });
}

test('mỗi status cho một câu khác nhau, và không câu nào khoe giải ngân thành công', async () => {
    const mocKhoe = /Giải Ngân|Disbursed/i;
    const daThay = new Map();

    for (const kq of [
        { status: 'co_no_qua_han', no_qua_han: 5000 },
        { status: 'dang_no' },
        { status: 'bad_amount' },
        { status: 'bad_interest' },
        { status: 'bad_days' },
        null,                                    // DB chết
    ]) {
        const ten = kq === null ? '(null)' : kq.status;
        const text = await chayBorrow(kq, { userId: `7000000000000000${String(10 + daThay.size)}` });
        assert.ok(text.length > 0, `status ${ten}: không trả lời gì`);
        assert.ok(!mocKhoe.test(text), `status ${ten} lại khoe "Giải Ngân ... Thành Công"`);
        daThay.set(ten, text);
    }

    // `bad_*` và `null` cố ý dùng chung câu chung chung, nhưng hai status có nhánh riêng
    // thì PHẢI khác nhau — nếu không người chơi không biết vì sao bị từ chối.
    assert.notStrictEqual(daThay.get('co_no_qua_han'), daThay.get('dang_no'),
        'nợ quá hạn và đang nợ nói y hệt nhau — người chơi không biết phải làm gì');
});

test('status ok: khoe đúng số RPC trả về, không phải số JS tự tính', async () => {
    const text = await chayBorrow({
        status: 'ok', loan_id: 7, principal: 10000,
        remaining: 11000, interest: 1000,
        due_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    }, { userId: '700000000000000099' });

    assert.match(text, /Giải Ngân/i, 'nhánh ok phải khoe giải ngân thành công');
    assert.match(text, /1[.,]000/, 'phải hiện lãi 1.000 do RPC trả về');
    assert.match(text, /11[.,]000/, 'phải hiện tổng nợ 11.000 do RPC trả về');
    assert.ok(!/1[.,]400/.test(text),
        'Vẫn hiện 1.400 — tức đang tự tính lãi 14% ở JS thay vì dùng số RPC trả về (10%).');
});
