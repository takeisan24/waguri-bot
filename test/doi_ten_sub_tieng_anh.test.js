// ============================================================
// test/doi_ten_sub_tieng_anh.test.js — bề mặt lệnh CHỈ dùng tên tiếng Anh, và tên cũ vẫn gõ
// được ở đường prefix.
//
// CHUYỆN ĐÃ XẢY RA: đợt chuẩn hoá 72 lệnh (v2.6.0) đổi tên LỆNH sang tiếng Anh nhưng để
// nguyên tên SUBCOMMAND tiếng Việt (`/bakery xem`, `/farm muagiong`, `/bank gui`). Suốt thời
// gian đó `/help` lại dạy người chơi tên tiếng Anh không tồn tại, và 135 khoá localizer
// thành khoá chết. Đợt 2026-10-23 đổi nốt 23 sub + 9 option.
//
// HỢP ĐỒNG mà tệp này khoá — ba điều, điều thứ ba dễ bị quên nhất:
//   1. Không còn tên tiếng Việt nào trên bề mặt Discord (sub + option).
//   2. Tên lệnh KHÔNG đổi theo ngôn ngữ: `commandLocalizer` ghi đè `name_localizations`
//      bằng cùng một tên tiếng Anh cho mọi locale. Chỉ MÔ TẢ và nội dung là dịch.
//   3. Tên cũ vẫn gõ được ở đường prefix (`w!tiembanh xem`). Người quen tay gõ hằng ngày;
//      mất nó là lặp lại đúng sự cố 2026-10-21 ("tìm 10 phút mới thấy /bakery").
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { SUB_ALIASES } = require('../src/lib/prefixTen');
const L = require('../src/lib/commandLocalizer');

function napLenhThat() {
    const ra = [];
    const di = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return di(p);
        if (!e.name.endsWith('.js')) return;
        const m = require(p);
        if (m && m.data && typeof m.data.toJSON === 'function') ra.push(m.data.toJSON());
    });
    di(path.join(ROOT, 'src', 'commands'));
    return ra;
}
const LENH = napLenhThat();

// Tên tiếng Việt ĐÃ từng có trên bề mặt. Danh sách đóng — nếu một cái quay lại, cổng đỏ.
const TEN_VIET_CU = [
    'xem', 'mo', 'nhapnl', 'thu', 'thue', 'sathai', 'trangtri', 'nangcap', 'donhang', 'giaodon',
    'gui', 'rut', 'di-choi', 'tang-qua',
    'muagiong', 'tuoi', 'bonphan', 'thuhoach', 'hoisinh', 'phacay', 'trom',
    'cho', 'duyet',
    'loai', 'sl', 'nhan_vien', 'vat_pham', 'stt', 'phamvi', 'ma', 'anh',
];

test('phép đo tự kiểm: có nạp được lệnh thật', () => {
    assert.ok(LENH.length >= 70, `chỉ nạp được ${LENH.length} lệnh — phép kiểm dưới vô nghĩa`);
});

test('không còn tên tiếng Việt nào trên bề mặt Discord (sub + option)', () => {
    const con = [];
    for (const j of LENH) {
        const quet = (os, duong) => (os || []).forEach((o) => {
            if (TEN_VIET_CU.includes(o.name)) con.push(`${duong}.${o.name}`);
            if (o.type === 1 || o.type === 2) quet(o.options, `${duong}.${o.name}`);
        });
        quet(j.options, `/${j.name}`);
    }
    assert.deepStrictEqual(con, [],
        `tên tiếng Việt quay lại bề mặt lệnh: ${con.join(', ')}`);
});

test('TÊN không đổi theo ngôn ngữ — chỉ mô tả mới dịch', () => {
    // Đây là yêu cầu rõ ràng của chủ repo: đổi ngôn ngữ thì CHỈ mô tả và nội dung đổi,
    // câu lệnh người ta gõ thì giữ nguyên.
    for (const j of LENH) {
        // Context menu (type 2/3) là NGOẠI LỆ: tên của nó chính là chữ hiển thị trong menu
        // chuột phải, không ai gõ -> được dịch. Kiểm riêng ở phép kiểm dưới.
        if (j.type === 2 || j.type === 3) continue;

        const ban = JSON.parse(JSON.stringify(j));
        L.localizeCommandJSON(ban);
        const nl = ban.name_localizations || {};
        for (const [loc, ten] of Object.entries(nl)) {
            assert.strictEqual(ten, j.name,
                `/${j.name}: name_localizations.${loc} = "${ten}" — tên lệnh KHÔNG được đổi `
                + 'theo ngôn ngữ, nếu không mỗi locale gõ một tên khác nhau');
        }
        // mô tả thì PHẢI có cả hai ngôn ngữ
        const dl = ban.description_localizations || {};
        assert.ok(dl.vi, `/${j.name}: thiếu mô tả tiếng Việt`);
    }
});

