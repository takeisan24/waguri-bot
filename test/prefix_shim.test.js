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

test('prefix: option KHÔNG khai báo biên thì giữ nguyên giá trị (kể cả âm)', async () => {
    // /eco-admin addmoney cố ý cho số âm (trừ tiền) — cầu chì không được phá việc đó.
    const c2 = {
        data: new SlashCommandBuilder().setName('t2').setDescription('x')
            .addIntegerOption(o => o.setName('amount').setDescription('a').setRequired(true)),
    };
    const it = await buildPrefixInteraction(fakeMessage, c2, ['-5000']);
    assert.strictEqual(it.options.getInteger('amount'), -5000);
});
