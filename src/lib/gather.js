const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const config = require('../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

function pick(table) {
    const total = table.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of table) { if (r < x.weight) return x; r -= x.weight; }
    return table[0];
}

/** Logic chung cho /fish-like (mine/chop): tốn năng lượng → random theo bảng → tiền. */
async function runGather(interaction, { title, table, energyCost = config.GATHER_ENERGY_COST }) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const e = await db.spendEnergy(userId, energyCost);
    if (e < 0) {
        const cur = await db.getEnergy(userId);
        return interaction.editReply(`Cậu hết năng lượng rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${energyCost}). Nghỉ chút hoặc \`/eat\` nhé~ 🌸`);
    }

    const c = pick(table);
    const payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;

    let desc;
    if (payout > 0) {
        await db.addMoney(userId, payout, 'wallet');
        db.questIncr(userId, 'earn', payout);
        desc = `Cậu thu được ${c.emoji} **${c.name}** và bán được **+${fmt(payout)}** ${config.CURRENCY}!`;
    } else {
        desc = `Cậu chỉ nhặt được ${c.emoji} **${c.name}**... chẳng đáng bao nhiêu 😅`;
    }

    await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(payout > 0 ? config.COLORS.SUCCESS : config.COLORS.WARNING)
        .setTitle(title).setDescription(desc)
        .addFields({ name: 'Năng lượng', value: `${e}/${config.ENERGY.MAX} ⚡`, inline: true })] });
}

module.exports = { runGather };
