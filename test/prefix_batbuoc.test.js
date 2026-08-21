// ============================================================
// test/prefix_batbuoc.test.js — Gác CỬA CHẶN tham số bắt buộc trên đường prefix.
//
// VÌ SAO CÓ: Discord ép option `required` ở phía client cho slash command. Đường `w!`
// KHÔNG đi qua Discord nên không ai ép. Thiếu token -> `getUser()` trả null -> lệnh deref
// là nổ, và người dùng chỉ nhận một câu báo lỗi chung.
//
// Đã xảy ra thật trên prod 21-08-2026:
//     Lỗi prefix w!eco-admin: TypeError: Cannot read properties of null (reading 'id')
//         at Object.execute (.../eco-admin.js:246:99)
//
// Audit cùng ngày: 88/209 đơn vị có option bắt buộc; 4 chỗ deref thẳng không kiểm null
// (clan.js:82, clan.js:163, ship.js:33, eco-admin.js:244).
//
// Gate này chốt hai vế:
//   · shim PHẢI phát hiện được option bắt buộc còn rỗng
//   · messageCreate PHẢI chặn trước `execute()`, không để lệnh tự nổ
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder } = require('discord.js');
const { buildPrefixInteraction } = require('../src/lib/prefixShim');
const { thieuBatBuoc, cuPhapDonVi, buildUsage } = require('../src/lib/cuPhap');

const msg = {
    author: { id: 'u1', username: 'tester' },
    member: null, guild: null, guildId: null, channelId: 'c1',
    channel: { send: async () => ({}), sendTyping: async () => {} },
    client: { users: { fetch: async () => null } },
    mentions: { users: { first: () => null }, channels: { first: () => null }, roles: { first: () => null } },
    reply: async () => ({ edit: async () => ({}) }),
};

const cmdThu = {
    data: new SlashCommandBuilder().setName('thu').setDescription('lệnh thử')
        .addSubcommand(s => s.setName('ban').setDescription('thử')
            .addUserOption(o => o.setName('nguoi').setDescription('ai').setRequired(true))
            .addIntegerOption(o => o.setName('tien').setDescription('bao nhiêu').setRequired(true).setMinValue(1))
            .addStringOption(o => o.setName('ghichu').setDescription('tuỳ chọn'))),
};

test('shim: thiếu CẢ HAI tham số bắt buộc -> báo đủ tên cả hai', async () => {
    const it = await buildPrefixInteraction(msg, cmdThu, ['ban']);
    assert.deepStrictEqual(it.thieuBatBuoc, ['nguoi', 'tien']);
});

test('shim: option TUỲ CHỌN thiếu thì KHÔNG bị tính là thiếu', async () => {
    // Có đủ hai bắt buộc, riêng `ghichu` bỏ trống -> phải rỗng, không được chặn oan.
    const msgCoNguoi = { ...msg, mentions: { ...msg.mentions, users: { first: () => ({ id: 'u9' }) } } };
    const it = await buildPrefixInteraction(msgCoNguoi, cmdThu, ['ban', '<@u9>', '500']);
    assert.deepStrictEqual(it.thieuBatBuoc, [], 'chặn oan còn tệ hơn không chặn — người dùng gõ đúng mà bị từ chối');
});

test('shim: giá trị NGOÀI choices cũng tính là thiếu (không lọt xuống lệnh)', async () => {
    const c = {
        data: new SlashCommandBuilder().setName('t2').setDescription('x')
            .addStringOption(o => o.setName('loai').setDescription('l').setRequired(true)
                .addChoices({ name: 'A', value: 'a' }, { name: 'B', value: 'b' })),
    };
    const it = await buildPrefixInteraction(msg, c, ['zzz']);
    assert.deepStrictEqual(it.thieuBatBuoc, ['loai'],
        'giá trị ngoài danh sách bị parseOptions bỏ -> phải coi là thiếu, nếu không lệnh nhận null mà tưởng có');
});

