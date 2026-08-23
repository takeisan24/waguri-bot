// ============================================================
// test/vay_hau_qua_qua_han.test.js — phần HẬU QUẢ của hệ thống vay phải còn nguyên.
//
// VÌ SAO CÓ: tới 2026-08-24, nợ quá hạn KHÔNG sinh thêm gì. Đo trên prod: 2 khoản vay,
// cả hai quá hạn 58 ngày, 0 lượt trả, tỉ lệ quỵt 100%. Nợ ngày 58 bằng đúng nợ ngày 1 nên
// người vay không có lý do nào để trả, còn chủ nợ bỏ ra 10.500 thu về 11.000 mà gánh toàn
// bộ rủi ro mất trắng.
//
// Migration 0139/0140 thêm lãi phạt có trần, chặn vay khi đang nợ quá hạn, và tự thu chạy
// nền. Cổng này canh bốn thứ dễ mất nhất khi ai đó sửa sau này.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const i18n = ngu => require(`../src/locales/${ngu}.json`).commands.vay;

test('trần lãi phạt phải THẬT SỰ là trần', () => {
    const { LOAN } = require('../src/config');
    assert.strictEqual(typeof LOAN.LATE_PCT_PER_DAY, 'number', 'Thiếu LOAN.LATE_PCT_PER_DAY.');
    assert.strictEqual(typeof LOAN.LATE_MAX_MULT, 'number', 'Thiếu LOAN.LATE_MAX_MULT.');

    assert.ok(LOAN.LATE_MAX_MULT > 1,
        `LATE_MAX_MULT = ${LOAN.LATE_MAX_MULT}. Trần <= 1 nghĩa là nợ KHÔNG BAO GIỜ tăng — `
        + 'lãi phạt thành trang trí, và cả lý do tồn tại của 0140 biến mất.');

    // Trần vô hạn thì nợ phình tới mức người vay bỏ luôn tài khoản; chủ nợ cũng mất trắng.
    assert.ok(LOAN.LATE_MAX_MULT <= 3,
        `LATE_MAX_MULT = ${LOAN.LATE_MAX_MULT} nghĩa là nợ có thể phình tới `
        + `${Math.round(LOAN.LATE_MAX_MULT * 100)}% số phải trả. Quá nặng thì người vay bỏ tài `
        + 'khoản, và chủ nợ mất trắng luôn — đúng thứ lãi phạt sinh ra để tránh.');

    assert.ok(LOAN.LATE_PCT_PER_DAY > 0 && LOAN.LATE_PCT_PER_DAY <= 0.1,
        `LATE_PCT_PER_DAY = ${LOAN.LATE_PCT_PER_DAY} nằm ngoài khoảng hợp lý (0, 0.1].`);
});

test('tỉ lệ phạt có MỘT nguồn duy nhất và được truyền xuống RPC', () => {
    const db = doc('src', 'database.js');
    assert.match(db, /p_rate\s*:\s*LOAN\.LATE_PCT_PER_DAY/,
        'db.loanApplyLateFees phải truyền LOAN.LATE_PCT_PER_DAY xuống RPC. Ghi cứng tỉ lệ '
        + 'trong SQL rồi chép tay sang JS để hiển thị là đúng kiểu lệch nguồn mà phí lập '
        + 'khế ước đã phải sinh cổng riêng để chặn.');
    assert.match(db, /p_max_mult\s*:\s*LOAN\.LATE_MAX_MULT/,
        'db.loanApplyLateFees phải truyền LOAN.LATE_MAX_MULT xuống RPC.');
});

