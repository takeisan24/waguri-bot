const {
    SlashCommandBuilder, ChannelType, EmbedBuilder,
    ButtonBuilder, ButtonStyle, ActionRowBuilder,
    PermissionsBitField, MessageFlags,
} = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { logError } = require('../../lib/logger');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Mở phòng hỗ trợ riêng tư với staff 🌸'),

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const { user, channel, guild } = interaction;

        // Kiểm tra bot có đủ quyền tạo thread không
        const me = guild.members.me;
        const needed = [PermissionsBitField.Flags.CreatePrivateThreads, PermissionsBitField.Flags.ManageThreads];
        const hasPerms = needed.some(p => channel.permissionsFor(me)?.has(p));
        if (!hasPerms) {
            const errEmbed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.ticket.no_perm')
            });
            return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let thread;
        try {
            // Thử tạo private thread trước; fallback sang public thread nếu kênh không hỗ trợ
            try {
                thread = await channel.threads.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.PrivateThread,
                    reason: t(locale, 'commands.ticket.reason', { user: user.tag }),
                });
            } catch {
                thread = await channel.threads.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.PublicThread,
                    reason: t(locale, 'commands.ticket.reason', { user: user.tag }),
                });
            }

            // Thêm người dùng vào thread
            await thread.members.add(user.id);

            // Nút đóng ticket
            const closeBtn = new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel(t(locale, 'commands.ticket.close_btn'))
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒');
            const row = new ActionRowBuilder().addComponents(closeBtn);

            // Embed hướng dẫn trong thread
            const guideEmbed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.ticket.guide_title'),
                description: t(locale, 'commands.ticket.guide_desc', { user: user.id }),
            });

            const threadMsg = await thread.send({ embeds: [guideEmbed], components: [row] });

            // Xử lý nút đóng ticket bằng collector (an toàn, không đụng interactionCreate.js)
            const collector = threadMsg.createMessageComponentCollector({
                filter: i => i.customId === 'ticket_close',
                time: 24 * 60 * 60 * 1000, // 24 giờ
            });

            collector.on('collect', async (btnInteraction) => {
                const btnLocale = await getInteractionLanguage(btnInteraction);
                try {
                    await btnInteraction.reply({
                        content: t(btnLocale, 'commands.ticket.closed_msg', { user: btnInteraction.user.id }),
                    });
                    await thread.setLocked(true, t(btnLocale, 'commands.ticket.closed_reason'));
                    await thread.setArchived(true, t(btnLocale, 'commands.ticket.closed_reason'));
                    collector.stop('closed');
                } catch (err) {
                    logError('ticket_close', err, { user: `<@${btnInteraction.user.id}>`, guild: guild.id });
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'time') {
                    // Tự động đóng sau 24h nếu không ai đóng thủ công
                    thread.setLocked(true).catch(() => {});
                    thread.setArchived(true).catch(() => {});
                }
            });

            // Reply ephemeral cho người dùng link thread
            await interaction.editReply({
                content: t(locale, 'commands.ticket.success_reply', { thread: `${thread}` }),
            });
        } catch (error) {
            logError('ticket', error, { user: `<@${user.id}>`, guild: guild.id });
            const errEmbed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.ticket.error_desc'),
            });
            try {
                await interaction.editReply({ embeds: [errEmbed] });
            } catch {
                await interaction.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },
};
