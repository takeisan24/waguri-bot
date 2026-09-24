const {
    SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
    ActionRowBuilder, StringSelectMenuBuilder, PermissionsBitField, MessageFlags,
    ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { logError } = require('../../lib/logger');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setNameLocalizations({ vi: 'ticket' })
        .setDescription('Open a feedback or support ticket with Waguri Team 🌸')
        .setDescriptionLocalizations({ vi: 'Hệ thống hỗ trợ riêng tư với Staff Waguri 🌸' })
        .addSubcommand(sub =>
            sub.setName('create')
                .setNameLocalizations({ vi: 'taomoi' })
                .setDescription('Submit a feedback or support ticket 🌸')
                .setDescriptionLocalizations({ vi: 'Mở biểu mẫu gửi góp ý hoặc hỗ trợ 🌸' })
                .addStringOption(opt =>
                    opt.setName('category')
                        .setNameLocalizations({ vi: 'phanloai' })
                        .setDescription('Category of issue')
                        .setDescriptionLocalizations({ vi: 'Loại vấn đề cần hỗ trợ' })
                        .setRequired(false)
                        .addChoices(
                            { name: 'Thắc mắc chung (General)', value: 'general' },
                            { name: 'Báo lỗi (Bug Report)', value: 'bug' },
                            { name: 'Hỗ trợ Premium / Giao dịch', value: 'premium' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('panel')
                .setDescription('Gửi bảng điều khiển Ticket cố định vào kênh (Dành cho Admin)')
        )
        .addSubcommand(sub =>
            sub.setName('close')
                .setDescription('Đóng ticket hỗ trợ hiện tại')
        ),

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();
        const { user, channel, guild } = interaction;

        if (subcommand === 'create') {
            const category = interaction.options.getString('category') || 'bug';
            const catMap = {
                bug: locale === 'en' ? 'Bug Report' : 'Báo lỗi Game (Bug)',
                general: locale === 'en' ? 'General Inquiry' : 'Thắc mắc chung',
                premium: locale === 'en' ? 'Premium Support' : 'Hỗ trợ Premium / Nạp'
            };

            const modal = new ModalBuilder()
                .setCustomId('ticket_feedback_modal')
                .setTitle(locale === 'en' ? '🌸 Waguri Support & Feedback' : '🌸 Hỗ Trợ & Góp Ý Waguri');

            const categoryInput = new TextInputBuilder()
                .setCustomId('category')
                .setLabel(locale === 'en' ? 'Category' : 'Phân loại')
                .setStyle(TextInputStyle.Short)
                .setValue(catMap[category] || category)
                .setRequired(true);

            const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel(locale === 'en' ? 'Summary / Title' : 'Tiêu đề ngắn gọn')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder(locale === 'en' ? 'Brief summary of your issue or idea...' : 'Tóm tắt lỗi hoặc ý tưởng của bạn...')
                .setMaxLength(100)
                .setRequired(true);

            const contentInput = new TextInputBuilder()
                .setCustomId('content')
                .setLabel(locale === 'en' ? 'Details' : 'Nội dung chi tiết')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder(locale === 'en' ? 'Describe what happened or steps to reproduce...' : 'Mô tả chi tiết để đội ngũ hỗ trợ kiểm tra nhen...')
                .setMaxLength(1000)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(categoryInput),
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(contentInput)
            );

            return interaction.showModal(modal);
        }

        if (subcommand === 'panel') {
            if (!interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
                const errEmbed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.ticket.no_admin_perm')
                });
                return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
            }

            const panelEmbed = new EmbedBuilder()
                .setColor('#f472b6')
                .setTitle('🌸 Bảng Hỗ Trợ Kỹ Thuật Waguri Kaoruko')
                .setDescription(
                    'Nếu cậu cần hỗ trợ về tài khoản, báo lỗi hoặc thắc mắc dịch vụ Premium, hãy chọn loại ticket bên dưới để mở kênh riêng tư với Staff nhen!'
                )
                .addFields(
                    { name: '💬 Thắc mắc chung', value: 'Giải đáp câu hỏi trò chơi, sự kiện, clan', inline: true },
                    { name: '🐛 Báo lỗi (Bug)', value: 'Báo lỗi lệnh, mất vật phẩm, exploit', inline: true },
                    { name: '💎 Premium / Nạp', value: 'Hỗ trợ giao dịch, nâng cấp gói Waguri Premium', inline: true }
                )
                .setFooter({ text: 'Waguri Kaoruko Support Panel • 24/7' });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('tkt:open_select')
                .setPlaceholder('🌸 Chọn loại hỗ trợ cậu cần...')
                .addOptions([
                    { label: 'Thắc mắc chung', value: 'general', emoji: '💬', description: 'Giải đáp câu hỏi trò chơi, clan' },
                    { label: 'Báo lỗi (Bug Report)', value: 'bug', emoji: '🐛', description: 'Báo lỗi lệnh hoặc vật phẩm' },
                    { label: 'Hỗ trợ Premium / Giao dịch', value: 'premium', emoji: '💎', description: 'Hỗ trợ nâng cấp Waguri Premium' },
                ]);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            await channel.send({ embeds: [panelEmbed], components: [row] });
            return interaction.reply({ content: '✅ Đã tạo Panel Ticket thành công!', flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'close') {
            const ticket = await db.getTicketByChannel(channel.id);
            if (!ticket || ticket.status === 'CLOSED') {
                const errEmbed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.ticket.not_in_ticket')
                });
                return interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
            }

            const confirmEmbed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.ticket.confirm_close_title'),
                description: t(locale, 'commands.ticket.confirm_close_desc'),
            });

            const confirmBtn = new ButtonBuilder().setCustomId('tkt:confirm_close').setLabel(t(locale, 'commands.ticket.confirm_btn')).setStyle(ButtonStyle.Danger);
            const cancelBtn = new ButtonBuilder().setCustomId('tkt:cancel_close').setLabel(t(locale, 'commands.ticket.cancel_btn')).setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

            return interaction.reply({ embeds: [confirmEmbed], components: [row] });
        }
    },
};
