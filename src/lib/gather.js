const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const config = require('../config');
const { onCooldown } = require('./cooldown');
const { conditionMultiplier } = require('./fatigue');
const { applyDisease } = require('./disease');
const { getLevelFromExp, levelUpReward } = require('./leveling');
const { getEventMult } = require('./event');
const { buildWaguriEmbed } = require('./embed');

const { t } = require('./i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

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
    const locale = interaction.locale;

    const toolMap = {
        mine: { id: 'cuoc_sat', name: 'Cuốc sắt', nameEn: 'Iron Pickaxe', emoji: '⛏️' },
        chop: { id: 'riu_sat', name: 'Rìu sắt', nameEn: 'Iron Axe', emoji: '🪓' }
    };
    const tool = toolMap[key] || { id: 'riu_sat', name: 'Rìu sắt', nameEn: 'Iron Axe', emoji: '🪓' };
    const toolNameTrans = locale.startsWith('en') ? tool.nameEn : tool.name;

    const user = await db.getUser(userId);
    const userHealth = user && user.health !== undefined ? user.health : 100;
    if (userHealth < 30) {
        const typeStr = key === 'mine'
            ? (locale.startsWith('en') ? 'mine' : 'đào mỏ')
            : (locale.startsWith('en') ? 'chop wood' : 'chặt gỗ');
        const embed = buildWaguriEmbed(interaction, 'error', {
            title: locale.startsWith('en') ? '⛏️・Gathering' : '⛏️・Khai thác',
            description: t(locale, 'common.low_health', { current: userHealth })
        });
        return interaction.editReply({ embeds: [embed] });
    }

    // Kiểm tra và sử dụng công cụ
    const toolResult = await db.useTool(userId, tool.id);
    if (!toolResult || toolResult.status === 'no_tool') {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            title: locale.startsWith('en') ? '⛏️・Gathering' : '⛏️・Khai thác',
            description: locale.startsWith('en')
                ? `You need to buy a **${toolNameTrans}** ${tool.emoji} at \`/shop\` first! 🌸`
                : `Cậu cần mua **${toolNameTrans}** ${tool.emoji} ở \`/shop\` mới thực hiện được nhé~ 🌸`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const cd = onCooldown(key, userId, config.ACTION_COOLDOWN_MS);
    if (cd) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            title: locale.startsWith('en') ? '⛏️・Gathering' : '⛏️・Khai thác',
            description: t(locale, 'common.cooldown', { time: cd })
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
            thoName = userPet.name || (locale.startsWith('en') ? 'Bunny' : 'Thỏ con');
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
            gauName = userPet.name || (locale.startsWith('en') ? 'Bear Cub' : 'Gấu con');
        }
    }

    // 3) Rồng con: tăng EXP
    let rongBuff = false;
    let rongName = '';
    if (userPet && userPet.species === 'rong') {
        const rongLvl = petLevel(userPet.exp);
        if (rongLvl >= 5) {
            rongBuff = true;
            rongName = userPet.name || (locale.startsWith('en') ? 'Baby Dragon' : 'Rồng con');
        }
    }

    const e = await db.spendEnergy(userId, actualEnergyCost);
    if (e < 0) {
        const cur = await db.getEnergy(userId);
        const embed = buildWaguriEmbed(interaction, 'warning', {
            title: locale.startsWith('en') ? '⛏️・Gathering' : '⛏️・Khai thác',
            description: t(locale, 'common.no_energy', { current: cur, max: config.ENERGY.MAX, cost: actualEnergyCost })
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

    const resourceNames = {
        'Đất đá': { en: 'Dirt & Rocks', vi: 'Đất đá' },
        'Lá cây khô': { en: 'Dry Leaves', vi: 'Lá cây khô' },
        'Quặng đồng': { en: 'Copper Ore', vi: 'Quặng đồng' },
        'Gỗ vụn': { en: 'Wood Chips', vi: 'Gỗ vụn' },
        'Gỗ thông': { en: 'Pine Wood', vi: 'Gỗ thông' },
        'Quặng sắt': { en: 'Iron Ore', vi: 'Quặng sắt' },
        'Quặng vàng': { en: 'Gold Ore', vi: 'Quặng vàng' },
        'Gỗ sồi': { en: 'Oak Wood', vi: 'Gỗ sồi' },
        'Gỗ bạch đàn': { en: 'Eucalyptus Wood', vi: 'Gỗ bạch đàn' },
        'Khối đá quý': { en: 'Gemstone Block', vi: 'Khối đá quý' },
        'Cây cổ thụ': { en: 'Ancient Wood', vi: 'Cây cổ thụ' }
    };
    const displayResourceName = (resourceNames[c.name]?.[locale.startsWith('en') ? 'en' : 'vi']) || c.name;

    let desc;
    if (payout > 0) {
        await db.addMoney(userId, payout, 'wallet');
        db.questIncr(userId, 'earn', payout);
        
        const grossStr = fatigue < 1 && gross > 0
            ? (locale.startsWith('en') ? ` *(base ${fmt(gross, locale)}, tired -${Math.round((1 - fatigue) * 100)}%)` : ` *(gốc ${fmt(gross, locale)}, mệt -${Math.round((1 - fatigue) * 100)}%)*`)
            : '';
        const premStr = premium ? ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*` : '';
        const evStr = eventMult > 1 ? ` *(Sự kiện x${eventMult} 🎉)*` : '';

        desc = locale.startsWith('en')
            ? `You gathered ${c.emoji} **${displayResourceName}** and sold it for **+${fmt(payout, locale)}** ${config.CURRENCY}!${grossStr}${premStr}${evStr}`
            : `Cậu thu được ${c.emoji} **${displayResourceName}** và bán được **+${fmt(payout, locale)}** ${config.CURRENCY}!${grossStr}${premStr}${evStr}`;
    } else {
        desc = locale.startsWith('en')
            ? `You only found ${c.emoji} **${displayResourceName}**... which is worth nothing 😅`
            : `Cậu chỉ nhặt được ${c.emoji} **${displayResourceName}**... chẳng đáng bao nhiêu 😅`;
    }
    
    if (thoBuff) {
        desc += locale.startsWith('en')
            ? `\n🐰 Bunny **${thoName}** helped you save 15% energy!`
            : `\n🐰 Bé thỏ **${thoName}** nhanh nhẹn giúp cậu tiết kiệm 15% năng lượng!`;
    }
    if (gauBuff && payout > 0) {
        desc += locale.startsWith('en')
            ? `\n🐻 Bear Cub **${gauName}** helped you harvest more efficiently (+10% yield)!`
            : `\n🐻 Bé gấu **${gauName}** sức mạnh giúp cậu khai thác hăng hái hơn (+10% sản lượng)!`;
    }
    if (dz.note) desc += `\n${dz.note}`;

    // Rơi nguyên liệu chế tạo (dùng cho /craft)
    const DROPS = { mine: ['quang_sat', 'da'], chop: ['go'] };
    if (DROPS[key]) {
        const rand = Math.random();
        if (rand < 0.45) {
            const matId = DROPS[key][Math.floor(Math.random() * DROPS[key].length)];
            await db.giveItemAdmin(userId, matId, 1);
            await db.discoverItem(userId, matId);
            const it = await db.getItem(matId);
            const itNameTrans = t(locale, `items.${matId}.name`) || it?.name || matId;
            desc += locale.startsWith('en')
                ? `\n🎒 Picked up: **1× ${itNameTrans}** *(for \`/craft\`)*`
                : `\n🎒 Nhặt thêm: **1× ${itNameTrans}** *(để \`/craft\`)*`;
        }
        
        // Vật phẩm cực hiếm (Độ hiếm nâng cao)
        const dropRates = config.COLLECTIONS?.DROP_RATES || { MINE_VANG_DONG_TRIEU: 0.01, CHOP_KY_NAM: 0.005 };
        if (key === 'mine' && Math.random() < dropRates.MINE_VANG_DONG_TRIEU) {
            await db.giveItemAdmin(userId, 'vang_dong_tren', 1);
            await db.discoverItem(userId, 'vang_dong_tren');
            const iName = t(locale, 'items.vang_dong_tren.name') || 'Vàng Đông Triều';
            desc += locale.startsWith('en')
                ? `\n✨ The rubble collapsed to reveal: **1× ${iName}** 🟡 *(Rare Ore!)*`
                : `\n✨ Đất đá sụt lở để lộ ra: **1× Vàng Đông Triều** 🟡 *(Quặng hiếm!)*`;
        } else if (key === 'chop' && Math.random() < dropRates.CHOP_KY_NAM) {
            await db.giveItemAdmin(userId, 'ky_nam', 1);
            await db.discoverItem(userId, 'ky_nam');
            const iName = t(locale, 'items.ky_nam.name') || 'Kỳ Nam';
            desc += locale.startsWith('en')
                ? `\n🌲 Tree sap condensed into: **1× ${iName}** 🌟 *(Epic Wood!)*`
                : `\n🌲 Nhựa cây tụ lại thành khối: **1× Kỳ Nam** 🌟 *(Gỗ Sử Thi cực hiếm!)*`;
        }
    }

    const brokenStr = toolResult.broken ? (locale.startsWith('en') ? ' *(broken! Need repair or buy new)*' : ' *(đã hỏng! Cần mua mới hoặc sửa)*') : '';
    desc += locale.startsWith('en')
        ? `\n${toolNameTrans} durability: **${toolResult.durability}/100** ${tool.emoji}${brokenStr}`
        : `\nĐộ bền ${toolNameTrans}: **${toolResult.durability}/100** ${tool.emoji}${brokenStr}`;

    const u = await db.getUser(userId);
    let gainedExp = 4 + Math.floor(Math.random() * 3); // 4..6 EXP
    if (rongBuff) {
        gainedExp = Math.round(gainedExp * 1.15);
    }
    if (eventMult !== 1) gainedExp = Math.round(gainedExp * eventMult);
    const oldLevel = getLevelFromExp(Number(u?.exp || 0));
    const newExp = await db.updateExp(userId, gainedExp);
    const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);
    
    if (rongBuff) {
        desc += locale.startsWith('en')
            ? `\n🐲 Baby Dragon **${rongName}** lent dragon power, giving +15% EXP!`
            : `\n🐲 Bé rồng **${rongName}** truyền long lực giúp cậu nhận thêm 15% EXP!`;
    }
    if (newLevel > oldLevel) {
        const bonus = levelUpReward(oldLevel, newLevel);
        if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
        desc += locale.startsWith('en')
            ? `\n🎉 Reached **Level ${newLevel}**! Bonus: **+${fmt(bonus, locale)}** ${config.CURRENCY} 🎁`
            : `\n🎉 Lên **Level ${newLevel}**! Thưởng **+${fmt(bonus, locale)}** ${config.CURRENCY} 🎁`;
    }

    // Cộng XP Sổ Sứ Mệnh (20% cơ hội rơi 20-30 XP)
    if (Math.random() < 0.20) {
        const bpXp = Math.floor(Math.random() * 11) + 20; // 20-30 XP
        const bpRes = await require('./battlepass').addXp(userId, bpXp);
        if (bpRes && bpRes.levelUp) {
            desc += t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel });
        }
    }

    const fieldWalletName = locale.startsWith('en') ? '💵 Wallet Balance' : '💵 Số dư ví';
    const fieldXpName = locale.startsWith('en') ? 'Experience' : 'Kinh nghiệm';
    const fieldEnergyName = locale.startsWith('en') ? 'Energy' : 'Năng lượng';
    const fieldHealthName = locale.startsWith('en') ? '❤️ Health' : '❤️ Sức khỏe';

    const displayTitle = locale.startsWith('en')
        ? (key === 'mine' ? '⛏️・Mining' : '🪓・Chop Wood')
        : title;

    const embedType = payout > 0 ? 'success' : 'warning';
    const embed = buildWaguriEmbed(interaction, embedType, {
        title: displayTitle,
        description: desc,
        fields: [
            { name: fieldWalletName, value: `${payout > 0 ? '+' + fmt(payout, locale) + ' → ' : ''}**${fmt(u?.wallet || 0, locale)}** ${config.CURRENCY}`, inline: false },
            { name: fieldXpName, value: `+${gainedExp} EXP`, inline: true },
            { name: fieldEnergyName, value: `${e}/${config.ENERGY.MAX} ⚡`, inline: true },
            { name: fieldHealthName, value: `${u && u.health !== undefined ? u.health : 100}/100`, inline: true },
        ]
    }).setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

module.exports = { runGather };
