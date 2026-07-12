const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { handleNewbieQuest } = require('../../lib/newbie');
const { t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Điểm danh nhận thưởng mỗi ngày'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = interaction.locale;
        const r = await db.claimDaily(interaction.user.id);
        if (!r) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: t(locale, 'common.retry_later') });
            return interaction.editReply({ embeds: [embed] });
        }

        if (r.status === 'claimed') {
            const ts = Math.floor(new Date(r.next).getTime() / 1000);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.daily.already_claimed', { time: `<t:${ts}:R>` })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        db.questIncr(interaction.user.id, 'daily', 1); // nhiệm vụ điểm danh
        await handleNewbieQuest(interaction, 'daily', 1);
        const u = await db.getUser(interaction.user.id);

        // Chào người vắng lâu (last_seen = mốc điểm danh hiện diện gần nhất).
        const prevSeen = await db.touchLastSeen(interaction.user.id);
        let greet = '';
        if (prevSeen && Date.now() - prevSeen >= config.RETURN_GREET_DAYS * 86400000) {
            const days = Math.floor((Date.now() - prevSeen) / 86400000);
            greet = t(locale, 'commands.daily.greet_return', { days });
        }

        let desc = t(locale, 'commands.daily.nudge_newbie', { amount: fmt(r.reward, locale), currency: config.CURRENCY });
        // Sửa logic dịch: Cậu nhận được...
        let rewardsDesc = locale.startsWith('en') 
            ? `You received **${fmt(r.reward, locale)}** ${config.CURRENCY}!` 
            : `Cậu nhận được **${fmt(r.reward, locale)}** ${config.CURRENCY}!`;

        if (r.streak_freeze_used) {
            rewardsDesc += t(locale, 'commands.daily.streak_freeze_activated', { streak: r.streak });
        }
        if (r.milestone && Number(r.milestone) > 0) {
            rewardsDesc += t(locale, 'commands.daily.milestone', { streak: r.streak, amount: fmt(r.milestone, locale), currency: config.CURRENCY });
        }
        if (r.interest && Number(r.interest) > 0) {
            rewardsDesc += t(locale, 'commands.daily.interest', { amount: fmt(r.interest, locale), currency: config.CURRENCY });
        }
        if (r.tax && Number(r.tax) > 0) {
            rewardsDesc += t(locale, 'commands.daily.tax', { amount: fmt(r.tax, locale), currency: config.CURRENCY });
        }
        if (r.clan_dividend && Number(r.clan_dividend) > 0) {
            rewardsDesc += t(locale, 'commands.daily.dividend', { amount: fmt(r.clan_dividend, locale), currency: config.CURRENCY });
        }

        // Cộng XP Battle Pass (+100 XP)
        const bpRes = await require('../../lib/battlepass').addXp(interaction.user.id, 100);
        if (bpRes && bpRes.levelUp) {
            rewardsDesc += t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel });
        }

        const nudge = (u && !u.onboarded)
            ? t(locale, 'commands.daily.nudge_newbie')
            : t(locale, 'commands.daily.nudge_member');
        const description = greet + `> ${rewardsDesc}\n\n` + nudge;
        
        const embed = buildWaguriEmbed(interaction, 'success', {
            title: t(locale, 'commands.daily.success_title'),
            description,
            fields: [
                { name: t(locale, 'commands.daily.field_streak'), value: t(locale, 'commands.daily.field_streak_val', { streak: r.streak }), inline: true },
                { name: t(locale, 'commands.daily.field_wallet'), value: `${fmt(u?.wallet || 0, locale)} ${config.CURRENCY}`, inline: true },
            ]
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
