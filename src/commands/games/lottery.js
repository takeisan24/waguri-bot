const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

// Thông báo nếu vòng cũ vừa được quay (lazy draw) trong lượt tương tác này.
function drawLine(draw) {
    if (draw && draw.drawn) {
        return `\n\n🎉 **Vòng #${draw.round} vừa quay!** <@${draw.winner}> ôm trọn **${fmt(draw.prize)}** ${config.CURRENCY} (${draw.total_tickets} vé)! 🎊`;
    }
    return '';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Xổ số cộng đồng 🎟️ — gom vé, ai trúng ôm cả hũ!')
        .addSubcommand(s => s.setName('info').setDescription('Xem hũ thưởng & vé của cậu'))
        .addSubcommand(s => s.setName('buy').setDescription('Mua vé xổ số')
            .addIntegerOption(o => o.setName('count').setDescription('Số vé muốn mua').setRequired(true).setMinValue(1).setMaxValue(config.LOTTERY.MAX_PER_BUY))),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'buy') {
            const count = interaction.options.getInteger('count');
            const r = await db.lotteryBuy(userId, count);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🎟️・Mua Vé Xổ Số', description: 'Ơ, lỗi xổ số, thử lại sau nhé~ 🌸' });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r.status === 'poor') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    title: '🎟️・Mua Vé Xổ Số',
                    description: `Cậu cần **${fmt(r.cost)}** ${config.CURRENCY} để mua ${count} vé mà ví chưa đủ~ 😟${drawLine(r.draw)}`
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const endTs = Math.floor(new Date(r.ends_at).getTime() / 1000);
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🎟️・Mua Vé Xổ Số',
                description: `Cậu mua **${count} vé** (**-${fmt(r.cost)}** ${config.CURRENCY}).\n` +
                    `🎫 Vé của cậu vòng này: **${fmt(r.my_tickets)}**\n` +
                    `💰 Hũ thưởng: **${fmt(r.pool)}** ${config.CURRENCY}\n` +
                    `⏰ Quay <t:${endTs}:R>${drawLine(r.draw)}`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // info
        const v = await db.lotteryView(userId);
        if (!v) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🎟️・Xổ Số Cộng Đồng', description: 'Ơ, lỗi xổ số, thử lại sau nhé~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }
        const endTs = Math.floor(new Date(v.ends_at).getTime() / 1000);
        const prize = Math.floor(Number(v.pool) * (1 - config.LOTTERY.HOUSE_CUT));
        const embed = buildWaguriEmbed(interaction, 'jackpot', {
            title: '🎟️・Xổ Số Cộng Đồng',
            description: `💰 Hũ thưởng vòng **#${v.round}**: **${fmt(v.pool)}** ${config.CURRENCY}\n` +
                `🏆 Người trúng nhận: **${fmt(prize)}** ${config.CURRENCY} *(nhà cái giữ ${Math.round(config.LOTTERY.HOUSE_CUT * 100)}%)*\n` +
                `🎫 Giá vé: **${fmt(config.LOTTERY.TICKET_PRICE)}** ${config.CURRENCY} · Vé của cậu: **${fmt(v.my_tickets)}**/${fmt(v.total_tickets)}\n` +
                `⏰ Quay <t:${endTs}:R>` +
                (v.last_winner ? `\n\n🎉 Vòng #${v.last_round}: <@${v.last_winner}> đã trúng **${fmt(v.last_prize)}** ${config.CURRENCY}!` : '')
        });
        
        embed.setFooter({
            text: `Mua vé: /lottery buy <số vé> • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });

        await interaction.editReply({ embeds: [embed] });
    },
};
