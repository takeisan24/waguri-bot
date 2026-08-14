// ============================================================
// test/prefix_shim.test.js — Cầu chì cho đường PREFIX
//
// VÌ SAO CẦN: `parseOptions` trước đây chỉ làm `Number(raw)`, nên mọi
// `.setMinValue()` / `.setMaxValue()` mà lệnh khai báo là VÔ NGHĨA khi gọi qua
// prefix — Discord chặn ở phía client, còn `w!lệnh` không hề đi qua Discord.
// Đó là nguyên nhân gốc của HAI lỗ hổng thật:
//   · `w!market list go 500 0`      -> qty 0  -> RPC từ chối nhưng lệnh báo THÀNH CÔNG
//   · `w!market list go -1000000 1` -> giá ÂM -> market_buy làm `wallet - (-1000000)`
//     tức phép CỘNG: +50.000 xu sinh ra từ không khí mỗi lần, lặp vô hạn.
//
// Test này chốt hợp đồng: giá trị số đi qua prefix KHÔNG BAO GIỜ được nằm ngoài
// biên mà slash command đã khai báo. Chạy thuần, không cần DB.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { SlashCommandBuilder } = require('discord.js');
const { buildPrefixInteraction } = require('../src/lib/prefixShim');

// Message giả tối thiểu — parseOptions chỉ cần author/mentions/guild.
const fakeMessage = {
    author: { id: 'u1', username: 'tester' },
    member: null,
    guild: null,
    guildId: null,
    channel: { send: async () => ({}), sendTyping: async () => {} },
    client: { users: { fetch: async () => null } },
    mentions: { users: { first: () => null }, channels: { first: () => null } },
    reply: async () => ({ edit: async () => ({}) }),
};

const cmd = {
    data: new SlashCommandBuilder()
        .setName('thu')
        .setDescription('lệnh thử')
        .addSubcommand(s => s.setName('ban')
            .setDescription('thử')
            .addStringOption(o => o.setName('item').setDescription('món').setRequired(true))
            .addIntegerOption(o => o.setName('gia').setDescription('giá').setRequired(true).setMinValue(1))
            .addIntegerOption(o => o.setName('sl').setDescription('số lượng').setMinValue(1).setMaxValue(99))),
};

const parse = async (tokens) => {
    const it = await buildPrefixInteraction(fakeMessage, cmd, tokens);
    return {
        sub: it.options.getSubcommand(),
        item: it.options.getString('item'),
        gia: it.options.getInteger('gia'),
        sl: it.options.getInteger('sl'),
    };
};

test('prefix: giá trị hợp lệ đi qua nguyên vẹn', async () => {
    const r = await parse(['ban', 'go', '500', '3']);
    assert.strictEqual(r.sub, 'ban');
    assert.strictEqual(r.item, 'go');
    assert.strictEqual(r.gia, 500);
    assert.strictEqual(r.sl, 3);
});

test('prefix: GIÁ ÂM bị kẹp về minValue (chặn máy in tiền qua market_buy)', async () => {
    const r = await parse(['ban', 'go', '-1000000', '1']);
    assert.strictEqual(r.gia, 1,
        'giá âm lọt xuống RPC = wallet - (số âm) = phép CỘNG => in tiền vô hạn');
    assert.ok(r.gia > 0);
});

test('prefix: SỐ LƯỢNG 0 và âm bị kẹp về minValue (chặn báo thành công giả)', async () => {
    assert.strictEqual((await parse(['ban', 'go', '500', '0'])).sl, 1);
    assert.strictEqual((await parse(['ban', 'go', '500', '-7'])).sl, 1);
});

test('prefix: vượt maxValue bị kẹp xuống', async () => {
    assert.strictEqual((await parse(['ban', 'go', '500', '99999'])).sl, 99);
});

test('prefix: chữ / NaN / Infinity -> coi như KHÔNG nhập, không đẩy NaN xuống RPC', async () => {
    assert.strictEqual((await parse(['ban', 'go', 'abc', '2'])).gia, null);
    assert.strictEqual((await parse(['ban', 'go', 'Infinity', '2'])).gia, null,
        'Infinity từng lọt qua guard `<= 0` rồi vỡ ở tầng JSON/RPC');
});

