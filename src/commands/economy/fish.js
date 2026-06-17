const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const FISH = require('../../data/fish');
const { onCooldown } = require('../../lib/cooldown');
const { fatigueMultiplier } = require('../../lib/fatigue');

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

        const u = await db.getUser(userId);
        const embed = new EmbedBuilder()
            .setColor(payout > 0 ? config.COLORS.SUCCESS : config.COLORS.WARNING)
            .setTitle('🎣 Đi câu cá')
            .setDescription(desc)
            .addFields(
                { name: '💵 Số dư ví', value: `${payout > 0 ? '+' + fmt(payout) + ' → ' : ''}**${fmt(u?.wallet || 0)}** ${config.CURRENCY}`, inline: false },
                { name: 'Năng lượng', value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
            )
            .setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
