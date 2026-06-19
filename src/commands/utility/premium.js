const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Xem trạng thái & quyền lợi Waguri Premium 💎'),
    async execute(interaction) {
        await interaction.deferReply();
        const u = await db.getUser(interaction.user.id);
        const until = u?.premium_until ? new Date(u.premium_until) : null;
        const active = until && until.getTime() > Date.now();
        const today = new Date().toISOString().slice(0, 10);
        const used = (u?.ai_used_date && String(u.ai_used_date).slice(0, 10) === today) ? Number(u.ai_used || 0) : 0;
        const cap = active ? config.AI.PREMIUM_DAILY : config.AI.FREE_DAILY;

        const embed = new EmbedBuilder()
            .setColor(active ? config.COLORS.JACKPOT : config.COLORS.INFO)
            .setTitle('💎 Waguri Premium')
            .setDescription(active
                ? `Cậu đang là **Premium** 💎 — hết hạn <t:${Math.floor(until.getTime() / 1000)}:R>. Cảm ơn cậu nhiều nha~ 🌸`
                : 'Cậu đang dùng gói **Miễn phí**. Nâng cấp Premium để trò chuyện với mình thoải mái hơn nhé~ 💕')
            .addFields(
                { name: '💬 Lượt chat AI hôm nay', value: `${used}/${cap}`, inline: true },
                { name: '🎁 Quyền lợi Premium', value:
                    `• **${config.AI.PREMIUM_DAILY} lượt** chat AI/ngày (gấp 10 lần)\n` +
                    `• **+${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% thu nhập** khi /work /fish /mine /chop\n` +
                    '• Huy hiệu 💎 trong hồ sơ\n' +
                    '• Được ưu tiên trải nghiệm tính năng mới', inline: false },
            )
            .setFooter({ text: 'Liên hệ owner để nâng cấp (cổng thanh toán sắp ra mắt) 💎' });
        await interaction.editReply({ embeds: [embed] });
    },
};
