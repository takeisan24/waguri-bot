// ============================================================
// test/help_nhan_nhom_khop_chi_so.test.js — nhãn nhóm `/help` phải khớp ĐÚNG nhóm nó mở.
//
// LỖI ĐÃ CHẠY TRÊN PROD: select menu lấy nhãn bằng CHỈ SỐ —
// `t(locale, \`commands.help.categories.${idx}.name\`)` — trong khi mảng i18n có **11 mục cho
// 9 nhóm thật** và còn giữ tên của bố cục cũ ("🎲 Trò chơi", "🎰 Cược & may rủi",
// "🏰 Bang hội"). Từ chỉ số 2 trở đi nhãn TRƯỢT một bậc trở lên:
//
//     người bấm "⚙️ Quản trị (cần quyền)"  ->  mở nhóm "🏆 Khác"
//     người bấm "🎲 Trò chơi"              ->  mở nhóm "💸 Giao dịch & Tín dụng"
//
// Không cổng nào bắt được: `check-i18n-coverage` chỉ so KHOÁ giữa vi.json và en.json, và cả
// hai tệp đều lệch GIỐNG NHAU nên nó báo xanh. `check-help-sync` chỉ kiểm danh sách LỆNH.
//
// Gốc rễ là nối bằng chỉ số mảng mà không có gì ràng hai đầu. Cổng này là cái ràng đó.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');

const fs = require('fs');
const path = require('path');

const help = require('../src/commands/utility/help.js');
const { t } = require('../src/lib/i18n');

const NGON_NGU = ['vi', 'en'];

test('số nhãn i18n đúng bằng số nhóm thật', () => {
    for (const ngn of NGON_NGU) {
        const L = require(`../src/locales/${ngn}.json`);
        const n = Object.keys(L.commands.help.categories || {}).length;
        assert.strictEqual(n, help.CATEGORIES.length,
            `${ngn}.json có ${n} nhãn cho ${help.CATEGORIES.length} nhóm — select menu lấy nhãn `
            + 'theo CHỈ SỐ nên thừa/thiếu một mục là mọi nhãn phía sau trượt bậc');
    }
});

test('nhãn tiếng Việt khớp TỪNG CHỮ với tên nhóm trong help.js', () => {
    // help.js là nguồn sự thật: nó quyết định nhóm nào chứa lệnh nào.
    const L = require('../src/locales/vi.json');
    const lech = [];
    help.CATEGORIES.forEach((cat, i) => {
        const nhan = (L.commands.help.categories[String(i)] || {}).name;
        if (nhan !== cat.name) lech.push(`[${i}] nhãn "${nhan}" nhưng nhóm là "${cat.name}"`);
    });
    assert.deepStrictEqual(lech, [], `nhãn trượt nhóm:\n  ${lech.join('\n  ')}`);
});

test('mọi nhãn đều có THẬT trong cả hai tệp locale', () => {
    const xau = [];
    for (const ngn of NGON_NGU) {
        const L = JSON.parse(fs.readFileSync(
            path.join(__dirname, '..', 'src', 'locales', `${ngn}.json`), 'utf8'));
        help.CATEGORIES.forEach((cat, i) => {
            // Đọc thẳng JSON: `t()` rơi về bản Việt khi thiếu khoá EN, nên kiểm qua t() thì
            // nhãn tiếng Việt lọt vào bản Anh mà vẫn xanh.
            const s = (L.commands.help.categories[String(i)] || {}).name;
            if (typeof s !== 'string' || !s.trim()) xau.push(`${ngn}[${i}] -> ${s}`);
        });
        // t() cũng không được trả ra chính chuỗi khoá cho người chơi đọc.
        help.CATEGORIES.forEach((cat, i) => {
            const khoa = `commands.help.categories.${i}.name`;
            if (t(ngn, khoa) === khoa) xau.push(`${ngn}[${i}] t() trả ra chuỗi khoá`);
        });
    }
    assert.deepStrictEqual(xau, [], `nhãn thiếu:\n  ${xau.join('\n  ')}`);
});