test('người vay biết TRƯỚC là quá hạn sẽ bị phạt và bị tự thu', () => {
    for (const ngu of ['vi', 'en']) {
        const v = i18n(ngu);
        for (const oo of ['{lateWarn}', '{credit}']) {
            assert.ok(v.proposal_desc.includes(oo),
                `${ngu}/proposal_desc thiếu ${oo}.`);
        }
        assert.ok(v.success_desc.includes('{lateWarn}'),
            `${ngu}/success_desc thiếu {lateWarn}. Người vay bị TRỪ TIỀN mà không bấm gì, `
            + 'nên phải được báo trước khi nhận tiền, không phải sau khi mất tiền.');
        for (const k of ['late_warn', 'credit_clean', 'credit_history', 'credit_warn', 'err_borrower_overdue']) {
            assert.ok(v[k], `${ngu} thiếu khoá commands.vay.${k}.`);
        }
        assert.ok(/\{latePct\}/.test(v.late_warn) && /\{lateMax\}/.test(v.late_warn),
            `${ngu}/late_warn phải cắm {latePct} và {lateMax}, không ghi số cứng — số cứng `
            + 'sẽ nói dối ngay lần đầu ai đó chỉnh config.');
    }

    const s = doc('src', 'commands', 'economy', 'vay.js');
    assert.match(s, /latePct\s*:\s*Math\.round\(\s*config\.LOAN\.LATE_PCT_PER_DAY/,
        'vay.js phải lấy tỉ lệ phạt từ config khi dựng cảnh báo.');
    assert.match(s, /lateMax\s*:\s*Math\.round\(\s*config\.LOAN\.LATE_MAX_MULT/,
        'vay.js phải lấy trần từ config khi dựng cảnh báo.');
});

test('chủ nợ thấy lịch sử nợ của người vay TRƯỚC khi bấm đồng ý', () => {
    const s = doc('src', 'commands', 'economy', 'vay.js');
    const iCredit = s.indexOf('loanCredit');
    const iDeNghi = s.indexOf('proposal_desc');
    assert.ok(iCredit > -1, 'vay.js không gọi db.loanCredit — chủ nợ vẫn cho vay mù.');
    assert.ok(iDeNghi > -1, 'không thấy chỗ dựng màn hình đề nghị.');
    assert.ok(iCredit < iDeNghi,
        'db.loanCredit phải được gọi TRƯỚC khi dựng đề nghị. Gọi sau thì con số hiện ra '
        + 'không phải con số dùng để quyết định.');
    assert.match(s, /credit\b/, 'vay.js phải truyền `credit` vào đề nghị.');
});

test('người đang nợ quá hạn không vay thêm được — chặn ở CẢ hai tầng', () => {
    const s = doc('src', 'commands', 'economy', 'vay.js');
    assert.match(s, /err_borrower_overdue/,
        'vay.js phải xử lý trường hợp người vay đang có nợ quá hạn.');
    assert.match(s, /co_no_qua_han/,
        'vay.js phải xử lý status `co_no_qua_han` từ RPC. Chặn ở tầng lệnh thôi là chưa đủ: '
        + 'giữa lúc hiện đề nghị và lúc chủ nợ bấm đồng ý, nợ có thể vừa quá hạn.');

    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '0140_vay_hoan_chinh.sql'), 'utf8');
    assert.match(sql, /co_no_qua_han/,
        '0140 phải giữ chốt chặn trong chính loan_create — tầng lệnh có thể bị bỏ qua.');
});

test('chạy nền PHẠT TRƯỚC rồi mới THU', () => {
    const s = doc('index.js');
    const iPhat = s.indexOf('loanApplyLateFees');
    const iThu = s.indexOf('loanCollectAll');
    assert.ok(iPhat > -1, 'index.js không gọi db.loanApplyLateFees — nợ quá hạn không bao giờ tăng.');
    assert.ok(iThu > -1, 'index.js không gọi db.loanCollectAll — chủ nợ vẫn phải tự canh /vay doi.');
    assert.ok(iPhat < iThu,
        'Phải PHẠT trước rồi mới THU. Thu trước thì khoản vừa bị thu hết lại bị phạt trên '
        + 'phần dư của chính lượt đó, và số tiền người vay thật sự mất khác với số hiện ra.');
});
