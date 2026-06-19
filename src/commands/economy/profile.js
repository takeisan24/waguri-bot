const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getProgress } = require('../../lib/leveling');

function makeBar(cur, max, size = 12) {
    const ratio = max > 0 ? Math.min(cur / max, 1) : 0;
    const filled = Math.round(ratio * size);
    return '█'.repeat(filled) + '░'.repeat(size - filled);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem hồ sơ tổng quan')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;
        const user = await db.getUser(target.id);
        if (!user) return interaction.editReply('Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸');

        const energy = await db.getEnergy(target.id);
        const job = user.job_id ? await db.getJob(user.job_id) : null;
        const p = getProgress(Number(user.exp));
        const wallet = Number(user.wallet), bank = Number(user.bank);
        const networth = wallet + bank;

        const HEX = /^[0-9a-fA-F]{6}$/;
        const color = user.profile_color && HEX.test(user.profile_color) ? parseInt(user.profile_color, 16) : config.COLORS.INFO;
        const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`🪪 Hồ sơ của ${target.username}${premium ? ' 💎' : ''}`)
            .setThumbnail(target.displayAvatarURL());
        if (user.title) embed.setDescription(`🏷️ *${user.title}*`);
        embed.addFields(
                { name: '💼 Nghề', value: job ? job.name : 'Chưa có nghề', inline: true },
                { name: '⭐ Cấp độ', value: `Lv.${p.level}`, inline: true },
                { name: '⚡ Năng lượng', value: `${energy}/${config.ENERGY.MAX}`, inline: true },
                { name: '💵 Ví', value: `${wallet.toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: '🏦 Ngân hàng', value: `${bank.toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: '💎 Tổng tài sản', value: `${networth.toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: `📊 EXP (${p.expIntoLevel}/${p.expForNextLevel})`, value: makeBar(p.expIntoLevel, p.expForNextLevel), inline: false },
            )
            .setTimestamp();

        if (user.partner_id) {
            embed.addFields({ name: '💞 Người ấy', value: `<@${user.partner_id}>`, inline: false });
        }
        if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
            const pct = Math.round((Number(user.buff_mult) - 1) * 100);
            embed.setFooter({ text: `🍗 Buff +${pct}% thu nhập đang chạy` });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
