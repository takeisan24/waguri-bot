const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { pickDailyQuests } = require('../../data/quests');
const { createWaguriBar, buildWaguriEmbed, getWaguriFooter } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Nhiệm vụ hằng ngày & tân thủ (tự nhận thưởng khi xong)'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;

        // Lấy thông tin user để xem tiến trình tân thủ
        const user = await db.getUser(userId);
        const step = user ? Number(user.newbie_step || 1) : 1;
        const progress = user ? Number(user.newbie_progress || 0) : 0;

        let newbieText = '';
        if (step <= 5) {
            const nsName = t(locale, `commands.quest.newbie_steps.${step}.name`);
            const nsHint = t(locale, `commands.quest.newbie_steps.${step}.hint`);
            const req = { 1: 1, 2: 3, 3: 1, 4: 1, 5: 1 }[step];
            const reward = { 1: 1000, 2: 1500, 3: 2000, 4: 2500, 5: 3000 }[step];
            const cur = Math.min(progress, req);

            newbieText = t(locale, 'commands.quest.newbie_text', {
                name: nsName,
                hint: nsHint,
                current: cur,
                required: req,
                bar: createWaguriBar(cur, req, 8),
                reward: fmt(reward, locale),
                currency: config.CURRENCY
            });
        }

        // Bộ nhiệm vụ của riêng người này hôm nay (PINNED điểm danh + vote, cộng vài quest random).
        const QUESTS = pickDailyQuests(userId);

        let { counters, claimed } = await db.getQuestRow(userId);

        // Tự nhận thưởng các nhiệm vụ đã hoàn thành mà chưa nhận
        let totalReward = 0;
        let claimedCount = 0;
        for (const q of QUESTS) {
            const cur = Number(counters[q.key] || 0);
            if (cur >= q.required && !claimed[q.id]) {
                const r = await db.questClaim(userId, q);
                if (r === 'ok') { 
                    totalReward += q.reward; 
                    claimed[q.id] = true; 
                    claimedCount++;
                }
            }
        }

        const lines = QUESTS.map(q => {
            const cur = Math.min(Number(counters[q.key] || 0), q.required);
            const done = claimed[q.id];
            const icon = done ? '✅' : (cur >= q.required ? '🎁' : '⬜');
            const qName = t(locale, `data.quests.${q.id}.name`) || q.name;
            return `${icon} **${qName}** — ${cur}/${q.required}\n` +
                `　${createWaguriBar(cur, q.required, 8)} · 🪙 ${fmt(q.reward, locale)} ${config.CURRENCY}`;
        });

        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.quest.title'),
            description: newbieText + lines.join('\n')
        });

        const footerObj = getWaguriFooter(interaction.client, locale);
        footerObj.text = t(locale, 'commands.quest.footer_prefix') + ' · ' + footerObj.text;
        embed.setFooter(footerObj);

        // Cộng XP Sổ Sứ Mệnh (+150 XP mỗi quest)
        let bpMsg = '';
        if (claimedCount > 0) {
            const bpRes = await require('../../lib/battlepass').addXp(userId, claimedCount * 150);
            if (bpRes && bpRes.levelUp) {
                bpMsg = t(locale, 'commands.quest.bp_levelup_desc', { level: bpRes.newLevel });
            }
        }

        if (totalReward > 0) {
            let val = `+${fmt(totalReward, locale)} ${config.CURRENCY}!`;
            if (claimedCount > 0) {
                val += `\n+${claimedCount * 150} XP ` + t(locale, 'commands.quest.bp_xp_label');
            }
            embed.addFields({ name: t(locale, 'commands.quest.reward_claimed_title'), value: val, inline: false });
        }

        if (bpMsg) {
            embed.addFields({ name: t(locale, 'commands.quest.bp_levelup_title'), value: bpMsg, inline: false });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
