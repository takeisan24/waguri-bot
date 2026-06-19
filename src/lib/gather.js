const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const config = require('../config');
const { onCooldown } = require('./cooldown');
const { fatigueMultiplier } = require('./fatigue');
const { getLevelFromExp, levelUpReward } = require('./leveling');

const fmt = n => Number(n).toLocaleString('vi-VN');

function pick(table) {
    const total = table.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of table) { if (r < x.weight) return x; r -= x.weight; }
    return table[0];
}

/** Logic chung cho /fish-like (mine/chop): tốn năng lượng → random theo bảng → tiền. */
async function runGather(interaction, { title, table, energyCost = config.GATHER_ENERGY_COST, key = 'gather' }) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const toolMap = {
        mine: { id: 'cuoc_sat', name: 'Cuốc sắt', emoji: '⛏️' },
        chop: { id: 'riu_sat', name: 'Rìu sắt', emoji: '🪓' }
    };
    const tool = toolMap[key] || { id: 'riu_sat', name: 'Rìu sắt', emoji: '🪓' };

    const user = await db.getUser(userId);
    const userHealth = user && user.health !== undefined ? user.health : 100;
    if (userHealth < 30) {
        const typeStr = key === 'mine' ? 'đào mỏ' : 'chặt gỗ';
        return interaction.editReply(`🏥 Sức khỏe của cậu quá yếu (**${userHealth}/100** ❤️). Cậu cần ít nhất **30** sức khỏe để ${typeStr}. Hãy dùng thuốc/hộp y tế (\`/eat\`) hoặc chạy lệnh \`/hospital\` để nhập viện nhé!`);
    }

    // Kiểm tra và sử dụng công cụ
    const toolResult = await db.useTool(userId, tool.id);
    if (!toolResult || toolResult.status === 'no_tool') {
        return interaction.editReply(`Cậu cần mua **${tool.name}** ${tool.emoji} ở \`/shop\` mới thực hiện được nhé~ 🌸`);
    }

    const cd = onCooldown(key, userId, config.ACTION_COOLDOWN_MS);
    if (cd) return interaction.editReply(`Từ từ thôi nào~ nghỉ ${cd}s rồi làm tiếp nhé! 🌸`);

    const e = await db.spendEnergy(userId, energyCost);
    if (e < 0) {
        const cur = await db.getEnergy(userId);
        return interaction.editReply(`Cậu hết năng lượng rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${energyCost}). Nghỉ chút hoặc \`/eat\` nhé~ 🌸`);
    }

    const c = pick(table);
    let payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;
    const fatigue = fatigueMultiplier(userId);
    const gross = payout;
    if (payout > 0) payout = Math.round(payout * fatigue);
    const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
    if (premium && payout > 0) payout = Math.round(payout * (1 + config.PREMIUM.INCOME_BONUS));

    let desc;
    if (payout > 0) {
        await db.addMoney(userId, payout, 'wallet');
        db.questIncr(userId, 'earn', payout);
        desc = `Cậu thu được ${c.emoji} **${c.name}** và bán được **+${fmt(payout)}** ${config.CURRENCY}!`
            + (fatigue < 1 && gross > 0 ? ` *(gốc ${fmt(gross)}, mệt -${Math.round((1 - fatigue) * 100)}%)*` : '')
            + (premium ? ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*` : '');
    } else {
        desc = `Cậu chỉ nhặt được ${c.emoji} **${c.name}**... chẳng đáng bao nhiêu 😅`;
    }

    // Rơi nguyên liệu chế tạo (dùng cho /craft)
    const DROPS = { mine: ['quang_sat', 'da'], chop: ['go'] };
    if (DROPS[key] && Math.random() < 0.45) {
        const matId = DROPS[key][Math.floor(Math.random() * DROPS[key].length)];
        await db.giveItemAdmin(userId, matId, 1);
        const it = await db.getItem(matId);
        desc += `\n🎒 Nhặt thêm: **1× ${it?.name || matId}** *(để \`/craft\`)*`;
    }

    desc += `\nĐộ bền ${tool.name}: **${toolResult.durability}/100** ${tool.emoji}` + (toolResult.broken ? ' *(đã hỏng! Cần mua mới hoặc sửa)*' : '');

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

    await interaction.editReply({ embeds: [new EmbedBuilder()
        .setColor(payout > 0 ? config.COLORS.SUCCESS : config.COLORS.WARNING)
        .setTitle(title).setDescription(desc)
        .addFields(
            { name: '💵 Số dư ví', value: `${payout > 0 ? '+' + fmt(payout) + ' → ' : ''}**${fmt(u?.wallet || 0)}** ${config.CURRENCY}`, inline: false },
            { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
            { name: 'Năng lượng', value: `${e}/${config.ENERGY.MAX} ⚡`, inline: true },
            { name: '❤️ Sức khỏe', value: `${u && u.health !== undefined ? u.health : 100}/100`, inline: true },
        )] });
}

module.exports = { runGather };