test('cú pháp: chuỗi trả về người dùng có đủ tham số và đúng tiền tố', () => {
    const j = cmdThu.data.toJSON();
    const s = cuPhapDonVi(j, 'ban', 'w!');
    assert.match(s, /^w!thu ban /);
    assert.ok(s.includes('<nguoi>') && s.includes('<tien>'), 'thiếu tên tham số thì câu chỉ dẫn vô dụng: ' + s);
    assert.ok(s.includes('[ghichu]'), 'phải phân biệt bắt buộc <> với tuỳ chọn []: ' + s);
});

// ── GATE 1: mọi đơn vị có option bắt buộc đều phải phát hiện được khi gõ trống ──
function duyet(d, o = []) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) duyet(p, o); else if (e.name.endsWith('.js')) o.push(p);
    }
    return o;
}

test('gate: 100% đơn vị có option bắt buộc đều bị phát hiện khi gõ thiếu', async () => {
    const goc = path.join(__dirname, '..', 'src', 'commands');
    const sot = [];
    let daKiem = 0;

    for (const f of duyet(goc)) {
        let m; try { m = require(f); } catch { continue; }
        if (!m?.data?.toJSON) continue;
        const j = m.data.toJSON();
        if (!j.name) continue;

        const subs = (j.options || []).filter(o => o.type === 1);
        const dv = subs.length
            ? subs.map(s => ({ sub: s.name, opts: s.options || [] }))
            : [{ sub: null, opts: (j.options || []).filter(o => o.type !== 1 && o.type !== 2) }];

        for (const u of dv) {
            const bb = u.opts.filter(o => o.required).map(o => o.name);
            if (!bb.length) continue;
            daKiem++;
            // Mô phỏng người dùng gõ `w!<lệnh> [sub]` rồi thôi.
            const parsed = { strings: {}, integers: {}, booleans: {}, users: {}, members: {}, channels: {}, roles: {} };
            const thieu = thieuBatBuoc(u.opts, parsed);
            if (thieu.length !== bb.length) {
                sot.push(`/${j.name}${u.sub ? ' ' + u.sub : ''}: bắt buộc [${bb}] nhưng chỉ phát hiện [${thieu}]`);
            }
        }
    }

    assert.ok(daKiem >= 80, `Chỉ kiểm được ${daKiem} đơn vị — audit 21-08 đếm 88. Test cần cập nhật.`);
    assert.deepStrictEqual(sot, [], 'Có đơn vị mà cửa chặn không nhìn thấy tham số thiếu.');
});

// ── GATE 2: messageCreate phải chặn TRƯỚC execute() ──
test('gate: messageCreate chặn trước command.execute(), không phải sau', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'events', 'messageCreate.js'), 'utf8');
    const iExec = src.indexOf('await command.execute(shim)');
    assert.ok(iExec !== -1, 'Không tìm thấy chỗ gọi command.execute(shim) — test cần cập nhật.');

    // Kiểm ĐÚNG BIỂU THỨC ĐIỀU KIỆN, không phải "có nhắc tới tên biến".
    // Bản đầu của gate này chỉ làm `indexOf('shim.thieuBatBuoc')`, nên khi thử làm hỏng
    // bằng cách đổi điều kiện thành `if (false)` thì gate VẪN XANH — tên biến còn nằm
    // trong thân khối. Một cổng chứng minh nhầm thứ còn tệ hơn không có cổng.
    const dieuKien = 'if (shim.thieuBatBuoc && shim.thieuBatBuoc.length) {';
    const iChan = src.indexOf(dieuKien);
    assert.ok(iChan !== -1,
        'Không còn điều kiện `' + dieuKien + '` — cửa chặn tham số bắt buộc đã bị gỡ hoặc viết lại.');
    assert.ok(iChan < iExec,
        'Cửa chặn nằm SAU execute() thì vô nghĩa: lệnh đã nổ trước khi kịp chỉ đường.');

    // Trong khối đó phải có `return;` — nếu không, chặn xong vẫn chạy tiếp xuống execute().
    const khoi = src.slice(iChan, iExec);
    assert.match(khoi, /\breturn;/,
        'Khối chặn không `return;` — báo cú pháp xong lệnh vẫn chạy và vẫn nổ như cũ.');
});

