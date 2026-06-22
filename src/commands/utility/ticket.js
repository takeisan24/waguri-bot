const {
    SlashCommandBuilder, ChannelType, EmbedBuilder,
    ButtonBuilder, ButtonStyle, ActionRowBuilder,
    PermissionsBitField, MessageFlags,
} = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { logError } = require('../../lib/logger');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Mở phòng hỗ trợ riêng tư với staff 🌸'),

    async execute(interaction) {
        const { user, channel, guild } = interaction;

        // Kiểm tra bot có đủ quyền tạo thread không
        const me = guild.members.me;
        const needed = [PermissionsBitField.Flags.CreatePrivateThreads, PermissionsBitField.Flags.ManageThreads];
        const hasPerms = needed.some(p => channel.permissionsFor(me)?.has(p));
        if (!hasPerms) {
            const errEmbed = buildWaguriEmbed(interaction, 'error', {
                description:
                    'Tớ không có quyền tạo luồng hỗ trợ ở kênh này~ 😥\n' +
                    'Cậu vui lòng nhờ Admin cấp quyền **Create Private Threads** và **Manage Threads** cho tớ nhé!',
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
                    reason: `Ticket hỗ trợ cho ${user.tag}`,
                });
            } catch {
                thread = await channel.threads.create({
                    name: `ticket-${user.username}`,
                    type: ChannelType.PublicThread,
                    reason: `Ticket hỗ trợ cho ${user.tag}`,
                });
            }

            // Thêm người dùng vào thread
            await thread.members.add(user.id);

            // Nút đóng ticket
            const closeBtn = new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Đóng ticket')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🔒');
            const row = new ActionRowBuilder().addComponents(closeBtn);

            // Embed hướng dẫn trong thread
            const guideEmbed = buildWaguriEmbed(interaction, 'info', {
                title: '🎫・Phòng hỗ trợ của cậu đây!',
                description:
                    `Xin chào <@${user.id}>~ Tớ đã mở phòng hỗ trợ riêng cho cậu rồi! 🌸\n\n` +
                    `**Cách dùng:**\n` +
                    `> 📝 Mô tả vấn đề cậu gặp phải **chi tiết nhất có thể** (kèm ảnh chụp màn hình nếu có).\n` +
                    `> ⏳ Staff sẽ phản hồi sớm nhất có thể — hãy kiên nhẫn nhé!\n` +
                    `> 🔒 Khi vấn đề được giải quyết, nhấn nút **Đóng ticket** bên dưới.\n\n` +
                    `*Cảm ơn cậu đã liên hệ với tớ~ Tớ sẽ cố gắng giúp cậu hết mình!* 💕`,
            });

            const threadMsg = await thread.send({ embeds: [guideEmbed], components: [row] });

            // Xử lý nút đóng ticket bằng collector (an toàn, không đụng interactionCreate.js)
            const collector = threadMsg.createMessageComponentCollector({
                filter: i => i.customId === 'ticket_close',
                time: 24 * 60 * 60 * 1000, // 24 giờ
            });

            collector.on('collect', async (btnInteraction) => {
                try {
                    await btnInteraction.reply({
                        content: `🔒 Ticket đã được đóng bởi <@${btnInteraction.user.id}>. Cảm ơn cậu đã liên hệ~ 🌸`,
                    });
                    await thread.setLocked(true, 'Ticket đã đóng');
                    await thread.setArchived(true, 'Ticket đã đóng');
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
                content: `✅ Tớ đã mở phòng hỗ trợ cho cậu tại ${thread}~ Vào đó mô tả vấn đề nhé! 🌸`,
            });
        } catch (error) {
            logError('ticket', error, { user: `<@${user.id}>`, guild: guild.id });
            const errEmbed = buildWaguriEmbed(interaction, 'error', {
                description: 'Đã có lỗi xảy ra khi tạo phòng hỗ trợ~ 😥 Cậu thử lại sau hoặc liên hệ trực tiếp với staff nhé!',
            });
            try {
                await interaction.editReply({ embeds: [errEmbed] });
            } catch {
                await interaction.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },
};
