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
        .setName('balance')
        .setDescription('Xem ví, ngân hàng và cấp độ')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;

        const user = await db.getUser(target.id);
        if (!user) return interaction.editReply('Hơ, mình chưa lấy được dữ liệu của cậu, thử lại sau chút nhé~ 🌸');

        const p = getProgress(Number(user.exp));
        const wallet = Number(user.wallet).toLocaleString('vi-VN');
        const bank = Number(user.bank).toLocaleString('vi-VN');
        const energy = await db.getEnergy(target.id);

        const embed = new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setAuthor({ name: `Tài khoản của ${target.username}`, iconURL: target.displayAvatarURL() })
            .addFields(
                { name: '💵 Ví', value: `${wallet} ${config.CURRENCY}`, inline: true },
                { name: '🏦 Ngân hàng', value: `${bank} ${config.CURRENCY}`, inline: true },
                { name: '⚡ Năng lượng', value: `${energy}/${config.ENERGY.MAX}`, inline: true },
                { name: '⭐ Cấp độ', value: `Lv.${p.level}`, inline: true },
                { name: `📊 EXP (${p.expIntoLevel}/${p.expForNextLevel})`, value: makeBar(p.expIntoLevel, p.expForNextLevel), inline: false },
            )
            .setTimestamp();

        // Buff đang chạy (nếu có)
        if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
            const minsLeft = Math.ceil((new Date(user.buff_expires_at).getTime() - Date.now()) / 60000);
            const pct = Math.round((Number(user.buff_mult) - 1) * 100);
            embed.addFields({ name: '🍗 Buff', value: `+${pct}% thu nhập (còn ${minsLeft} phút)`, inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
