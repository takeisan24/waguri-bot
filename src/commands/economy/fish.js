const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const FISH = require('../../data/fish');
const { onCooldown } = require('../../lib/cooldown');
const { fatigueMultiplier } = require('../../lib/fatigue');
const { getLevelFromExp, levelUpReward } = require('../../lib/leveling');
const { getEventMult } = require('../../lib/event');

const fmt = n => Number(n).toLocaleString('vi-VN');

function pickCatch() {
    const total = FISH.reduce((s, f) => s + f.weight, 0);
    let r = Math.random() * total;
    for (const f of FISH) {
        if (r < f.weight) return f;
        r -= f.weight;
    }
    return FISH[0];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Đi câu cá kiếm tiền (tốn năng lượng)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        const user = await db.getUser(userId);
        const userHealth = user && user.health !== undefined ? user.health : 100;
        if (userHealth < 30) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                title: '🎣・Đi câu cá',
                description: `🏥 Sức khỏe của cậu quá yếu (**${userHealth}/100** ❤️). Cậu cần ít nhất **30** sức khỏe để câu cá. Hãy dùng thuốc/hộp y tế (\`/eat\`) hoặc chạy lệnh \`/hospital\` để nhập viện nhé!`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Kiểm tra và sử dụng công cụ
        const toolResult = await db.useTool(userId, 'can_cau');
        if (!toolResult || toolResult.status === 'no_tool') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                title: '🎣・Đi câu cá',
                description: 'Cậu cần mua **Cần câu cá** 🎣 ở `/shop` mới đi câu được nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const cd = onCooldown('fish', userId, config.ACTION_COOLDOWN_MS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '🎣・Đi câu cá',
                description: `Từ từ thôi nào~ nghỉ ${cd}s rồi câu tiếp nhé! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const energyLeft = await db.spendEnergy(userId, config.FISH.ENERGY_COST);
        if (energyLeft < 0) {
            const cur = await db.getEnergy(userId);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '🎣・Đi câu cá',
                description: `Cậu hết năng lượng để câu rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${config.FISH.ENERGY_COST}). Nghỉ chút hoặc \`/eat\` nhé~ 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const c = pickCatch();
        let payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;
        const fatigue = fatigueMultiplier(userId);
        const gross = payout;
        if (payout > 0) payout = Math.round(payout * fatigue);
        const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
        if (premium && payout > 0) payout = Math.round(payout * (1 + config.PREMIUM.INCOME_BONUS));
        const eventMult = getEventMult();
        if (eventMult !== 1 && payout > 0) payout = Math.round(payout * eventMult);

        let desc;
        if (payout > 0) {
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'earn', payout);
            desc = `Cậu câu được ${c.emoji} **${c.name}** và bán được **+${fmt(payout)}** ${config.CURRENCY}!`
                + (fatigue < 1 && gross > 0 ? ` *(gốc ${fmt(gross)}, mệt -${Math.round((1 - fatigue) * 100)}%)*` : '')
                + (premium ? ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*` : '')
                + (eventMult > 1 ? ` *(Sự kiện x${eventMult} 🎉)*` : '');
        } else {
            desc = `Cậu chỉ câu phải ${c.emoji} **${c.name}**... chẳng được gì cả 😅 Lần sau may hơn nhé~`;
        }
        
        desc += `\nĐộ bền Cần câu: **${toolResult.durability}/100** 🎣` + (toolResult.broken ? ' *(đã hỏng! Cần mua mới hoặc sửa)*' : '');

        const u = await db.getUser(userId);
        let gainedExp = 4 + Math.floor(Math.random() * 3); // 4..6 EXP
        if (eventMult !== 1) gainedExp = Math.round(gainedExp * eventMult);
        const oldLevel = getLevelFromExp(Number(u?.exp || 0));
        const newExp = await db.updateExp(userId, gainedExp);
        const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);
        if (newLevel > oldLevel) {
            const bonus = levelUpReward(oldLevel, newLevel);
            if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
            desc += `\n🎉 Lên **Level ${newLevel}**! Thưởng **+${fmt(bonus)}** ${config.CURRENCY} 🎁`;
        }

        const embedType = payout > 0 ? 'success' : 'warning';
        const embed = buildWaguriEmbed(interaction, embedType, {
            title: '🎣・Đi câu cá',
            description: desc,
            fields: [
                { name: '💵 Số dư ví', value: `${payout > 0 ? '+' + fmt(payout) + ' → ' : ''}**${fmt(u?.wallet || 0)}** ${config.CURRENCY}`, inline: false },
                { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
                { name: 'Năng lượng', value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: '❤️ Sức khỏe', value: `${u && u.health !== undefined ? u.health : 100}/100`, inline: true }
            ]
        }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
