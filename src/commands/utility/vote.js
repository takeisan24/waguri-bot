const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { computeVoteReward } = require('../../lib/voteReward');

const fmt = n => Number(n).toLocaleString('vi-VN');

// Hỏi Top.gg xem user đã vote trong 12h gần nhất chưa. Trả true/false/null(không check được).
async function hasVoted(botId, userId) {
    const token = process.env.TOPGG_TOKEN;
    if (!token) return null;
    try {
        const r = await fetch(`https://top.gg/api/bots/${botId}/check?userId=${userId}`, {
            headers: { Authorization: token },
        });
        if (!r.ok) return null;
        const data = await r.json();
        return Number(data.voted) === 1;
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote cho Waguri trên Top.gg để nhận thưởng 💝'),
    async execute(interaction) {
        await interaction.deferReply();
        const botId = interaction.client.user.id;
        const voteUrl = `https://top.gg/bot/${botId}/vote`;
        const C = config.CURRENCY;

        const voted = await hasVoted(botId, interaction.user.id);

        // Chưa cấu hình token, hoặc không gọi được API -> chỉ hiện link mời vote.
        if (voted === null) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '💝・Vote cho Waguri',
                description: `Cậu vote ủng hộ mình trên Top.gg nha, mỗi lượt giúp mình tiếp cận nhiều bạn hơn đó~ 🌸\n\n[**🗳️ Bấm để vote (12 tiếng/lần)**](${voteUrl})\n\n*Vote xong quay lại gõ \`/vote\` để nhận **${fmt(config.VOTE.REWARD)}** ${C} + **${config.VOTE.EXP} EXP** nhé!*`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Đã có thể check vote:
        if (!voted) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '💝・Cậu chưa vote',
                description: `Mình chưa thấy lượt vote của cậu hôm nay~\n\n[**🗳️ Vote tại đây**](${voteUrl}) rồi quay lại nhận **${fmt(config.VOTE.REWARD)}** ${C} + **${config.VOTE.EXP} EXP** nha! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Đã vote -> phát thưởng 1 lần / chu kỳ 12h (chống nhận trùng bằng cooldown nguyên tử).
        const cd = await db.claimCooldown(interaction.user.id, 'vote_reward', config.VOTE.COOLDOWN_HOURS * 3600);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '💝・Đã nhận thưởng rồi',
                description: `Cậu đã nhận thưởng cho lượt vote này rồi nha~ Vote lại được <t:${Math.floor(cd / 1000)}:R>. Cảm ơn cậu nhiều! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const streak = await db.bumpVoteStreak(interaction.user.id, config.VOTE.STREAK_GRACE_HOURS * 3600);
        const { coins, exp, bonus } = computeVoteReward(streak, false);
        await db.addMoney(interaction.user.id, coins, 'wallet');
        await db.updateExp(interaction.user.id, exp);
        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '💝・Cảm ơn cậu đã vote!',
            description: `Waguri tặng cậu **${fmt(coins)}** ${C} + **${exp} EXP** nè! 🎁\n` +
                `🔥 Chuỗi vote: **${streak} ngày**${bonus > 0 ? ` (+${fmt(bonus)} ${C} thưởng chuỗi)` : ''}\n` +
                `Nhớ ghé vote tiếp sau 12 tiếng để giữ chuỗi nha~ Cảm ơn cậu đã luôn ủng hộ mình 🌸`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
