const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletedata')
        .setDescription('Xoá toàn bộ dữ liệu cá nhân của bạn khỏi Waguri (không hoàn tác) 🗑️'),

    async execute(interaction) {
        // Ephemeral: chuyện dữ liệu cá nhân — chỉ mình cậu thấy.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const userId = interaction.user.id;

        const warn = buildWaguriEmbed(interaction, 'warning', {
            title: '🗑️・Xoá dữ liệu của bạn',
            description:
                'Cậu sắp **xoá vĩnh viễn** toàn bộ dữ liệu chơi của mình khỏi Waguri. Hành động này **KHÔNG THỂ hoàn tác** 🥺\n\n' +
                '**Sẽ xoá:** ví/ngân hàng, kho đồ, nghề, cấp, thú cưng, heo/cây, tiệm bánh, nhiệm vụ, thành tựu, thiện cảm & ký ức Waguri về cậu, cùng mọi tiến trình khác.\n' +
                '**Giữ lại (theo quy định):** hồ sơ thanh toán Premium (đối soát) và nhật ký confession (điều tra quấy rối).\n\n' +
                '⚠️ Nếu cậu đang **có khoản vay chưa tất toán** hoặc **đang là chủ một bang hội**, hãy xử lý xong trước đã nhé.\n\n' +
                'Cậu chắc chắn muốn xoá chứ?'
        });
        const row = (disabled = false) => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm').setLabel('Xoá vĩnh viễn 🗑️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cancel').setLabel('Huỷ, giữ lại 🌸').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        );

        const msg = await interaction.editReply({ embeds: [warn], components: [row()] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

        let acted = false;
        collector.on('collect', async (i) => {
            if (i.user.id !== userId) {
                return i.reply({ content: 'Nút này không dành cho cậu đâu~ 🌸', flags: MessageFlags.Ephemeral });
            }
            acted = true;

            if (i.customId === 'cancel') {
                const e = buildWaguriEmbed(interaction, 'success', { description: 'Tuyệt, mình vẫn giữ dữ liệu của cậu an toàn nhé~ 🌸' });
                await i.update({ embeds: [e], components: [] });
                return collector.stop('done');
            }

            const res = await db.deleteUserData(userId);
            let e;
            if (res === 'ok') {
                e = buildWaguriEmbed(interaction, 'success', {
                    title: '🗑️・Đã xoá xong',
                    description: 'Mình đã xoá toàn bộ dữ liệu chơi của cậu rồi. Nếu sau này quay lại, cậu sẽ bắt đầu hoàn toàn mới nhé~ Tạm biệt, mong sớm gặp lại! 🌸'
                });
            } else if (res === 'blocked_loans') {
                e = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu vẫn còn **khoản vay chưa tất toán** (đang nợ hoặc đang cho vay). Hãy dùng `/vay` xử lý xong hết trước rồi mới xoá được nhé~ 🌸'
                });
            } else if (res === 'blocked_clan_leader') {
                e = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu **đang là chủ một bang hội**. Hãy chuyển quyền hoặc giải tán bang (`/clan disband`) trước khi xoá dữ liệu nhé~ 🌸'
                });
            } else {
                e = buildWaguriEmbed(interaction, 'error', { description: 'Hơ, có lỗi khi xoá dữ liệu, thử lại sau nhé~ 🌸' });
            }
            await i.update({ embeds: [e], components: [] });
            collector.stop('done');
        });

        collector.on('end', async () => {
            if (!acted) await interaction.editReply({ components: [row(true)] }).catch(() => {});
        });
    },
};
