const { PermissionFlagsBits, ChannelType } = require('discord.js');

// Loại kênh có thể tạo invite (text-based + voice/stage).
const INVITABLE = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
];

/** Tìm 1 kênh mà bot có quyền tạo invite (ưu tiên kênh hệ thống/rules cho gọn). */
function pickInviteChannel(guild) {
    const me = guild.members.me;
    if (!me) return null;
    const canInvite = ch =>
        INVITABLE.includes(ch.type) &&
        ch.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite) &&
        ch.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel);

    if (guild.systemChannel && canInvite(guild.systemChannel)) return guild.systemChannel;
    if (guild.rulesChannel && canInvite(guild.rulesChannel)) return guild.rulesChannel;
    return guild.channels.cache
        .filter(canInvite)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first() || null;
}

/**
 * Tạo invite cho 1 guild. Mặc định: 24h, dùng 1 lần, unique.
 * @returns {Promise<{ url, channel, invite }|null>} null nếu không có kênh tạo được.
 */
async function createGuildInvite(guild, { maxAge = 86400, maxUses = 1, reason } = {}) {
    const channel = pickInviteChannel(guild);
    if (!channel) return null;
    const invite = await channel.createInvite({ maxAge, maxUses, unique: true, reason });
    return { url: `https://discord.gg/${invite.code}`, channel, invite };
}

module.exports = { pickInviteChannel, createGuildInvite };