test('không nhóm nào rỗng, và không lệnh nào nằm hai nhóm', () => {
    const tat = [];
    help.CATEGORIES.forEach((cat, i) => {
        assert.ok(Array.isArray(cat.cmds) && cat.cmds.length > 0,
            `nhóm [${i}] "${cat.name}" rỗng — select menu sẽ mở ra một embed trống`);
        cat.cmds.forEach((c) => tat.push(c[0]));
    });
    const trung = tat.filter((x, i) => tat.indexOf(x) !== i);
    assert.deepStrictEqual(trung, [], `lệnh nằm ở hai nhóm: ${trung.join(', ')}`);
});

test('/start nằm ở nhóm ĐẦU — lệnh người mới nên gõ trước tiên', () => {
    const dau = help.CATEGORIES[0].cmds.map((c) => c[0]);
    assert.ok(dau.includes('start'),
        `/start không ở nhóm đầu (nhóm đầu: ${dau.join(', ')}). Trước đây nó nằm cuối nhóm `
        + '"🏆 Khác" nên người mới mở /help gần như không thấy nó.');
});

test('cẩm nang web có đường tới được từ trong bot', () => {
    // 766 dòng ở `web/src/app/wiki/page.tsx` mà `grep -rn wiki src/` từng trả về 0 kết quả.
    const fs = require('fs');
    const path = require('path');
    for (const tep of ['utility/help.js', 'utility/start.js']) {
        const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', tep), 'utf8');
        assert.match(js, /WEB_URL\}\/wiki/,
            `${tep} mất liên kết cẩm nang — nếu bot không trỏ tới, 766 dòng cẩm nang là chữ chết`);
    }
    // ĐỌC THẲNG tệp JSON, không qua t(): `t()` tự rơi về bản Việt khi thiếu khoá tiếng Anh,
    // nên người dùng EN đọc phải tiếng Việt mà phép kiểm qua t() vẫn xanh. Phép bẻ ngược số 9
    // đã chứng minh đúng điều đó.
    for (const ngn of NGON_NGU) {
        const L = JSON.parse(fs.readFileSync(
            path.join(__dirname, '..', 'src', 'locales', `${ngn}.json`), 'utf8'));
        const s = L.common && L.common.btn_wiki;
        assert.ok(typeof s === 'string' && s.trim(),
            `${ngn}.json thiếu common.btn_wiki — t() sẽ rơi về bản Việt và người dùng ${ngn} `
            + 'đọc phải nhãn tiếng Việt');
    }
});

test('gợi ý lên cấp chỉ dùng mốc có thật', () => {
    // `ctaKeyFor()` từng dừng ở cấp 5. Hai mốc thêm vào phải khớp dữ liệu thật, không bịa.
    const fs = require('fs');
    const path = require('path');
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'levelAnnounce.js'), 'utf8');
    const caps = [...js.matchAll(/level === (\d+)\) return 'common\.levelup\.([a-z_]+)'/g)]
        .map((m) => [Number(m[1]), m[2]]);

    const config = require('../src/config');
    const theoCap = Object.fromEntries(caps);
    assert.ok(theoCap[config.PRESTIGE.REQ_LEVEL],
        `thiếu gợi ý ở cấp ${config.PRESTIGE.REQ_LEVEL} (PRESTIGE.REQ_LEVEL) — đúng lúc người `
        + 'chơi mở được /prestige mà không ai nói cho họ biết');

    // Đọc thẳng JSON — xem chú thích ở phép kiểm cẩm nang về việc t() rơi về bản Việt.
    for (const [cap, khoa] of caps) {
        for (const ngn of NGON_NGU) {
            const L = JSON.parse(fs.readFileSync(
                path.join(__dirname, '..', 'src', 'locales', `${ngn}.json`), 'utf8'));
            const s = L.common.levelup && L.common.levelup[khoa];
            assert.ok(typeof s === 'string' && s.trim(),
                `cấp ${cap}: ${ngn}.json thiếu common.levelup.${khoa}`);
        }
    }
});
