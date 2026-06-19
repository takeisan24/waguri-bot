const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Điểm danh nhận thưởng mỗi ngày'),
    async execute(interaction) {
        await interaction.deferReply();
        const r = await db.claimDaily(interaction.user.id);
        if (!r) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: 'Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }

        if (r.status === 'claimed') {
            const ts = Math.floor(new Date(r.next).getTime() / 1000);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `Hôm nay cậu điểm danh rồi mà~ Quay lại sau <t:${ts}:R> nhé! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        db.questIncr(interaction.user.id, 'daily', 1); // nhiệm vụ điểm danh
        const u = await db.getUser(interaction.user.id);

        let desc = `Cậu nhận được **${fmt(r.reward)}** ${config.CURRENCY}!`;
        if (r.milestone && Number(r.milestone) > 0) {
            desc += `\n🏆 **Mốc ${r.streak} ngày liên tiếp!** Thưởng thêm **+${fmt(r.milestone)}** ${config.CURRENCY} 🎉`;
        }
        if (r.interest && Number(r.interest) > 0) {
            desc += `\n📈 Lãi tiết kiệm ngân hàng (0.2%/ngày): **+${fmt(r.interest)}** ${config.CURRENCY} *(đã cộng vào bank)*.`;
        }
        if (r.tax && Number(r.tax) > 0) {
            desc += `\n🏛️ Thuế tài sản (1% phần vượt 100k): **-${fmt(r.tax)}** ${config.CURRENCY} *(người giàu góp ngân sách~)*.`;
        }
        if (r.clan_dividend && Number(r.clan_dividend) > 0) {
            desc += `\n🏰 Cổ tức bang hội: **+${fmt(r.clan_dividend)}** ${config.CURRENCY}`;
        }

        const description = `> ${desc}\n\n`;
        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '🎁・Điểm danh thành công!',
            description,
            fields: [
                { name: '🔥 Chuỗi ngày', value: `${r.streak} ngày liên tiếp`, inline: true },
                { name: '💵 Số dư ví', value: `${Number(u?.wallet || 0).toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
            ]
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
