const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const config = require('../config');
const { onCooldown } = require('./cooldown');
const { conditionMultiplier } = require('./fatigue');
const { applyDisease } = require('./disease');
const { getLevelFromExp, levelUpReward } = require('./leveling');
const { getEventMult } = require('./event');
const { buildWaguriEmbed } = require('./embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

function pick(table) {
    const total = table.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of table) { if (r < x.weight) return x; r -= x.weight; }
    return table[0];
}

/** Logic chung cho /fish-like (mine/chop): tốn năng lượng → random theo bảng → tiền. */
async function runGather(interaction, { title, table, energyCost = config.GATHER_ENERGY_COST, key = 'gather' }) {
    // Interaction có thể hết hạn (10062) nếu mạng host chậm -> defer fail thì bỏ qua, tránh lỗi dây chuyền.
    try { await interaction.deferReply(); } catch { return; }
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
        const embed = buildWaguriEmbed(interaction, 'error', {
            description: `🏥 Sức khỏe của cậu quá yếu (**${userHealth}/100** ❤️). Cậu cần ít nhất **30** sức khỏe để ${typeStr}. Hãy dùng thuốc/hộp y tế (\`/eat\`) hoặc chạy lệnh \`/hospital\` để nhập viện nhé!`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    // Kiểm tra và sử dụng công cụ
    const toolResult = await db.useTool(userId, tool.id);
    if (!toolResult || toolResult.status === 'no_tool') {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: `Cậu cần mua **${tool.name}** ${tool.emoji} ở \`/shop\` mới thực hiện được nhé~ 🌸`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const cd = onCooldown(key, userId, config.ACTION_COOLDOWN_MS);
    if (cd) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: `Từ từ thôi nào~ nghỉ ${cd}s rồi làm tiếp nhé! 🌸`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    // Kiểm tra Pet để kích hoạt buff
    const userPet = await db.getPet(userId);
    const { petLevel } = require('../data/pets');
    
    // 1) Thỏ con: giảm năng lượng tiêu hao
    let actualEnergyCost = energyCost;
    let thoBuff = false;
    let thoName = '';
    if (userPet && userPet.species === 'tho') {
        const thoLvl = petLevel(userPet.exp);
        if (thoLvl >= 5) {
            thoBuff = true;
            thoName = userPet.name || 'Thỏ con';
            actualEnergyCost = Math.round(energyCost * 0.85);
        }
    }

    // 2) Gấu con: tăng sản lượng payout
    let gauBuff = false;
    let gauName = '';
    if (userPet && userPet.species === 'gau') {
        const gauLvl = petLevel(userPet.exp);
        if (gauLvl >= 5) {
            gauBuff = true;
            gauName = userPet.name || 'Gấu con';
        }
    }

    // 3) Rồng con: tăng EXP
    let rongBuff = false;
    let rongName = '';
    if (userPet && userPet.species === 'rong') {
        const rongLvl = petLevel(userPet.exp);
        if (rongLvl >= 5) {
            rongBuff = true;
            rongName = userPet.name || 'Rồng con';
        }
    }

    const e = await db.spendEnergy(userId, actualEnergyCost);
    if (e < 0) {
        const cur = await db.getEnergy(userId);
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: `Cậu hết năng lượng rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${actualEnergyCost}). Nghỉ chút hoặc \`/eat\` nhé~ 🌸`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    db.questIncr(userId, 'gather', 1); // nhiệm vụ: đếm mỗi lần đào mỏ/chặt gỗ (kể cả lần trắng tay)

    const c = pick(table);
    let payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;
    if (gauBuff && payout > 0) {
        payout = Math.round(payout * 1.1);
    }
    
    const fatigue = conditionMultiplier(e, user.health);
    const gross = payout;
    if (payout > 0) payout = Math.round(payout * fatigue);
    // Hệ Bệnh: làm quá sức có thể đổ bệnh; đang bệnh thì giảm thu nhập + mất máu.
    const dz = await applyDisease(db, userId, user);
    if (dz.incomeMult !== 1 && payout > 0) payout = Math.round(payout * dz.incomeMult);
    const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
    if (premium && payout > 0) payout = Math.round(payout * (1 + config.PREMIUM.INCOME_BONUS));
    const eventMult = getEventMult();
    if (eventMult !== 1 && payout > 0) payout = Math.round(payout * eventMult);

    let desc;
    if (payout > 0) {
        await db.addMoney(userId, payout, 'wallet');
        db.questIncr(userId, 'earn', payout);
        desc = `Cậu thu được ${c.emoji} **${c.name}** và bán được **+${fmt(payout)}** ${config.CURRENCY}!`
            + (fatigue < 1 && gross > 0 ? ` *(gốc ${fmt(gross)}, mệt -${Math.round((1 - fatigue) * 100)}%)*` : '')
            + (premium ? ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*` : '')
            + (eventMult > 1 ? ` *(Sự kiện x${eventMult} 🎉)*` : '');
    } else {
        desc = `Cậu chỉ nhặt được ${c.emoji} **${c.name}**... chẳng đáng bao nhiêu 😅`;
    }
    
    if (thoBuff) desc += `\n🐰 Bé thỏ **${thoName}** nhanh nhẹn giúp cậu tiết kiệm 15% năng lượng!`;
    if (gauBuff && payout > 0) desc += `\n🐻 Bé gấu **${gauName}** sức mạnh giúp cậu khai thác hăng hái hơn (+10% sản lượng)!`;
    if (dz.note) desc += `\n${dz.note}`;

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
    let gainedExp = 4 + Math.floor(Math.random() * 3); // 4..6 EXP
    if (rongBuff) {
        gainedExp = Math.round(gainedExp * 1.15);
    }
    if (eventMult !== 1) gainedExp = Math.round(gainedExp * eventMult);
    const oldLevel = getLevelFromExp(Number(u?.exp || 0));
    const newExp = await db.updateExp(userId, gainedExp);
    const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);
    
    if (rongBuff) desc += `\n🐲 Bé rồng **${rongName}** truyền long lực giúp cậu nhận thêm 15% EXP!`;
    if (newLevel > oldLevel) {
        const bonus = levelUpReward(oldLevel, newLevel);
        if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
        desc += `\n🎉 Lên **Level ${newLevel}**! Thưởng **+${fmt(bonus)}** ${config.CURRENCY} 🎁`;
    }

    const embedType = payout > 0 ? 'success' : 'warning';
    const embed = buildWaguriEmbed(interaction, embedType, {
        title: title,
        description: desc,
        fields: [
            { name: '💵 Số dư ví', value: `${payout > 0 ? '+' + fmt(payout) + ' → ' : ''}**${fmt(u?.wallet || 0)}** ${config.CURRENCY}`, inline: false },
            { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
            { name: 'Năng lượng', value: `${e}/${config.ENERGY.MAX} ⚡`, inline: true },
            { name: '❤️ Sức khỏe', value: `${u && u.health !== undefined ? u.health : 100}/100`, inline: true },
        ]
    }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

module.exports = { runGather };
