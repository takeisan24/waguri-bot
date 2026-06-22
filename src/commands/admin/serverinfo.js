const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');

// Map loại kênh -> nhãn dễ đọc cho báo cáo.
const CH_ICON = {
    [ChannelType.GuildText]: '💬 text',
    [ChannelType.GuildVoice]: '🔊 voice',
    [ChannelType.GuildAnnouncement]: '📢 announcement',
    [ChannelType.GuildForum]: '🗂️ forum',
    [ChannelType.GuildMedia]: '🖼️ media',
    [ChannelType.GuildStageVoice]: '🎙️ stage',
};
const VERIF = ['Không', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];

function botPermNote(channel, me) {
    try {
        const p = channel.permissionsFor(me);
        if (!p) return '';
        if (!p.has(PermissionFlagsBits.ViewChannel)) return ' ⚠️(bot KHÔNG thấy kênh)';
        const isText = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type);
        if (isText && !p.has(PermissionFlagsBits.SendMessages)) return ' ⚠️(bot không gửi được tin)';
        return '';
    } catch { return ''; }
}

// Cờ quyền đáng chú ý của 1 role (để audit phân quyền).
function roleFlags(role) {
    const f = [];
    const P = PermissionFlagsBits;
    if (role.permissions.has(P.Administrator)) f.push('ADMIN');
    if (role.permissions.has(P.ManageGuild)) f.push('ManageServer');
    if (role.permissions.has(P.ManageChannels)) f.push('ManageChannels');
    if (role.permissions.has(P.ManageRoles)) f.push('ManageRoles');
    if (role.permissions.has(P.ManageMessages)) f.push('ManageMessages');
    if (role.permissions.has(P.MentionEveryone)) f.push('MentionEveryone');
    if (role.permissions.has(P.KickMembers) || role.permissions.has(P.BanMembers)) f.push('Kick/Ban');
    return f;
}

