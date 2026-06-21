const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');

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

        const embed = buildWaguriEmbed(interaction, active ? 'jackpot' : 'info', {
            title: '💎 Waguri Premium',
            description: active
                ? `Cậu đang là **Premium** 💎 — hết hạn <t:${Math.floor(until.getTime() / 1000)}:R>. Cảm ơn cậu nhiều nha~ 🌸\n` +
                  `Muốn gia hạn? Ghé **[trang Premium](${config.WEB_URL}/dashboard/premium)** nhé 💕`
                : 'Cậu đang dùng gói **Miễn phí**. Nâng cấp Premium để trò chuyện với mình thoải mái hơn nhé~ 💕\n' +
                  `👉 Mua tại **[trang Premium](${config.WEB_URL}/dashboard/premium)** — quét VietQR, kích hoạt **tự động** trong vài giây!`,
            fields: [
                { name: '💬 Lượt chat AI hôm nay', value: `${used}/${cap}`, inline: true },
                { name: '🎁 Quyền lợi Premium', value:
                    `• **${config.AI.PREMIUM_DAILY} lượt** chat AI/ngày (gấp 10 lần)\n` +
                    `• **+${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% thu nhập** khi /work /fish /mine /chop\n` +
                    '• Huy hiệu 💎 trong hồ sơ\n' +
                    '• Được ưu tiên trải nghiệm tính năng mới', inline: false },
                { name: '💰 Bảng giá', value:
                    Object.values(config.PREMIUM.PLANS)
                        .map(p => `• **${p.label}** — ${Number(p.amount).toLocaleString('vi-VN')}đ`)
                        .join('\n'), inline: false },
            ]
        });

        embed.setFooter({
            text: `Quét VietQR · kích hoạt tự động 💎 • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });

        await interaction.editReply({ embeds: [embed] });
    },
};
