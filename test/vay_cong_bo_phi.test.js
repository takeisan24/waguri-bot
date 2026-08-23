// ============================================================
// test/vay_cong_bo_phi.test.js — chủ nợ phải thấy SỐ HỌ THẬT SỰ BỎ RA trước khi đồng ý.
//
// VÌ SAO CÓ: `loan_create` thu thêm một khoản phí lập khế ước của CHỦ NỢ rồi đốt (nó tồn tại
// để chặn hai tài khoản phụ chuyển tiền cho nhau qua vay–trả nhằm né thuế của /give — thiết
// kế đúng). Nhưng tới 2026-08-24, khoản phí đó KHÔNG được nhắc ở bất kỳ đâu:
//
//   · `proposal_desc` chỉ nói "vay 10.000, lãi 10%, phải trả 11.000"
//   · không một khoá i18n nào chứa chữ "phí"
//   · RPC TRẢ VỀ `fee` — và JS bỏ qua
//
// Đo trên prod: chủ nợ đồng ý cho vay 10.000, ví tụt 100.000 → 89.500. Mất 10.500, không một
// chữ nào giải thích 500 kia đi đâu.
//
// Tệ hơn, con số "Lãi 10%" còn gây hiểu nhầm NGƯỢC cho chủ nợ: họ bỏ 10.500 thu 11.000, lời
// thật 500 ≈ 4,76% — chưa bằng một nửa con số in trên màn hình họ vừa bấm đồng ý.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const vay = () => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'vay.js'), 'utf8'));
const i18n = ngu => require(`../src/locales/${ngu}.json`).commands.vay;

test('tỉ lệ phí có MỘT nguồn duy nhất, và được truyền xuống RPC', () => {
    const cfg = require('../src/config');
    assert.strictEqual(typeof cfg.LOAN.FEE_PCT, 'number',
        'Thiếu LOAN.FEE_PCT trong config. Ghi cứng phí trong SQL rồi chép tay sang JS để hiển '
        + 'thị là đúng kiểu lệch nguồn mà bảng giá Premium đã phải sinh cổng riêng để chặn.');

    const db = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'database.js'), 'utf8'));
    assert.match(db, /p_fee_pct\s*:\s*LOAN\.FEE_PCT/,
        'db.loanCreate phải truyền LOAN.FEE_PCT xuống RPC — nếu không, màn hình hiển thị một '
        + 'tỉ lệ còn RPC thu một tỉ lệ khác.');
});

test('màn hình ĐỀ NGHỊ nói rõ chủ nợ bỏ ra bao nhiêu, trước khi họ bấm đồng ý', () => {
    for (const ngu of ['vi', 'en']) {
        const s = i18n(ngu).proposal_desc;
        for (const oo of ['{lenderPays}', '{fee}', '{feePct}', '{profit}']) {
            assert.ok(s.includes(oo),
                `${ngu}/proposal_desc thiếu ${oo}. Chủ nợ phải thấy SỐ HỌ BỎ RA và LỜI THẬT `
                + 'trước khi đồng ý, không phải chỉ thấy con số lãi gây hiểu nhầm.');
        }
    }
    const s = vay();
    assert.match(s, /lenderPays\s*:/, 'vay.js phải truyền lenderPays vào đề nghị.');
    assert.match(s, /profit\s*:/, 'vay.js phải truyền lời thật vào đề nghị.');
    assert.match(s, /config\.LOAN\.FEE_PCT/, 'Phí trong đề nghị phải lấy từ config, không ghi số cứng.');
});

test('tin nhắn THÀNH CÔNG lấy phí từ RPC, không tự tính lại', () => {
    const s = vay();
    assert.match(s, /fee\s*:\s*fmt\(\s*Number\(\s*r\.fee/,
        'Phải hiển thị `r.fee` — số RPC thật sự đã trừ. Tính lại ở JS thì khi hai bên lệch, '
        + 'người dùng đọc con số không có thật.');
    assert.match(s, /lenderPaid\s*:\s*fmt\(\s*Number\(\s*r\.lender_paid/,
        'Phải hiển thị `r.lender_paid` từ RPC.');
});

test('nhánh trả nợ THẤT BẠI không mang tiêu đề thành công', () => {
    const s = vay();
    const i = s.indexOf("r.status === 'poor'");
    assert.ok(i > -1, 'Không thấy nhánh `poor` trong /vay tra.');
    const khoi = s.slice(i, i + 500);
    assert.ok(!/repay_success_title/.test(khoi),
        'Nhánh trả nợ thất bại đang dùng `repay_success_title`. Embed đã màu đỏ nhưng chữ nói '
        + 'ngược — người đọc lướt chỉ thấy tiêu đề.');
    assert.match(khoi, /repay_fail_title/, 'Phải dùng tiêu đề riêng cho nhánh thất bại.');
    for (const ngu of ['vi', 'en']) {
        assert.ok(i18n(ngu).repay_fail_title, `${ngu} thiếu khoá repay_fail_title.`);
    }
});

test('phí không được lớn tới mức cho vay thành lỗ', () => {
    const { LOAN } = require('../src/config');
    assert.ok(LOAN.FEE_PCT < LOAN.INTEREST_PCT,
        `FEE_PCT (${LOAN.FEE_PCT}) >= INTEREST_PCT (${LOAN.INTEREST_PCT}) nghĩa là chủ nợ bỏ ra `
        + 'nhiều hơn số thu về — không ai cho vay nữa và cả tính năng chết lặng lẽ.');

    // Kiểm bằng một con số cụ thể cho dễ đọc khi cổng đỏ
    const von = 10000;
    const boRa = von + Math.floor(von * LOAN.FEE_PCT);
    const thuVe = Math.floor(von * (1 + LOAN.INTEREST_PCT));
    assert.ok(thuVe > boRa,
        `Cho vay ${von}: bỏ ra ${boRa}, thu về ${thuVe} — chủ nợ LỖ ${boRa - thuVe}.`);
});
