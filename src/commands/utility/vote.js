const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { computeVoteReward } = require('../../lib/voteReward');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

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
        const locale = await getInteractionLanguage(interaction);
        const botId = interaction.client.user.id;
        const voteUrl = `https://top.gg/bot/${botId}/vote`;
        const C = config.CURRENCY;

        const voted = await hasVoted(botId, interaction.user.id);

        // Chưa cấu hình token, hoặc không gọi được API -> chỉ hiện link mời vote.
        if (voted === null) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.vote.title_main'),
                description: t(locale, 'commands.vote.desc_no_api', { url: voteUrl, reward: fmt(config.VOTE.REWARD, locale), currency: C, exp: config.VOTE.EXP })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Đã có thể check vote:
        if (!voted) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.vote.title_not_voted'),
                description: t(locale, 'commands.vote.desc_not_voted', { url: voteUrl, reward: fmt(config.VOTE.REWARD, locale), currency: C, exp: config.VOTE.EXP })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Đã vote -> phát thưởng 1 lần / chu kỳ 12h (chống nhận trùng bằng cooldown nguyên tử).
        const cd = await db.claimCooldown(interaction.user.id, 'vote_reward', config.VOTE.COOLDOWN_HOURS * 3600);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.vote.title_claimed'),
                description: t(locale, 'commands.vote.desc_claimed', { time: Math.floor(cd / 1000) })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        db.questIncr(interaction.user.id, 'vote', 1); // nhiệm vụ: vote Top.gg (đếm 1 lần/chu kỳ nhờ guard cooldown ở trên)
        const streak = await db.bumpVoteStreak(interaction.user.id, config.VOTE.STREAK_GRACE_HOURS * 3600);
        const { coins, exp, bonus } = computeVoteReward(streak, false);
        await db.addMoney(interaction.user.id, coins, 'wallet');
        await db.updateExp(interaction.user.id, exp);
        const bonusText = bonus > 0 ? t(locale, 'commands.vote.bonus_streak', { amount: fmt(bonus, locale), currency: C }) : '';
        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.vote.title_success'),
            description: t(locale, 'commands.vote.desc_success', { coins: fmt(coins, locale), currency: C, exp, streak, bonus: bonusText })
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