function buildReport(guild, me, settings) {
    const L = [];
    const push = (s = '') => L.push(s);

    push(`# 📋 Báo cáo server "${guild.name}" (cho audit Waguri)`);
    push(`*Xuất bởi /serverinfo — gửi file này cho người hỗ trợ để tổng hợp & polish server.*`);
    push('');

    // --- Tổng quan ---
    push('## 🏠 Tổng quan');
    push(`- Tên: **${guild.name}** (ID \`${guild.id}\`)`);
    push(`- Thành viên: **${guild.memberCount}**`);
    push(`- Chủ server: <@${guild.ownerId}> (\`${guild.ownerId}\`)`);
    push(`- Tạo lúc: ${guild.createdAt.toISOString().slice(0, 10)}`);
    push(`- Ngôn ngữ: ${guild.preferredLocale} · Xác minh: ${VERIF[guild.verificationLevel] ?? guild.verificationLevel}`);
    push(`- Boost: cấp ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boost)`);
    push(`- Emoji: ${guild.emojis.cache.size} · Sticker: ${guild.stickers.cache.size} · Role: ${guild.roles.cache.size - 1}`);
    const community = guild.features.includes('COMMUNITY');
    push(`- **Community Mode**: ${community ? '🟢 BẬT' : '🔴 Tắt'}${community ? '' : ' (chưa có rules-screening/onboarding của Discord)'}`);
    if (guild.features.length) push(`- Features: ${guild.features.join(', ')}`);
    push(`- Kênh đặc biệt: rules=${guild.rulesChannelId ? `<#${guild.rulesChannelId}>` : '—'} · system=${guild.systemChannelId ? `<#${guild.systemChannelId}>` : '—'} · updates=${guild.publicUpdatesChannelId ? `<#${guild.publicUpdatesChannelId}>` : '—'}`);
    push('');

    // --- Kênh theo nhóm ---
    push('## 📚 Kênh (theo nhóm)');
    const chans = [...guild.channels.cache.values()];
    const cats = chans.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    const childrenOf = (catId) => chans
        .filter(c => c.type !== ChannelType.GuildCategory && c.parentId === catId)
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    const renderChan = (c) => {
        const kind = CH_ICON[c.type] || `loại ${c.type}`;
        const topic = c.topic ? ` — _${c.topic.replace(/\n/g, ' ').slice(0, 120)}_` : '';
        const nsfw = c.nsfw ? ' 🔞' : '';
        push(`  - **${c.name}** \`${kind}\`${nsfw}${botPermNote(c, me)}${topic}`);
    };

    for (const cat of cats) {
        push(`### 📁 ${cat.name}`);
        const kids = childrenOf(cat.id);
        if (!kids.length) push('  *(trống)*');
        kids.forEach(renderChan);
        push('');
    }
    const orphans = chans.filter(c => c.type !== ChannelType.GuildCategory && !c.parentId)
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
    if (orphans.length) {
        push('### 📁 (không thuộc nhóm nào)');
        orphans.forEach(renderChan);
        push('');
    }

    // --- Roles ---
    push('## 🎭 Roles (cao → thấp, kèm quyền nổi bật)');
    const roles = [...guild.roles.cache.values()]
        .filter(r => r.id !== guild.id) // bỏ @everyone
        .sort((a, b) => b.position - a.position);
    for (const r of roles) {
        const flags = roleFlags(r);
        const managed = r.managed ? ' 🤖(bot/integration)' : '';
        const color = r.hexColor !== '#000000' ? ` ${r.hexColor}` : '';
        push(`- **${r.name}**${color}${managed}${flags.length ? ` · \`${flags.join(' ')}\`` : ''}`);
    }
    push('');

    // --- Cấu hình Waguri ---
    push('## 🌸 Cấu hình Waguri hiện tại (guild_settings)');
    const s = settings || {};
    push(`- AI trò chuyện: ${s.ai_enabled === '0' ? '🔴 Tắt' : '🟢 Bật'} · Kênh AI: ${s.ai_channel ? `<#${s.ai_channel}>` : '(mọi kênh)'}`);
    push(`- PvP (cướp/trộm): ${s.pvp === '0' ? '🔴 Tắt' : '🟢 Bật'}`);
    push(`- Trò may rủi: ${s.gambling === '0' ? '🔴 Tắt' : '🟢 Bật'} · Tạm giam: ${s.police_jail === '0' ? '🔴 Tắt' : '🟢 Bật'}`);
    push(`- Kênh confession: ${s.confession_channel ? `<#${s.confession_channel}>` : '(chưa đặt)'}`);
    push('');

    // --- Quyền của bot ---
    push('## 🔑 Quyền của Waguri trên server');
    const P = PermissionFlagsBits;
    const checks = [
        ['Quản lý Kênh', P.ManageChannels], ['Quản lý Role', P.ManageRoles],
        ['Quản lý Tin nhắn', P.ManageMessages], ['Tạm giam (Timeout)', P.ModerateMembers],
        ['Gắn link/Embed', P.EmbedLinks], ['Đính kèm file', P.AttachFiles],
        ['Dùng emoji ngoài', P.UseExternalEmojis], ['Mention everyone', P.MentionEveryone],
    ];
    for (const [label, flag] of checks) push(`- ${me.permissions.has(flag) ? '✅' : '❌'} ${label}`);

    return L.join('\n');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Xuất báo cáo cấu trúc server (kênh/role/cấu hình) để audit — cần quyền Quản lý Server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction) {
        if (!interaction.inGuild()) {
            return interaction.reply({ content: 'Lệnh này chỉ dùng trong server nhé~ 🌸', flags: MessageFlags.Ephemeral });
        }
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: 'Cần quyền **Quản lý Server** để dùng lệnh này nhé~ 🌸' });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const me = guild.members.me;
        let settings = {};
        try { settings = await db.getGuildSettings(guild.id); } catch { /* bỏ qua nếu lỗi */ }

        const report = buildReport(guild, me, settings);
        const file = new AttachmentBuilder(Buffer.from(report, 'utf8'), { name: `waguri-server-${guild.id}.md` });

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '📋 Đã xuất báo cáo server',
            description:
                `Mình đã tổng hợp **${guild.channels.cache.size} kênh** + **${guild.roles.cache.size - 1} role** + cấu hình hiện tại vào file đính kèm 🌸\n` +
                'Tải file `.md` này và gửi cho người hỗ trợ để được audit & polish server nhé~ 💕\n' +
                '*(Chỉ mình cậu thấy tin này.)*'
        });
        await interaction.editReply({ embeds: [embed], files: [file] });
    },
};
