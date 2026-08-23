// ============================================================
// test/ai_model_premium.test.js — người TRẢ TIỀN không được nhận model tệ hơn người không trả.
//
// VÌ SAO CÓ: tới 2026-08-23, `GEMINI_PREMIUM_MODEL` ghim cứng `gemini-3.6-flash`, và
// `ai/index.js` định tuyến mọi người Premium sang đó. Đối chiếu bảng hạn mức thật của khoá
// (Google AI Studio › Rate Limit):
//
//     gemini-3.5-flash-lite  (người thường)  RPM 15  RPD 500
//     gemini-3.6-flash       (người Premium) RPM  5  RPD  20   <- nhỏ hơn 25 lần
//
// Trong khi `PREMIUM_DAILY = 150` hứa 150 lượt/ngày cho MỖI người, model đích chỉ chịu nổi
// 20 lượt/ngày cho TOÀN dự án. Vạch đỏ 24/20 trên bảng điều khiển cho thấy nó đã chạy thật.
//
// Lúc phát hiện có 0 người đang Premium nên chưa ai chịu thiệt. Nhưng đơn Premium đầu tiên
// bán được là vỡ ngay hôm đó, và người trả tiền đầu tiên là người ít khoan dung nhất.
//
// Cổng này gác bằng một bảng hạn mức ĐÃ BIẾT. Nó không gọi mạng — hạn mức đổi thì phải sửa
// bảng bằng tay, và chính việc phải sửa bằng tay là lúc người ta nhìn lại con số.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');

// Hạn mức đo ngày 2026-08-23 trên khoá education chưa bật billing.
// KHÔNG phải danh sách đầy đủ — chỉ những model dự án từng trỏ tới.
const HAN_MUC = {
    'gemini-3.5-flash-lite': { rpm: 15, rpd: 500 },
    'gemini-flash-lite-latest': { rpm: 15, rpd: 500 }, // bí danh của 3.5-flash-lite
    'gemini-3.6-flash': { rpm: 5, rpd: 20 },
    'gemini-2.5-flash': { rpm: 5, rpd: 20 },
    'gemini-3.7-flash': { rpm: 5, rpd: 20 },
    'gemini-2.5-flash-lite': { rpm: 10, rpd: 20 },
};

function nap() {
    // config đọc process.env lúc require -> xoá cache để mỗi lần nạp là một lần đọc mới
    delete require.cache[require.resolve('../src/config')];
    delete require.cache[require.resolve('../src/config/index.js')];
    return require('../src/config');
}

test('model Premium không được có hạn mức nhỏ hơn model thường', () => {
    const cfg = nap();
    const thuong = cfg.AI.GEMINI_MODEL;
    const premium = cfg.AI.GEMINI_PREMIUM_MODEL;

    const a = HAN_MUC[thuong];
    const b = HAN_MUC[premium];

    assert.ok(a, `Model thường '${thuong}' chưa có trong bảng hạn mức của test. `
        + 'Đổi model thì phải tra hạn mức thật rồi bổ sung vào HAN_MUC — đó là cả điểm của cổng này.');
    assert.ok(b, `Model Premium '${premium}' chưa có trong bảng hạn mức của test. `
        + 'Đổi model thì phải tra hạn mức thật rồi bổ sung vào HAN_MUC.');

    assert.ok(b.rpd >= a.rpd,
        `Người Premium bị đẩy sang '${premium}' (RPD ${b.rpd}) trong khi người thường dùng `
        + `'${thuong}' (RPD ${a.rpd}). Trả tiền để nhận ít hơn.`);
    assert.ok(b.rpm >= a.rpm,
        `Người Premium bị đẩy sang '${premium}' (RPM ${b.rpm}) trong khi người thường dùng `
        + `'${thuong}' (RPM ${a.rpm}).`);
});

