// Harness dựng interaction giả để THỰC THI handler lệnh trong test.
//
// Vì sao cần: 154 test hiện có phủ `database.js` + RPC, nhưng KHÔNG test nào gọi
// `execute()` của `src/commands/**`. Hệ quả là lỗi chỉ-lộ-lúc-chạy trong tầng handler
// đi thẳng ra người dùng — `/eco-admin trace` từng ném `ReferenceError` (TDZ) ở mọi lần
// gọi, và `/loto`+`/bingo` từng crash vì `hostId` chưa khai báo. `node --check` không
// bắt được vì file vẫn parse hợp lệ.
//
// Chủ ý: chỉ giả lập ĐÚNG bề mặt discord.js mà handler chạm tới. Không dựng lại cả
// thư viện. Thiếu gì thì thêm nấy khi có ca mới.

const OWNER_ID = '100000000000000001';
const GUILD_ID = '200000000000000002';

/**
 * @param {object} o
 * @param {string} o.sub          tên subcommand mà `getSubcommand()` trả về
 * @param {object} o.options      giá trị option, tra theo TÊN: { user: {...}, limit: 20 }
 * @param {string} o.userId       người gọi lệnh (mặc định là owner)
 * @param {string} o.locale       'vi' | 'en-US'
 * @param {string[]} o.ownerIds   ai được coi là owner (mặc định: chính người gọi)
 */
function makeInteraction({ sub, options = {}, userId = OWNER_ID, locale = 'vi', ownerIds } = {}) {
    const calls = [];
    const owners = ownerIds || [userId];

    // Lấy option theo tên và ép kiểu như discord.js: sai kiểu -> null, không phải undefined.
    const pick = (name, type) => {
        const v = options[name];
        if (v === undefined || v === null) return null;
        if (type === 'number') return typeof v === 'number' ? v : null;
        if (type === 'string') return typeof v === 'string' ? v : null;
        if (type === 'boolean') return typeof v === 'boolean' ? v : null;
        return v;
    };

    const client = {
        user: { id: 'bot', username: 'Waguri', displayAvatarURL: () => 'https://x/bot.png' },
        // isOwner() gọi client.application.fetch() thật -> trả owner giả để đi ĐÚNG
        // đường xác thực thật thay vì vá đè hàm isOwner.
        application: { fetch: async () => ({ owner: { id: owners[0] } }) },
    };

    const interaction = {
        commandName: 'test',
        user: { id: userId, username: 'NguoiTest', displayAvatarURL: () => 'https://x/u.png' },
        guildId: GUILD_ID,
        guild: { id: GUILD_ID, name: 'Guild Test' },
        locale,
        guildLocale: locale,
        client,
        deferred: false,
        replied: false,
        options: {
            getSubcommand: () => sub,
            getSubcommandGroup: () => null,
            getUser: name => pick(name),
            getMember: name => pick(name),
            getInteger: name => pick(name, 'number'),
            getNumber: name => pick(name, 'number'),
            getString: name => pick(name, 'string'),
            getBoolean: name => pick(name, 'boolean'),
            getChannel: name => pick(name),
            getRole: name => pick(name),
            getFocused: () => '',
        },
        async deferReply(payload) { interaction.deferred = true; calls.push({ kind: 'deferReply', payload }); },
        async reply(payload) { interaction.replied = true; calls.push({ kind: 'reply', payload }); return payload; },
        async editReply(payload) { calls.push({ kind: 'editReply', payload }); return payload; },
        async followUp(payload) { calls.push({ kind: 'followUp', payload }); return payload; },
    };

    return { interaction, calls };
}

/** Gộp toàn bộ chữ trong các phản hồi thành một chuỗi để assert nội dung. */
function textOf(calls) {
    const parts = [];
    for (const c of calls) {
        for (const e of c.payload?.embeds || []) {
            const d = e.data || e; // EmbedBuilder hoặc object thuần
            if (d.title) parts.push(d.title);
            if (d.description) parts.push(d.description);
            for (const f of d.fields || []) parts.push(`${f.name}\n${f.value}`);
        }
        if (typeof c.payload?.content === 'string') parts.push(c.payload.content);
    }
    return parts.join('\n');
}

/**
 * Thay tạm các hàm trên module `database.js` rồi trả về hàm hoàn nguyên.
 * Handler giữ tham chiếu tới CHÍNH object module này (`const db = require(...)` lúc nạp),
 * nên gán đè thuộc tính là đủ — không cần đụng require cache.
 */
function stubDb(db, stubs) {
    const goc = {};
    for (const [k, v] of Object.entries(stubs)) {
        goc[k] = db[k];
        db[k] = v;
    }
    return () => {
        for (const [k, v] of Object.entries(goc)) {
            if (v === undefined) delete db[k];
            else db[k] = v;
        }
    };
}

module.exports = { makeInteraction, textOf, stubDb, OWNER_ID, GUILD_ID };
