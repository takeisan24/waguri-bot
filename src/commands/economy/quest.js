const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { pickDailyQuests } = require('../../data/quests');
const { createWaguriBar, buildWaguriEmbed, getWaguriFooter } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Nhiệm vụ hằng ngày (tự nhận thưởng khi xong)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        // Bộ nhiệm vụ của riêng người này hôm nay (PINNED điểm danh + vote, cộng vài quest random).
        const QUESTS = pickDailyQuests(userId);

        let { counters, claimed } = await db.getQuestRow(userId);

        // Tự nhận thưởng các nhiệm vụ đã hoàn thành mà chưa nhận
        let totalReward = 0;
        for (const q of QUESTS) {
            const cur = Number(counters[q.key] || 0);
            if (cur >= q.required && !claimed[q.id]) {
                const r = await db.questClaim(userId, q);
                if (r === 'ok') { totalReward += q.reward; claimed[q.id] = true; }
            }
        }

        const lines = QUESTS.map(q => {
            const cur = Math.min(Number(counters[q.key] || 0), q.required);
            const done = claimed[q.id];
            const icon = done ? '✅' : (cur >= q.required ? '🎁' : '⬜');
            return `${icon} **${q.name}** — ${cur}/${q.required}\n` +
                `　${createWaguriBar(cur, q.required, 8)} · 🪙 ${fmt(q.reward)} ${config.CURRENCY}`;
        });

        const embed = buildWaguriEmbed(interaction, 'info', {
            title: '📜・Nhiệm vụ hằng ngày của cậu',
            description: lines.join('\n')
        });

        const footerObj = getWaguriFooter(interaction.client);
        footerObj.text = 'Làm xong tự nhận thưởng khi gõ /quest · ' + footerObj.text;
        embed.setFooter(footerObj);

        if (totalReward > 0) {
            embed.addFields({ name: '🎉 Vừa nhận', value: `+${fmt(totalReward)} ${config.CURRENCY}!`, inline: false });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
