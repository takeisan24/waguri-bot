const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

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
function comment(p, locale) {
    if (p >= 90) return t(locale, 'commands.ship.comment_90') || 'Trời sinh một cặp luôn! 😍';
    if (p >= 70) return t(locale, 'commands.ship.comment_70') || 'Hợp nhau ghê đó~ 🥰';
    if (p >= 50) return t(locale, 'commands.ship.comment_50') || 'Cũng tiềm năng lắm nha! 😊';
    if (p >= 30) return t(locale, 'commands.ship.comment_30') || 'Cần cố gắng thêm chút nhé~ 😅';
    return t(locale, 'commands.ship.comment_0') || 'Hơi khó nha... nhưng tình yêu là vô hạn mà! 💪';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Đo độ hợp giữa hai người')
        .addUserOption(o => o.setName('user1').setDescription('Người thứ nhất').setRequired(true))
        .addUserOption(o => o.setName('user2').setDescription('Người thứ hai (mặc định: bạn)')),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const a = interaction.options.getUser('user1');
        const b = interaction.options.getUser('user2') || interaction.user;
        if (a.id === b.id) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.ship.err_self')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const p = compat(a.id, b.id);
        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.ship.embed_title'),
            description: `<@${a.id}> 💞 <@${b.id}>\n\n${bar(p)}\n**${p}%** — ${comment(p, locale)}`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