test('context menu: tên đăng ký là tiếng Anh, nhưng HIỆN theo ngôn ngữ', () => {
    const ctx = LENH.filter((j) => j.type === 2 || j.type === 3);
    assert.ok(ctx.length >= 1, 'không thấy lệnh context menu nào — phép kiểm này vô nghĩa');
    for (const j of ctx) {
        // tên đăng ký không được chứa dấu tiếng Việt: người dùng EN click chuột phải sẽ đọc nó
        // nếu bảng dịch thiếu, nên tên GỐC phải là tiếng Anh.
        assert.ok(!/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(j.name),
            `context menu "${j.name}" đăng ký bằng tiếng Việt — người dùng EN đọc phải nó`);

        const ban = JSON.parse(JSON.stringify(j));
        L.localizeCommandJSON(ban);
        const nl = ban.name_localizations || {};
        assert.ok(nl.vi && nl['en-US'],
            `"${j.name}": thiếu bản dịch tên — thêm vào CONTEXT_MENU_NAMES ở commandLocalizer`);
        assert.notStrictEqual(nl.vi, nl['en-US'],
            `"${j.name}": bản vi và en giống nhau — nếu cố ý thì ghi rõ lý do, còn không thì `
            + 'một trong hai locale đang đọc sai ngôn ngữ');
        assert.strictEqual(nl['en-US'], j.name, `"${j.name}": bản en phải trùng tên đăng ký`);
    }
});

test('mọi tên sub cũ đều có alias prefix trỏ tới tên mới có thật', () => {
    const subTheoLenh = {};
    for (const j of LENH) {
        for (const o of j.options || []) {
            if (o.type === 1) (subTheoLenh[o.name] = subTheoLenh[o.name] || []).push(j.name);
            if (o.type === 2) for (const x of o.options || []) (subTheoLenh[x.name] = subTheoLenh[x.name] || []).push(j.name);
        }
    }
    const xau = [];
    for (const [cu, moi] of Object.entries(SUB_ALIASES)) {
        if (!subTheoLenh[moi]) xau.push(`${cu} -> ${moi} (không lệnh nào có sub tên đó)`);
    }
    assert.deepStrictEqual(xau, [], `alias prefix trỏ vào hư không:\n  ${xau.join('\n  ')}`);

    // 23 sub đã đổi tên phải có mặt trong bảng alias — thiếu cái nào là người quen tay hụt lệnh
    const PHAI_CO = ['xem', 'mo', 'nhapnl', 'thu', 'thue', 'sathai', 'trangtri', 'nangcap',
        'donhang', 'giaodon', 'gui', 'rut', 'di-choi', 'tang-qua', 'muagiong', 'tuoi',
        'bonphan', 'thuhoach', 'hoisinh', 'phacay', 'trom', 'cho', 'duyet'];
    const thieu = PHAI_CO.filter((x) => !SUB_ALIASES[x]);
    assert.deepStrictEqual(thieu, [],
        `thiếu alias prefix cho tên cũ: ${thieu.join(', ')} -> \`w!tiembanh <tên đó>\` sẽ im lặng`);
});

test('không có tên sub cũ nào trùng giữa hai lệnh khác nhau', () => {
    // SUB_ALIASES là bảng PHẲNG (một khoá cho mọi lệnh). Nếu hai lệnh từng có cùng tên sub
    // tiếng Việt mà map sang hai tên mới khác nhau thì bảng phẳng không đủ.
    const nguon = {
        bakery: ['xem', 'mo', 'nhapnl', 'thu', 'thue', 'sathai', 'trangtri', 'nangcap', 'donhang', 'giaodon'],
        bank: ['gui', 'rut'],
        dating: ['di-choi', 'tang-qua'],
        farm: ['muagiong', 'tuoi', 'bonphan', 'thuhoach', 'hoisinh', 'phacay', 'trom'],
        'premium-admin': ['cho', 'duyet'],
    };
    const dem = {};
    for (const v of Object.values(nguon)) for (const x of v) dem[x] = (dem[x] || 0) + 1;
    const trung = Object.entries(dem).filter(([, n]) => n > 1).map(([k]) => k);
    assert.deepStrictEqual(trung, [],
        `tên sub cũ trùng giữa hai lệnh: ${trung.join(', ')} -> bảng alias phẳng không đủ, `
        + 'phải khoá theo từng lệnh');
});

test('đường prefix: w!tiembanh <tên cũ> vẫn ra đúng sub mới', async () => {
    const { buildPrefixInteraction } = require('../src/lib/prefixShim');
    const bakery = LENH.find((j) => j.name === 'bakery');
    assert.ok(bakery, 'không thấy /bakery');

    const giaTin = { author: { id: 'u1', bot: false }, guildId: 'g1', channel: {}, client: {},
        guild: null, reply: async () => ({}) };
    for (const [cu, moi] of [['xem', 'view'], ['nhapnl', 'stock'], ['thu', 'collect'], ['giaodon', 'deliver']]) {
        const it = await buildPrefixInteraction(giaTin, { data: { toJSON: () => bakery } }, [cu]);
        assert.strictEqual(it.options.getSubcommand(), moi,
            `w!tiembanh ${cu} phải ra sub "${moi}", nhận "${it.options.getSubcommand()}"`);
    }
    // tên MỚI cũng phải gõ được ở đường prefix
    const it2 = await buildPrefixInteraction(giaTin, { data: { toJSON: () => bakery } }, ['view']);
    assert.strictEqual(it2.options.getSubcommand(), 'view');
});
