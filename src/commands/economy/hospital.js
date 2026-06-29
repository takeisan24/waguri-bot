const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hospital')
        .setDescription('🏥 Nhập viện hồi phục sức khỏe toàn diện (Viện phí cố định 3.000 VNĐ)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        const result = await db.hospitalHeal(userId);
        if (!result) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Ơ, có lỗi khi xử lý nhập viện rồi, thử lại sau nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const fmt = n => Number(n).toLocaleString('vi-VN');

        if (result.status === 'already_healthy') {
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🏥 Bệnh Viện Waguri',
                description: 'Cậu đang hoàn toàn khỏe mạnh (100% ❤️) mà, đâu cần vào viện đâu nè~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result.status === 'insufficient_funds') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                title: '🏥 Bệnh Viện Waguri',
                description: `Ví cậu không đủ tiền trả viện phí rồi 😟 — Cần tối thiểu **${fmt(result.fee)}** ${config.CURRENCY} để nhập viện nhé!`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result.status === 'ok') {
            const u = await db.getUser(userId);
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🏥 Bệnh Viện Waguri',
                description: `🩺 Cậu đã được bác sĩ chăm sóc đặc biệt và hồi phục sức khỏe về **100/100 ❤️** và khỏi hẳn bệnh!\n\n💵 Viện phí đã thanh toán: **-${fmt(result.fee)}** ${config.CURRENCY}.\n💰 Ví: **${fmt(u?.wallet || 0)}** · 🏦 Ngân hàng: **${fmt(u?.bank || 0)}** ${config.CURRENCY}`
            }).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = buildWaguriEmbed(interaction, 'error', {
            description: 'Ơ, có lỗi lạ xảy ra khi nhập viện rồi, thử lại sau nhé~ 🌸'
        });
        return interaction.editReply({ embeds: [embed] });
    },
};
