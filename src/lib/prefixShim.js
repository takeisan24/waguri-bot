const { ApplicationCommandOptionType } = require('discord.js');

// Phân tích token vị trí thành options dựa trên định nghĩa SlashCommandBuilder.
async function parseOptions(message, commandData, tokens) {
    let optionDefs = commandData.options || [];
    let subcommand = null;

    // Subcommand = token đầu tiên nếu command có subcommand
    if (optionDefs.length && optionDefs[0].type === ApplicationCommandOptionType.Subcommand) {
        const subName = (tokens[0] || '').toLowerCase();
        const subDef = optionDefs.find(o => o.type === ApplicationCommandOptionType.Subcommand && o.name === subName);
        if (subDef) {
            subcommand = subDef.name;
            optionDefs = subDef.options || [];
            tokens = tokens.slice(1);
        } else {
            subcommand = subName || null;
            optionDefs = [];
        }
    }

    const strings = {}, integers = {}, booleans = {}, users = {}, members = {}, channels = {};

    // Hợp đồng slash có HAI ràng buộc, không phải một: biên số (min/max) VÀ danh sách
    // `choices`. Discord ép cả hai ở phía client; prefix không đi qua Discord nên phải
    // tự ép, nếu không lệnh nhận giá trị mà nó không bao giờ ngờ tới.
    // Ví dụ thật: `/market sell` khai báo 12 món, nhưng `w!market sell cuoc_sat 1` lọt
    // xuống RPC -> bán ở giá chợ (0,5 × 0,70..1,50) thay vì mức 50% cố định, tức tới
    // +50% cho MỌI vật phẩm nếu canh đúng block giá đỉnh.
    // Giá trị ngoài danh sách -> coi như KHÔNG nhập (getString/getInteger trả null).
    // An toàn vì parseOptions VỐN ĐÃ để trống option khi người dùng gõ thiếu token,
    // nên mọi lệnh đã phải chịu được trường hợp null.
    const inChoices = (def, value) => {
        if (!def.choices?.length) return true;
        return def.choices.some(c => String(c.value) === String(value));
    };

    for (let i = 0; i < optionDefs.length; i++) {
        const def = optionDefs[i];
        if (tokens[i] === undefined) continue;
        let raw = tokens[i];

        switch (def.type) {
            case ApplicationCommandOptionType.User: {
                const id = raw.replace(/[<@!>]/g, '');
                const u = message.mentions.users.first() || await message.client.users.fetch(id).catch(() => null);
                users[def.name] = u;
                if (u && message.guild) members[def.name] = await message.guild.members.fetch(id).catch(() => null);
                break;
            }
            case ApplicationCommandOptionType.Integer:
            case ApplicationCommandOptionType.Number: {
                // CẦU CHÌ: ép giá trị vào ĐÚNG hợp đồng mà slash command đã khai báo.
                //
                // Trước đây chỉ `Number(raw)`, nên mọi .setMinValue()/.setMaxValue() là
                // VÔ NGHĨA trên đường prefix — Discord chặn ở client, prefix thì không đi
                // qua Discord. Đó là nguyên nhân gốc của HAI lỗ hổng đã tìm ra:
                //   · `w!market list go 500 0`        -> qty 0  -> báo thành công giả
                //   · `w!market list go -1000000 1`   -> giá ÂM -> `wallet - (-1000000)`
                //     thành phép CỘNG: +50.000 xu sinh ra từ không khí mỗi lần, vô hạn.
                // Vá từng RPC là dò ngọn; chỗ này là gốc, và nó bao TẤT CẢ lệnh.
                let v = Number(raw);
                if (!Number.isFinite(v)) break;   // 'abc'/Infinity -> coi như KHÔNG nhập
                                                  // (getInteger trả null) thay vì đẩy NaN
                                                  // xuống tận RPC.
                if (def.type === ApplicationCommandOptionType.Integer) v = Math.trunc(v);
                // Kẹp về biên thay vì từ chối: giữ đúng kiểu dữ liệu mà lệnh mong đợi,
                // không thể tạo giá trị nằm ngoài hợp đồng, và không làm hỏng lệnh nào
                // đang giả định "option bắt buộc thì luôn có".
                if (typeof def.min_value === 'number' && v < def.min_value) v = def.min_value;
                if (typeof def.max_value === 'number' && v > def.max_value) v = def.max_value;
                if (!inChoices(def, v)) break;   // ngoài danh sách -> coi như không nhập
                integers[def.name] = v;
                break;
            }
            case ApplicationCommandOptionType.Boolean:
                booleans[def.name] = /^(true|1|có|yes|y)$/i.test(raw);
                break;
            case ApplicationCommandOptionType.Channel: {
                const id = raw.replace(/[<#>]/g, '');
                channels[def.name] = message.mentions.channels.first() || message.guild?.channels?.cache.get(id) || null;
                break;
            }
            default: // String
                // Option string cuối cùng gom hết phần còn lại (cho chuỗi có dấu cách).
                // KHÔNG gom khi option có `choices` — giá trị trong danh sách không bao
                // giờ chứa dấu cách, gom vào sẽ làm mọi giá trị hợp lệ bị coi là sai.
                if (i === optionDefs.length - 1 && !def.choices?.length) raw = tokens.slice(i).join(' ');
                if (!inChoices(def, raw)) break;   // ngoài danh sách -> coi như không nhập
                // Ràng buộc độ dài (/clan create name max 30, /study start title max 50).
                // Discord cắt ở client; prefix thì không -> tên clan/tiêu đề dài vô hạn
                // lọt vào DB và vỡ hiển thị embed.
                if (typeof def.max_length === 'number') raw = raw.slice(0, def.max_length);
                if (typeof def.min_length === 'number' && raw.length < def.min_length) break;
                strings[def.name] = raw;
        }
    }
    return { subcommand, strings, integers, booleans, users, members, channels };
}

/**
 * Tạo object "giả interaction" để command.execute(interaction) chạy được từ prefix
 * mà KHÔNG phải sửa code lệnh. Nó mô phỏng phần API mà các lệnh đang dùng.
 */
async function buildPrefixInteraction(message, command, tokens) {
    const data = command.data.toJSON();
    const parsed = await parseOptions(message, data, tokens);
    const state = { sent: null, deferred: false, replied: false };

    const db = require('../database');
    const userProfile = await db.getUser(message.author.id);
    // `null` chứ KHÔNG phải 'vi': tin nhắn prefix không mang tín hiệu ngôn ngữ nào từ
    // Discord, nên "chưa biết" phải giữ nguyên là chưa biết. Nếu điền sẵn 'vi', tầng i18n
    // sẽ tưởng đó là ngôn ngữ thật của người dùng và HỌC nó vào DB — khoá cứng người dùng
    // tiếng Anh vào tiếng Việt vĩnh viễn. Để null thì chuỗi ưu tiên tự rơi xuống cấu hình
    // server rồi mới tới mặc định 'vi', mà không bịa ra dữ liệu.
    const userLocale = userProfile?.locale || null;

    const send = async (payload) => {
        const body = typeof payload === 'string' ? { content: payload } : { ...payload };
        delete body.flags; // prefix không hỗ trợ ephemeral
        if (state.sent) return state.sent.edit(body);
        state.sent = await message.reply(body);
        state.replied = true;
        return state.sent;
    };

    return {
        user: message.author,
        member: message.member,
        guild: message.guild,
        channel: message.channel,
        client: message.client,
        commandName: data.name,
        guildId: message.guildId,
        locale: userLocale,
        guildLocale: null,
        get deferred() { return state.deferred; },
        get replied() { return state.replied; },
        isChatInputCommand: () => true,
        isAutocomplete: () => false,
        options: {
            getString: (n) => (parsed.strings[n] ?? null),
            getInteger: (n) => (parsed.integers[n] === undefined ? null : parsed.integers[n]),
            getNumber: (n) => (parsed.integers[n] === undefined ? null : parsed.integers[n]),
            getBoolean: (n) => (parsed.booleans[n] === undefined ? null : parsed.booleans[n]),
            getUser: (n) => (parsed.users[n] ?? null),
            getMember: (n) => (parsed.members[n] ?? null),
            getChannel: (n) => (parsed.channels[n] ?? null),
            getSubcommand: () => parsed.subcommand,
            getFocused: () => '',
        },
        deferReply: async () => { state.deferred = true; await message.channel.sendTyping().catch(() => {}); },
        editReply: send,
        reply: send,
        followUp: async (payload) => message.channel.send(typeof payload === 'string' ? payload : { ...payload, flags: undefined }),
    };
}

module.exports = { buildPrefixInteraction };
