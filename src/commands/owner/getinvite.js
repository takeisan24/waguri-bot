const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');
const { createGuildInvite } = require('../../lib/invite');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('getinvite')
        .setDescription('Bot tạo link mời 1 server rồi DM cho owner (chỉ owner)')
        .setDefaultMemberPermissions(0)
        .addStringOption(o => o.setName('server')
            .setDescription('Server cần lấy link mời (bỏ trống = server đang gõ lệnh)')
            .setAutocomplete(true)),

    async autocomplete(interaction) {
        if (!await isOwner(interaction.client, interaction.user.id)) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = interaction.client.guilds.cache
            .filter(g => g.name.toLowerCase().includes(focused) || g.id.includes(focused))
            .map(g => ({ name: `${g.name} · ${g.memberCount} members`.slice(0, 100), value: g.id }))
            .slice(0, 25);
        await interaction.respond(choices);
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');

        if (!await isOwner(interaction.client, interaction.user.id)) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: t(locale, 'commands.getinvite.only_owner') });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Xác định server cần lấy invite.
        const targetId = interaction.options.getString('server') || interaction.guildId;
        if (!targetId) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.getinvite.dm_err_no_guild') })] });
        }
        const guild = interaction.client.guilds.cache.get(targetId);
        if (!guild) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.getinvite.guild_not_found', { server: targetId }) })] });
        }

        // Tạo invite: 24h, 1 lượt dùng, riêng cho lần này.
        let result;
        try {
            result = await createGuildInvite(guild, {
                reason: `Owner ${interaction.user.tag} requested invite link for feedback/audit`,
            });
        } catch (err) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.getinvite.invite_fail', { name: guild.name, msg: err.message }) })] });
        }
        if (!result) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                title: isEn ? '⚠️ Cannot Create Invite' : '⚠️ Không tạo được link mời',
                description: t(locale, 'commands.getinvite.invite_no_perm', { name: guild.name }) })] });
        }

        const { url, channel } = result;
        const dmText = isEn
            ? `🌸 Here is the invite link for **${guild.name}**~\n` +
              `${url}\n\n` +
              `📌 Channel: #${channel.name} · ⏳ expires in **24h** · 🎫 **1-use** limit.`
            : `🌸 Link mời vào **${guild.name}** đây nè~\n` +
              `${url}\n\n` +
              `📌 Kênh: #${channel.name} · ⏳ hết hạn sau **24h** · 🎫 dùng **1 lần**.`;

        // DM cho owner.
        try {
            await interaction.user.send(dmText);
        } catch {
            // Owner tắt DM -> trả thẳng link qua reply ẩn.
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                title: t(locale, 'commands.getinvite.dm_failed_title'),
                description: t(locale, 'commands.getinvite.dm_failed_desc', { url, channel: channel.name }) })] });
        }

        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
            title: t(locale, 'commands.getinvite.dm_success_title'),
            description: t(locale, 'commands.getinvite.dm_success_desc', { name: guild.name }) })] });
    },
};