test('PREMIUM_DAILY không được hứa nhiều hơn RPD của model Premium', () => {
    const cfg = nap();
    const premium = cfg.AI.GEMINI_PREMIUM_MODEL;
    const hm = HAN_MUC[premium];
    assert.ok(hm, `Model Premium '${premium}' chưa có trong bảng hạn mức.`);

    assert.ok(cfg.AI.PREMIUM_DAILY <= hm.rpd,
        `PREMIUM_DAILY = ${cfg.AI.PREMIUM_DAILY} hứa cho MỖI người, nhưng '${premium}' chỉ `
        + `chịu ${hm.rpd} lượt/ngày cho TOÀN dự án. Một người Premium dùng hết phần mình là `
        + 'cạn phần của tất cả.');
});

test('trần toàn dự án nằm dưới RPD của model thường', () => {
    const cfg = nap();
    const hm = HAN_MUC[cfg.AI.GEMINI_MODEL];
    assert.ok(cfg.AI.GLOBAL_DAILY <= hm.rpd,
        `GLOBAL_DAILY = ${cfg.AI.GLOBAL_DAILY} vượt RPD ${hm.rpd} của '${cfg.AI.GEMINI_MODEL}'. `
        + 'Trần tự đặt phải nằm DƯỚI trần thật thì mới có tác dụng bảo hiểm.');
});

test('chuỗi dự phòng không chứa bí danh trỏ về chính model chính', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'lib', 'ai', 'gemini.js'), 'utf8');
    // Lấy phần khai báo candidates
    const m = src.match(/const candidates = \[([\s\S]*?)\]/);
    assert.ok(m, 'Không đọc được mảng candidates — test cần cập nhật.');

    assert.ok(!m[1].includes('gemini-flash-lite-latest'),
        '`gemini-flash-lite-latest` là BÍ DANH của gemini-3.5-flash-lite (đã hỏi API: modelVersion '
        + 'trả về đúng tên đó). Nó dùng chung hạn mức với model chính nên không phải cửa lui — '
        + 'bậc 1 dính 429 thì nó dính ngay, chỉ tốn thêm thời gian chờ.');
});

test('cạn hạn mức thì KHÔNG lui sang model dự phòng', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'lib', 'ai', 'gemini.js'), 'utf8');

    const i = src.indexOf('const canHanMuc');
    assert.ok(i !== -1, 'Mất nhánh phân biệt lỗi cạn hạn mức trong gemini.js.');

    const doan = src.slice(i, i + 420);
    assert.ok(/429/.test(doan) && /RESOURCE_EXHAUSTED/.test(doan),
        'Nhánh cạn hạn mức phải nhận ra cả mã 429 lẫn RESOURCE_EXHAUSTED.');

    // Kiểm ĐÚNG câu điều kiện, không chỉ kiểm mấy chữ quanh đó.
    //
    // Bản đầu của test này chỉ dò chuỗi trong `doan`, nên đổi `if (canHanMuc)` thành
    // `if (false)` vẫn xanh — tức nó đóng dấu khống. Đo lại ngày 2026-08-23 mới lộ ra.
    assert.ok(/\n\s*if \(canHanMuc\) \{/.test(doan),
        'Mất câu `if (canHanMuc) {`. Biến vẫn được tính nhưng không còn ai dùng thì nhánh này '
        + 'không bao giờ chạy, và 429 lại rơi xuống `isModelError` để lui sang model dự phòng.');

    assert.ok(/throw err;/.test(doan),
        'Cạn hạn mức phải NÉM LỖI ngay, không `continue` sang model dự phòng — model dự phòng '
        + 'có RPD 20 so với 500 của model chính, lui sang đó là đổi 429 này lấy 429 khác.');

    // Nhánh này phải nằm TRƯỚC nhánh isModelError, nếu không nó không bao giờ chạy.
    const j = src.indexOf('if (isModelError)');
    assert.ok(j > i, 'Nhánh cạn hạn mức phải đứng TRƯỚC `if (isModelError)`, nếu không 429 sẽ '
        + 'bị nhánh kia nuốt và vẫn lui sang model dự phòng như cũ.');
});
