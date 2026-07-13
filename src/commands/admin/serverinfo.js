const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

// Map loại kênh -> nhãn dễ đọc cho báo cáo.
const CH_ICON_VI = {
    [ChannelType.GuildText]: '💬 text',
    [ChannelType.GuildVoice]: '🔊 voice',
    [ChannelType.GuildAnnouncement]: '📢 announcement',
    [ChannelType.GuildForum]: '🗂️ forum',
    [ChannelType.GuildMedia]: '🖼️ media',
    [ChannelType.GuildStageVoice]: '🎙️ stage',
};
const CH_ICON_EN = {
    [ChannelType.GuildText]: '💬 text',
    [ChannelType.GuildVoice]: '🔊 voice',
    [ChannelType.GuildAnnouncement]: '📢 announcement',
    [ChannelType.GuildForum]: '🗂️ forum',
    [ChannelType.GuildMedia]: '🖼️ media',
    [ChannelType.GuildStageVoice]: '🎙️ stage',
};

const VERIF_VI = ['Không', 'Thấp', 'Trung bình', 'Cao', 'Rất cao'];
const VERIF_EN = ['None', 'Low', 'Medium', 'High', 'Very High'];

function botPermNote(channel, me, isEn) {
    try {
        const p = channel.permissionsFor(me);
        if (!p) return '';
        if (!p.has(PermissionFlagsBits.ViewChannel)) {
            return isEn ? ' ⚠️(bot CANNOT see channel)' : ' ⚠️(bot KHÔNG thấy kênh)';
        }
        const isText = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(channel.type);
        if (isText && !p.has(PermissionFlagsBits.SendMessages)) {
            return isEn ? ' ⚠️(bot cannot send messages)' : ' ⚠️(bot không gửi được tin)';
        }
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

function buildReport(guild, me, settings, locale) {
    const isEn = locale?.startsWith('en');
    const L = [];
    const push = (s = '') => L.push(s);

    const CH_ICON = isEn ? CH_ICON_EN : CH_ICON_VI;
    const VERIF = isEn ? VERIF_EN : VERIF_VI;

    push(t(locale, 'commands.serverinfo.report_title', { name: guild.name }));
    push(t(locale, 'commands.serverinfo.report_by'));
    push('');

    // --- Tổng quan ---
    push(t(locale, 'commands.serverinfo.report_overview'));
    push(t(locale, 'commands.serverinfo.report_name', { name: guild.name, id: guild.id }));
    push(t(locale, 'commands.serverinfo.report_members', { count: guild.memberCount }));
    push(t(locale, 'commands.serverinfo.report_owner', { ownerId: guild.ownerId }));
    push(t(locale, 'commands.serverinfo.report_created', { date: guild.createdAt.toISOString().slice(0, 10) }));
    
    const verifLevel = VERIF[guild.verificationLevel] ?? guild.verificationLevel;
    push(t(locale, 'commands.serverinfo.report_locale', { locale: guild.preferredLocale, verif: verifLevel }));
    push(t(locale, 'commands.serverinfo.report_boost', { tier: guild.premiumTier, count: guild.premiumSubscriptionCount || 0 }));
    push(t(locale, 'commands.serverinfo.report_emojis', { emojis: guild.emojis.cache.size, stickers: guild.stickers.cache.size, roles: guild.roles.cache.size - 1 }));
    
    const community = guild.features.includes('COMMUNITY');
    const commStatus = community 
        ? t(locale, 'commands.serverinfo.community_on')
        : t(locale, 'commands.serverinfo.community_off') + t(locale, 'commands.serverinfo.rules_screening_warning');
    push(t(locale, 'commands.serverinfo.report_community', { status: commStatus }));
    
    const rulesCh = guild.rulesChannelId ? `<#${guild.rulesChannelId}>` : '—';
    const systemCh = guild.systemChannelId ? `<#${guild.systemChannelId}>` : '—';
    const updatesCh = guild.publicUpdatesChannelId ? `<#${guild.publicUpdatesChannelId}>` : '—';
    push(t(locale, 'commands.serverinfo.report_special', { rules: rulesCh, system: systemCh, updates: updatesCh }));
    push('');

    // --- Kênh theo nhóm ---
    push(t(locale, 'commands.serverinfo.report_channels_cat'));
    const chans = [...guild.channels.cache.values()];
    const cats = chans.filter(c => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition);
    const childrenOf = (catId) => chans
        .filter(c => c.type !== ChannelType.GuildCategory && c.parentId === catId)
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));

    const renderChan = (c) => {
        const kind = CH_ICON[c.type] || `type ${c.type}`;
        const topic = c.topic ? ` — _${c.topic.replace(/\n/g, ' ').slice(0, 120)}_` : '';
        const nsfw = c.nsfw ? ' 🔞' : '';
        push(`  - **${c.name}** \`${kind}\`${nsfw}${botPermNote(c, me, isEn)}${topic}`);
    };

    for (const cat of cats) {
        push(`### 📁 ${cat.name}`);
        const kids = childrenOf(cat.id);
        if (!kids.length) push(t(locale, 'commands.serverinfo.empty_category'));
        kids.forEach(renderChan);
        push('');
    }
    const orphans = chans.filter(c => c.type !== ChannelType.GuildCategory && !c.parentId)
        .sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0));
    if (orphans.length) {
        push(t(locale, 'commands.serverinfo.report_channels_orphan'));
        orphans.forEach(renderChan);
        push('');
    }

    // --- Roles ---
    push(t(locale, 'commands.serverinfo.report_roles'));
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
    push(t(locale, 'commands.serverinfo.report_waguri_config'));
    const s = settings || {};
    const aiVal = s.ai_enabled === '0' ? (isEn ? '🔴 Disabled' : '🔴 Tắt') : (isEn ? '🟢 Enabled' : '🟢 Bật');
    const pvpVal = s.pvp === '0' ? (isEn ? '🔴 Disabled' : '🔴 Tắt') : (isEn ? '🟢 Enabled' : '🟢 Bật');
    const gambleVal = s.gambling === '0' ? (isEn ? '🔴 Disabled' : '🔴 Tắt') : (isEn ? '🟢 Enabled' : '🟢 Bật');
    const timeoutVal = s.police_jail === '0' ? (isEn ? '🔴 Disabled' : '🔴 Tắt') : (isEn ? '🟢 Enabled' : '🟢 Bật');
    
    push(isEn 
        ? `- AI Chat: ${aiVal} · AI Channel: ${s.ai_channel ? `<#${s.ai_channel}>` : '(all channels)'}`
        : `- AI trò chuyện: ${aiVal} · Kênh AI: ${s.ai_channel ? `<#${s.ai_channel}>` : '(mọi kênh)'}`);
    push(isEn
        ? `- PvP (rob/steal): ${pvpVal}`
        : `- PvP (cướp/trộm): ${pvpVal}`);
    push(isEn
        ? `- Gambling Games: ${gambleVal} · Jail (Timeout): ${timeoutVal}`
        : `- Trò may rủi: ${gambleVal} · Tạm giam: ${timeoutVal}`);
    push(isEn
        ? `- Confession Channel: ${s.confession_channel ? `<#${s.confession_channel}>` : '(not set)'}`
        : `- Kênh confession: ${s.confession_channel ? `<#${s.confession_channel}>` : '(chưa đặt)'}`);
    push('');

    // --- Quyền của bot ---
    push(t(locale, 'commands.serverinfo.report_waguri_perms'));
    const P = PermissionFlagsBits;
    const checks = isEn ? [
        ['Manage Channels', P.ManageChannels], ['Manage Roles', P.ManageRoles],
        ['Manage Messages', P.ManageMessages], ['Timeout Members (Moderate)', P.ModerateMembers],
        ['Embed Links', P.EmbedLinks], ['Attach Files', P.AttachFiles],
        ['Use External Emojis', P.UseExternalEmojis], ['Mention everyone', P.MentionEveryone],
    ] : [
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
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');

        if (!interaction.inGuild()) {
            return interaction.reply({ content: t(locale, 'commands.serverinfo.only_guild'), flags: MessageFlags.Ephemeral });
        }
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: t(locale, 'commands.serverinfo.no_perm') });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const guild = interaction.guild;
        const me = guild.members.me;
        let settings = {};
        try { settings = await db.getGuildSettings(guild.id); } catch { /* ignore on db error */ }

        const report = buildReport(guild, me, settings, locale);
        const file = new AttachmentBuilder(Buffer.from(report, 'utf8'), { name: `waguri-server-${guild.id}.md` });

        // Đếm kênh theo loại cho bảng tóm tắt.
        const chans = [...guild.channels.cache.values()];
        const count = (t) => chans.filter(c => c.type === t).length;
        const chanLine = isEn
            ? `💬 ${count(ChannelType.GuildText)} text · 🔊 ${count(ChannelType.GuildVoice)} voice · ` +
              `📢 ${count(ChannelType.GuildAnnouncement)} announcement · 🗂️ ${count(ChannelType.GuildForum)} forum · ` +
              `📁 ${count(ChannelType.GuildCategory)} categories`
            : `💬 ${count(ChannelType.GuildText)} text · 🔊 ${count(ChannelType.GuildVoice)} voice · ` +
              `📢 ${count(ChannelType.GuildAnnouncement)} thông báo · 🗂️ ${count(ChannelType.GuildForum)} forum · ` +
              `📁 ${count(ChannelType.GuildCategory)} nhóm`;

        // Quyền bot còn THIẾU (để admin biết cần cấp gì).
        const P = PermissionFlagsBits;
        const need = isEn ? [
            ['Manage Channels', P.ManageChannels], ['Manage Roles', P.ManageRoles],
            ['Manage Messages', P.ManageMessages], ['Moderate Members', P.ModerateMembers],
            ['Embed Links', P.EmbedLinks], ['Attach Files', P.AttachFiles],
        ] : [
            ['Quản lý Kênh', P.ManageChannels], ['Quản lý Role', P.ManageRoles],
            ['Quản lý Tin nhắn', P.ManageMessages], ['Tạm giam', P.ModerateMembers],
            ['Embed', P.EmbedLinks], ['Đính kèm file', P.AttachFiles],
        ];
        const missing = need.filter(([, f]) => !me.permissions.has(f)).map(([l]) => l);
        const community = guild.features.includes('COMMUNITY');
        const s = settings || {};

        const communityVal = community 
            ? (isEn ? '🟢 Enabled' : '🟢 Bật')
            : (isEn ? '🔴 Disabled (no rules/onboarding)' : '🔴 Tắt (chưa có rules/onboarding của Discord)');

        const configVal = isEn
            ? `AI ${s.ai_enabled === '0' ? '🔴' : '🟢'} · PvP ${s.pvp === '0' ? '🔴' : '🟢'} · ` +
              `Gambling ${s.gambling === '0' ? '🔴' : '🟢'} · Jail ${s.police_jail === '0' ? '🔴' : '🟢'}\n` +
              `Confession: ${s.confession_channel ? `<#${s.confession_channel}>` : '(not set)'} · AI Channel: ${s.ai_channel ? `<#${s.ai_channel}>` : '(all channels)'}`
            : `AI ${s.ai_enabled === '0' ? '🔴' : '🟢'} · PvP ${s.pvp === '0' ? '🔴' : '🟢'} · ` +
              `May rủi ${s.gambling === '0' ? '🔴' : '🟢'} · Tạm giam ${s.police_jail === '0' ? '🔴' : '🟢'}\n` +
              `Confession: ${s.confession_channel ? `<#${s.confession_channel}>` : '(chưa đặt)'} · Kênh AI: ${s.ai_channel ? `<#${s.ai_channel}>` : '(mọi kênh)'}`;

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: t(locale, 'commands.serverinfo.embed_title', { name: guild.name }),
            fields: [
                { name: t(locale, 'commands.serverinfo.members_field'), value: `${guild.memberCount}`, inline: true },
                { name: t(locale, 'commands.serverinfo.roles_field'), value: `${guild.roles.cache.size - 1}`, inline: true },
                { name: t(locale, 'commands.serverinfo.boost_field'), value: `${isEn ? 'Tier' : 'Cấp'} ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0})`, inline: true },
                { name: t(locale, 'commands.serverinfo.channels_field'), value: chanLine, inline: false },
                { name: t(locale, 'commands.serverinfo.community_field'), value: communityVal, inline: false },
                { name: t(locale, 'commands.serverinfo.config_field'), value: configVal, inline: false },
                { name: t(locale, 'commands.serverinfo.missing_perms_field'), value: missing.length ? `${t(locale, 'commands.serverinfo.missing_perms_prefix')}${missing.join(', ')}` : t(locale, 'commands.serverinfo.ok_perms'), inline: false },
                { name: t(locale, 'commands.serverinfo.full_detail_field'), value: t(locale, 'commands.serverinfo.full_detail_value'), inline: false },
            ]
        });
        const icon = guild.iconURL({ size: 128 });
        if (icon) embed.setThumbnail(icon);
        await interaction.editReply({ embeds: [embed], files: [file] });
    },
};
