const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const FISH = require('../../data/fish');
const { onCooldown } = require('../../lib/cooldown');
const { fatigueMultiplier } = require('../../lib/fatigue');
const { getLevelFromExp, levelUpReward } = require('../../lib/leveling');

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
            return interaction.editReply(`🏥 Sức khỏe của cậu quá yếu (**${userHealth}/100** ❤️). Cậu cần ít nhất **30** sức khỏe để câu cá. Hãy dùng thuốc/hộp y tế (\`/eat\`) hoặc chạy lệnh \`/hospital\` để nhập viện nhé!`);
        }

        // Kiểm tra và sử dụng công cụ
        const toolResult = await db.useTool(userId, 'can_cau');
        if (!toolResult || toolResult.status === 'no_tool') {
            return interaction.editReply('Cậu cần mua **Cần câu cá** 🎣 ở `/shop` mới đi câu được nhé~ 🌸');
        }

        const cd = onCooldown('fish', userId, config.ACTION_COOLDOWN_MS);
        if (cd) return interaction.editReply(`Từ từ thôi nào~ nghỉ ${cd}s rồi câu tiếp nhé! 🌸`);

        const energyLeft = await db.spendEnergy(userId, config.FISH.ENERGY_COST);
        if (energyLeft < 0) {
            const cur = await db.getEnergy(userId);
            return interaction.editReply(
                `Cậu hết năng lượng để câu rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${config.FISH.ENERGY_COST}). ` +
                `Nghỉ chút hoặc \`/eat\` nhé~ 🌸`
            );
        }

        const c = pickCatch();
        let payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;
        const fatigue = fatigueMultiplier(userId);
        const gross = payout;
        if (payout > 0) payout = Math.round(payout * fatigue);

        let desc;
        if (payout > 0) {
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'earn', payout);
            desc = `Cậu câu được ${c.emoji} **${c.name}** và bán được **+${fmt(payout)}** ${config.CURRENCY}!`
                + (fatigue < 1 && gross > 0 ? ` *(gốc ${fmt(gross)}, mệt -${Math.round((1 - fatigue) * 100)}%)*` : '');
        } else {
            desc = `Cậu chỉ câu phải ${c.emoji} **${c.name}**... chẳng được gì cả 😅 Lần sau may hơn nhé~`;
        }
        
        desc += `\nĐộ bền Cần câu: **${toolResult.durability}/100** 🎣` + (toolResult.broken ? ' *(đã hỏng! Cần mua mới hoặc sửa)*' : '');

        const u = await db.getUser(userId);
        const gainedExp = 4 + Math.floor(Math.random() * 3); // 4..6 EXP
        const oldLevel = getLevelFromExp(Number(u?.exp || 0));
        const newExp = await db.updateExp(userId, gainedExp);
        const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);
        if (newLevel > oldLevel) {
            const bonus = levelUpReward(oldLevel, newLevel);
            if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
            desc += `\n🎉 Lên **Level ${newLevel}**! Thưởng **+${fmt(bonus)}** ${config.CURRENCY} 🎁`;
        }

        const embed = new EmbedBuilder()
            .setColor(payout > 0 ? config.COLORS.SUCCESS : config.COLORS.WARNING)
            .setTitle('🎣 Đi câu cá')
            .setDescription(desc)
            .addFields(
                { name: '💵 Số dư ví', value: `${payout > 0 ? '+' + fmt(payout) + ' → ' : ''}**${fmt(u?.wallet || 0)}** ${config.CURRENCY}`, inline: false },
                { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
                { name: 'Năng lượng', value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: '❤️ Sức khỏe', value: `${u && u.health !== undefined ? u.health : 100}/100`, inline: true },
            )
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
