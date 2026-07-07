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
            case ApplicationCommandOptionType.Number:
                integers[def.name] = Number(raw);
                break;
            case ApplicationCommandOptionType.Boolean:
                booleans[def.name] = /^(true|1|có|yes|y)$/i.test(raw);
                break;
            case ApplicationCommandOptionType.Channel: {
                const id = raw.replace(/[<#>]/g, '');
                channels[def.name] = message.mentions.channels.first() || message.guild?.channels?.cache.get(id) || null;
                break;
            }
            default: // String
                // Option string cuối cùng gom hết phần còn lại (cho chuỗi có dấu cách)
                if (i === optionDefs.length - 1) raw = tokens.slice(i).join(' ');
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
    const userLocale = userProfile?.locale || 'vi';

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
