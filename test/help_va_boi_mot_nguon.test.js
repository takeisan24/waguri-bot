// ============================================================
// test/help_va_boi_mot_nguon.test.js — Đợt 3 spec dọn dẹp: mỗi câu chữ CHỈ một nguồn.
//
// (A) /help — `CATEGORIES` từng mang mô tả ở phần tử thứ hai, mà dòng dựng chuỗi dùng
//     `.map(([c]) => ...)` nên chỉ đọc phần tử ĐẦU. Hai nguồn cho một câu chữ, và nguồn
//     không-ai-đọc thắng ngầm: lúc gỡ, 27/70 mục lệch bản i18n, 4 mục trong số đó lại
//     ĐÚNG hơn bản đang hiển thị (`/market` vẫn ghi "chợ mua bán đồ giữa người chơi" sau
//     khi chợ P2P đã gỡ; `/ticket` ghi "mở kênh riêng tư" dù `create` mở ModalBuilder).
//     Nên cổng này canh HAI chiều: không có mô tả thứ hai trong mảng, VÀ mọi lệnh được
//     nêu đều có khoá i18n thật ở cả hai ngôn ngữ.
//
// (B) /fortune — 6 mảng dự phòng `t(...) || MẢNG` là mã chết, vì cả 6 khoá đều có thật.
//     Gỡ dự phòng đi thì phải có thứ khác báo đỏ khi khoá biến mất — chính là cổng này.
//
//     CẨN THẬN khi mở rộng cổng này sang mẫu `t(...) || '...'` khác: ở `fish.js` nhánh
//     dự phòng là mã SỐNG, không chết. `t()` trả `undefined` (không phải chuỗi khoá) cho
//     `data.items.*` ở bản Việt — vi.json cố ý không dịch nhánh đó — nên `|| 'Cá Tươi'`
//     THỰC SỰ chạy mỗi lần người Việt câu cá. Đừng dọn nó.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const help = require('../src/commands/utility/help.js');
const { t } = require('../src/lib/i18n');

const NGON_NGU = ['vi', 'en'];
const tenLenh = () => help.CATEGORIES.flatMap((n) => (n.cmds || []).map((c) => c[0]));

test('CATEGORIES vẫn ở dạng mảng — check-help-sync lọc bằng Array.isArray(c) && c[0]', () => {
    for (const nhom of help.CATEGORIES) {
        for (const c of nhom.cmds) {
            assert.ok(Array.isArray(c) && typeof c[0] === 'string' && c[0],
                `mục ${JSON.stringify(c)} không còn là mảng có tên -> check-help-sync sẽ bỏ qua nó`);
        }
    }
});

test('CATEGORIES KHÔNG mang mô tả thứ hai (nguồn thứ hai không ai đọc)', () => {
    const co = [];
    for (const nhom of help.CATEGORIES) {
        for (const c of nhom.cmds) if (c.length > 1) co.push(c[0]);
    }
    assert.deepStrictEqual(co, [],
        'help.js đọc `.map(([c]) => ...)` nên phần tử thứ hai là chữ chết và lệch dần: '
        + `${co.join(', ')}. Mô tả thuộc về commands.help.commands.<tên>.`);
});

test('mọi lệnh /help nêu đều có mô tả thật ở CẢ vi và en', () => {
    const thieu = [];
    for (const ten of NGON_NGU) {
        for (const c of tenLenh()) {
            const s = t(ten, `commands.help.commands.${c}`);
            // t() trả về chính chuỗi khoá khi thiếu -> người chơi đọc phải "commands.help…"
            if (typeof s !== 'string' || !s.trim() || s === `commands.help.commands.${c}`) {
                thieu.push(`${ten}:${c}`);
            }
        }
    }
    assert.deepStrictEqual(thieu, [], `thiếu mô tả: ${thieu.join(', ')}`);
});

test('/help không còn nêu lệnh nào đã bị cất kho', () => {
    const thuMuc = path.join(__dirname, '..', 'src', 'commands');
    const coThat = new Set();
    const di = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return di(p);
        if (!e.name.endsWith('.js')) return;
        const m = /\.setName\('([a-z0-9_-]+)'\)/.exec(fs.readFileSync(p, 'utf8'));
        if (m) coThat.add(m[1]);
    });
    di(thuMuc);
    const chet = tenLenh().filter((c) => !coThat.has(c));
    assert.deepStrictEqual(chet, [], `/help nêu lệnh không tồn tại: ${chet.join(', ')}`);
});

test('/fortune: 6 bộ chữ phải là MẢNG CHUỖI thật ở cả hai ngôn ngữ', () => {
    // Đây là thứ thay thế 6 mảng dự phòng đã gỡ. Thiếu khoá thì `t()` trả CHUỖI, và
    // `pick(arr, n)` sẽ lấy một KÝ TỰ của chuỗi đó làm lời bói — sai mà không ai thấy.
    const BO = ['horoscopes', 'luck_levels', 'thaydo_prophecies',
        'daily_love_fortunes', 'daily_money_fortunes', 'daily_advice'];
    const xau = [];
    for (const ten of NGON_NGU) {
        for (const k of BO) {
            const r = t(ten, `commands.boi.${k}`);
            if (!Array.isArray(r) || r.length === 0 || !r.every((x) => typeof x === 'string' && x.trim())) {
                xau.push(`${ten}:${k} (${Array.isArray(r) ? `mảng ${r.length}` : typeof r})`);
            }
        }
    }
    assert.deepStrictEqual(xau, [], `không phải mảng chuỗi: ${xau.join(', ')}`);
});

test('/fortune không còn nhánh dự phòng chết, và vẫn nạp được', () => {
    const cmd = require('../src/commands/fun/fortune.js');
    assert.ok(cmd.data && typeof cmd.execute === 'function');
    const js = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'commands', 'fun', 'fortune.js'), 'utf8');
    const con = [...js.matchAll(/t\(locale, 'commands\.boi\.[a-z_]+'\) \|\| [A-Z_]+/g)].map((m) => m[0]);
    assert.deepStrictEqual(con, [],
        `t() trả chuỗi khoá (truthy) khi thiếu nên nhánh này không bao giờ chạy: ${con.join(', ')}`);
});

test('fish.js GIỮ nhánh dự phòng — ở đó nó là mã SỐNG, không chết', () => {
    // t() trả `undefined` cho `data.items.*` ở bản Việt (vi.json cố ý không dịch nhánh đó),
    // nên nhánh `||` thực sự chạy. Gỡ nó đi là người Việt câu được con cá tên "undefined".
    assert.strictEqual(t('vi', 'data.items.ca_tuoi.name'), undefined,
        'nếu vi.json đã dịch data.items.* thì xét lại chú thích này');
    const js = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'commands', 'economy', 'fish.js'), 'utf8');
    assert.match(js, /t\(locale, 'data\.items\.[a-z_]+\.name'\) \|\| '/,
        'fish.js phải giữ tên dự phòng tiếng Việt — xem chú thích đầu tệp test này');
});
