const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { restFatigue } = require('../../lib/fatigue');

// Độ hợp ổn định theo cặp (cùng cặp luôn ra cùng %)
function compat(a, b) {
    const s = [a, b].sort().join('-');
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 101;
}
function bar(p) {
    const f = Math.round(p / 10);
    return '💖'.repeat(f) + '🤍'.repeat(10 - f);
}
function comment(p) {
    if (p >= 90) return 'Trời sinh một cặp luôn! 😍';
    if (p >= 70) return 'Hợp nhau ghê đó~ 🥰';
    if (p >= 50) return 'Cũng tiềm năng lắm nha! 😊';
    if (p >= 30) return 'Cần cố gắng thêm chút nhé~ 😅';
    return 'Hơi khó nha... nhưng tình yêu là vô hạn mà! 💪';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Đo độ hợp giữa hai người')
        .addUserOption(o => o.setName('user1').setDescription('Người thứ nhất').setRequired(true))
        .addUserOption(o => o.setName('user2').setDescription('Người thứ hai (mặc định: bạn)')),
    async execute(interaction) {
        await interaction.deferReply();
        restFatigue(interaction.user.id, 1); // giải trí giảm mệt
        const a = interaction.options.getUser('user1');
        const b = interaction.options.getUser('user2') || interaction.user;
        if (a.id === b.id) return interaction.editReply('Ghép một người với chính họ thì... 100% yêu bản thân nhé! 💖');

        const p = compat(a.id, b.id);
        const embed = new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setTitle('💘 Đo độ hợp')
            .setDescription(`<@${a.id}> 💞 <@${b.id}>\n\n${bar(p)}\n**${p}%** — ${comment(p)}`);
        await interaction.editReply({ embeds: [embed] });
    },
};
