const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('divorce')
        .setDescription('Chia tay người ấy 💔'),
    async execute(interaction) {
        await interaction.deferReply();
        const user = await db.getUser(interaction.user.id);
        const partner = user?.partner_id;
        if (!partner) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: 'Cậu đang độc thân mà~ Đâu có ai để chia tay đâu 😅'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const fee = config.MARRY.DIVORCE_COST;
        // Thu án phí TRƯỚC (atomic) — tránh ly hôn xong mà ví bị rút cạn xen giữa -> mất phí.
        if (!await db.addMoney(interaction.user.id, -fee, 'wallet')) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `Ly hôn cần **${fmt(fee)}** ${config.CURRENCY} án phí 😅 — ví cậu chưa đủ. Kiếm thêm rồi quay lại nhé~`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const r = await db.divorceUser(interaction.user.id);
        if (r !== 'ok') {
            await db.addMoney(interaction.user.id, fee, 'wallet'); // hoàn phí nếu không ly hôn được
            const embed = buildWaguriEmbed(interaction, r === 'single' ? 'warning' : 'error', {
                description: r === 'single' ? 'Cậu đang độc thân mà~ Đâu có ai để chia tay đâu 😅' : 'Ơ, có lỗi rồi, thử lại sau nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = buildWaguriEmbed(interaction, 'warning', {
            title: '💔・Quyết định ly hôn',
            description: `Cậu và ${partner ? `<@${partner}>` : 'người ấy'} đã chính thức đường ai nấy đi rồi... Án phí **-${fmt(fee)}** ${config.CURRENCY}.\nMong cả hai sớm tìm lại sự bình yên và hạnh phúc mới nhé~ 🌸`
        }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