test('prefix: số thực bị cắt về nguyên (Integer đúng kiểu)', async () => {
    assert.strictEqual((await parse(['ban', 'go', '500.9', '2.7'])).sl, 2);
});

test('prefix: giá trị NGOÀI danh sách choices bị loại (chặn bán món ngoài 12 món chợ)', async () => {
    // `/market sell` khai báo 12 món. Qua prefix, `cuoc_sat` từng lọt xuống RPC và được
    // bán ở giá chợ (0,5 × 0,70..1,50) thay vì mức 50% cố định — tới +50% cho MỌI món
    // nếu canh đúng block giá đỉnh.
    const c = {
        data: new SlashCommandBuilder().setName('t3').setDescription('x')
            .addStringOption(o => o.setName('item').setDescription('m').setRequired(true)
                .addChoices({ name: 'Gỗ', value: 'go' }, { name: 'Quặng', value: 'quang_sat' }))
            .addIntegerOption(o => o.setName('amount').setDescription('a').setRequired(true).setMinValue(1)),
    };
    const run = async (tk) => {
        const it = await buildPrefixInteraction(fakeMessage, c, tk);
        return { item: it.options.getString('item'), amount: it.options.getInteger('amount') };
    };
    assert.strictEqual((await run(['go', '5'])).item, 'go', 'giá trị hợp lệ phải đi qua');
    assert.strictEqual((await run(['cuoc_sat', '5'])).item, null, 'món ngoài danh sách phải bị loại');
    assert.strictEqual((await run(['cuoc_sat', '5'])).amount, 5, 'option khác không bị ảnh hưởng');
});

test('prefix: choices dạng SỐ cũng bị ép', async () => {
    const c = {
        data: new SlashCommandBuilder().setName('t4').setDescription('x')
            .addIntegerOption(o => o.setName('slot').setDescription('s').setRequired(true)
                .addChoices({ name: 'Một', value: 1 }, { name: 'Hai', value: 2 })),
    };
    const get = async (tk) => (await buildPrefixInteraction(fakeMessage, c, tk)).options.getInteger('slot');
    assert.strictEqual(await get(['2']), 2);
    assert.strictEqual(await get(['99']), null, 'số ngoài danh sách phải bị loại');
});

test('prefix: option string KHÔNG có choices vẫn gom được chuỗi nhiều từ', async () => {
    // Không được để việc ép choices phá tính năng "option cuối gom hết phần còn lại".
    const c = {
        data: new SlashCommandBuilder().setName('t5').setDescription('x')
            .addStringOption(o => o.setName('noi_dung').setDescription('n').setRequired(true)),
    };
    const it = await buildPrefixInteraction(fakeMessage, c, ['xin', 'chào', 'cậu']);
    assert.strictEqual(it.options.getString('noi_dung'), 'xin chào cậu');
});

test('prefix: chuỗi quá dài bị cắt theo maxLength (/clan create name, /study start title)', async () => {
    const c = {
        data: new SlashCommandBuilder().setName('t6').setDescription('x')
            .addStringOption(o => o.setName('ten').setDescription('t').setRequired(true).setMaxLength(30)),
    };
    const it = await buildPrefixInteraction(fakeMessage, c, ['A'.repeat(500)]);
    assert.strictEqual(it.options.getString('ten').length, 30,
        'tên dài vô hạn lọt vào DB sẽ làm vỡ hiển thị embed');
});

test('prefix: option KHÔNG khai báo biên thì giữ nguyên giá trị (kể cả âm)', async () => {
    // /eco-admin addmoney cố ý cho số âm (trừ tiền) — cầu chì không được phá việc đó.
    const c2 = {
        data: new SlashCommandBuilder().setName('t2').setDescription('x')
            .addIntegerOption(o => o.setName('amount').setDescription('a').setRequired(true)),
    };
    const it = await buildPrefixInteraction(fakeMessage, c2, ['-5000']);
    assert.strictEqual(it.options.getInteger('amount'), -5000);
});
