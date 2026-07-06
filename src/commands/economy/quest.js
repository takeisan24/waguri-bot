const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { pickDailyQuests } = require('../../data/quests');
const { createWaguriBar, buildWaguriEmbed, getWaguriFooter } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

const NEWBIE_STEPS = [
    null,
    { name: 'Bước 1: Điểm danh đầu tiên', key: 'daily', required: 1, reward: 1000, hint: 'Gõ `/daily` để nhận lương ngày đầu 📅' },
    { name: 'Bước 2: Chăm chỉ làm việc', key: 'work', required: 3, reward: 1500, hint: 'Gõ `/work` 3 lần để kiếm tiền ⚡' },
    { name: 'Bước 3: Mua sắm trải nghiệm', key: 'buy', required: 1, reward: 2000, hint: 'Mua 1 món bất kỳ tại `/shop` hoặc `/buy` 🛒' },
    { name: 'Bước 4: Xin việc chính thức', key: 'apply_job', required: 1, reward: 2500, hint: 'Nhận một công việc chính thức bằng `/jobs xin` 🧑‍💼' },
    { name: 'Bước 5: Trải nghiệm may rủi', key: 'gamble', required: 1, reward: 3000, hint: 'Chơi 1 ván game bất kỳ (vd `/taixiu`, `/blackjack`, `/xocdia`...) 🪙' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Nhiệm vụ hằng ngày & tân thủ (tự nhận thưởng khi xong)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        // Lấy thông tin user để xem tiến trình tân thủ
        const user = await db.getUser(userId);
        const step = user ? Number(user.newbie_step || 1) : 1;
        const progress = user ? Number(user.newbie_progress || 0) : 0;

        let newbieText = '';
        if (step <= 5) {
            const ns = NEWBIE_STEPS[step];
            const cur = Math.min(progress, ns.required);
            newbieText = `🔰 **[NHIỆM VỤ TÂN THỦ] ${ns.name}**\n` +
                `　*Yêu cầu:* ${ns.hint}\n` +
                `　*Tiến trình:* **${cur}/${ns.required}**\n` +
                `　${createWaguriBar(cur, ns.required, 8)} · 🪙 ${fmt(ns.reward)} ${config.CURRENCY}\n\n` +
                `──────────────────────────────\n\n`;
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
            return `${icon} **${q.name}** — ${cur}/${q.required}\n` +
                `　${createWaguriBar(cur, q.required, 8)} · 🪙 ${fmt(q.reward)} ${config.CURRENCY}`;
        });

        const embed = buildWaguriEmbed(interaction, 'info', {
            title: '📜・Nhiệm vụ của cậu',
            description: newbieText + lines.join('\n')
        });

        const footerObj = getWaguriFooter(interaction.client);
        footerObj.text = 'Nhiệm vụ tân thủ tự cộng/nhận thưởng · ' + footerObj.text;
        embed.setFooter(footerObj);

        // Cộng XP Sổ Sứ Mệnh (+150 XP mỗi quest)
        let bpMsg = '';
        if (claimedCount > 0) {
            const bpRes = await require('../../lib/battlepass').addXp(userId, claimedCount * 150);
            if (bpRes && bpRes.levelUp) {
                bpMsg = `🎉 **Sổ Sứ Mệnh**: Cậu đã đạt **Cấp ${bpRes.newLevel}**! Gõ \`/pass\` nhận quà nha~ 🎁`;
            }
        }

        if (totalReward > 0) {
            let val = `+${fmt(totalReward)} ${config.CURRENCY}!`;
            if (claimedCount > 0) {
                val += `\n+${claimedCount * 150} XP Sổ Sứ Mệnh 📖`;
            }
            embed.addFields({ name: '🎉 Vừa nhận thưởng ngày', value: val, inline: false });
        }

        if (bpMsg) {
            embed.addFields({ name: '🎉 Lên Cấp Sổ Sứ Mệnh', value: bpMsg, inline: false });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