// ── GATE 3: /help dạy đúng — dòng prefix phải mang đủ tham số ──
test('gate: /help dựng dòng prefix bằng cùng hàm với dòng slash', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'utility', 'help.js'), 'utf8');
    assert.match(src, /buildUsage\(json, config\.PREFIX/,
        'Dòng "Prefix" của /help không còn dùng buildUsage — nó sẽ lại bỏ mất tham số như trước 21-08.');

    // Và chữ ký prefix phải thật sự chứa tên tham số bắt buộc.
    const j = cmdThu.data.toJSON();
    const u = buildUsage(j, 'w!', true);
    assert.ok(u.includes('<nguoi>') && u.includes('<tien>'), u);
});

// ============================================================
// ĐỢT 3 — `w!heo <sub>` / `w!cay <sub>` phải nói cùng tiếng với slash
//
// Từ vựng gõ tắt của heo/cây KHÔNG trùng tên subcommand (`/heo mua` <-> `w!muaheo`).
// `handlePigPrefix` là `switch (cmd)` với `default: return`, nên `w!heo mua` rơi vào
// `case 'heo'` và trả TRẠNG THÁI — token `mua` bị nuốt, không lỗi, không cảnh báo.
// Mà `/help` hiện `/heo mua` ngay trên dòng "cũng gõ được w!heo", nên người dùng thử
// `w!heo mua` là hoàn toàn hợp lý.
// ============================================================
test('gate: mọi sub của /heo và /trongcay đều gọi được bằng w!<lệnh> <sub>', () => {
    const cap = [
        { lenh: 'games/heo.js', lib: '../src/lib/pig.js', vao: 'heo' },
        { lenh: 'games/trongcay.js', lib: '../src/lib/plant.js', vao: 'cay' },
    ];
    for (const c of cap) {
        const j = require(path.join(__dirname, '..', 'src', 'commands', c.lenh)).data.toJSON();
        const subs = (j.options || []).filter(o => o.type === 1).map(o => o.name);
        const src = fs.readFileSync(path.join(__dirname, c.lib), 'utf8');

        const i = src.indexOf('const SUB_SANG_TAT = {');
        assert.ok(i !== -1, `${c.lib}: không còn bảng SUB_SANG_TAT — w!${c.vao} <sub> sẽ lại nuốt token.`);
        const bang = eval('(' + src.slice(i + 'const SUB_SANG_TAT = '.length, src.indexOf('\n};', i) + 2) + ')');

        const sot = subs.filter(s => !bang[s]);
        assert.deepStrictEqual(sot, [],
            `/${j.name}: sub [${sot}] không ánh xạ được sang tên gõ tắt, nên w!${c.vao} ${sot[0]} sẽ sai việc.`);

        // Và phải có nhánh gợi ý cho token lạ — im lặng trả trạng thái là kiểu vỡ cũ.
        assert.match(src, /common\.sub_khong_biet/,
            `${c.lib}: token lạ vẫn rơi về trạng thái thay vì gợi ý.`);
    }
});

test('gate: /help hiện được tên gõ tắt (24 tên trước đây vô hình)', () => {
    const { tenTatCua } = require('../src/lib/prefixTen');
    // Ba lệnh đại diện ba nguồn tên: handler riêng, alias {cmd,sub}, alias đổi tên.
    assert.ok(tenTatCua('heo').includes('muaheo'), 'mất tên gõ tắt của heo');
    assert.ok(tenTatCua('bank').includes('bal'), 'mất alias bank');
    assert.ok(tenTatCua('nghingoi').includes('ngu'), 'mất alias đổi tên');
    assert.deepStrictEqual(tenTatCua('work'), [], 'lệnh không có tên tắt thì phải trả rỗng, không bịa');

    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'utility', 'help.js'), 'utf8');
    assert.match(src, /tenTatCua\(json\.name\)/, '/help không còn hiện mục Gõ tắt.');
});
