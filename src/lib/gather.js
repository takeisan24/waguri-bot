const db = require('../database.js');
const config = require('../config');
const { onCooldown } = require('./cooldown');
const { conditionMultiplier } = require('./fatigue');
const { applyDisease } = require('./disease');
const { getLevelFromExp, levelUpReward } = require('./leveling');
const { getEventMult } = require('./event');
const { buildWaguriEmbed } = require('./embed');
const { getInteractionLanguage, t } = require('./i18n');
const { petLevel } = require('../data/pets');

const fmt = (n, locale) => Number(n).toLocaleString(locale?.startsWith('en') ? 'en-US' : 'vi-VN');

function pick(table) {
    const total = table.reduce((s, x) => s + x.weight, 0);
    let r = Math.random() * total;
    for (const x of table) { if (r < x.weight) return x; r -= x.weight; }
    return table[0];
}

/**
 * Khung chung cho các hoạt động "tốn năng lượng → random theo bảng → tiền + EXP + drop"
 * (đào mỏ / chặt gỗ / câu cá). Phần LOGIC (năng lượng, mệt mỏi, bệnh, premium, sự kiện,
 * EXP/level, Sổ Sứ Mệnh, embed) dùng chung. Phần ĐẶC THÙ theo hoạt động (công cụ, buff Gấu,
 * bảng drop, và vài biến thể chữ) truyền qua `opts` — copy nguyên văn từ lệnh gốc để giữ
 * hành vi & tỉ lệ y hệt. (Nối key i18n để bước sau.)
 *
 * @param {object} opts
 *  key            'mine'|'chop'|'fish' — dùng cho cooldown/quest.
 *  tool           {id, name, nameEn, emoji}
 *  energyCost     số năng lượng tiêu hao (mặc định config.GATHER_ENERGY_COST).
 *  table          bảng random {name, emoji, weight, min, max}.
 *  title(en)                     -> tiêu đề embed.
 *  name(c, en)                   -> tên hiển thị của mẻ thu được.
 *  toolMissing(toolNameTrans, tool, en) -> mô tả khi thiếu công cụ.
 *  onPick(c, userPet, en)        -> c (có thể nâng cấp mẻ TRƯỚC payout; mặc định giữ nguyên).
 *  onPayout(payout, userPet, en) -> {payout, note} (buff payout SAU khi tính base; mặc định giữ nguyên).
 *  sold(c, name, payoutStr, extras, en) -> dòng mô tả khi có tiền (extras={grossStr,premStr,evStr}).
 *  empty(c, name, en)            -> dòng mô tả khi trắng tay.
 *  thoNote(thoName, en)          -> ghi chú buff Thỏ (giảm năng lượng).
 *  onDrops(ctx) async            -> chuỗi drop nối vào mô tả (ctx: {userId,c,userPet,locale,payout}).
 *  toolLine(toolNameTrans, tool, toolResult, en) -> dòng độ bền công cụ.
 */
async function runGather(interaction, opts) {
    const {
        key, tool, table, energyCost = config.GATHER_ENERGY_COST,
        title, errorTitle, name, toolMissing, onPick, onPayout, sold, empty, thoNote, onDrops, toolLine,
    } = opts;

    // Interaction có thể hết hạn (10062) nếu mạng host chậm -> defer fail thì bỏ qua, tránh lỗi dây chuyền.
    try { await interaction.deferReply(); } catch { return; }
    const userId = interaction.user.id;
    const locale = await getInteractionLanguage(interaction);
    const en = !!locale?.startsWith('en');
    const toolNameTrans = en ? tool.nameEn : tool.name;
    const headerTitle = title(en);                       // tiêu đề embed KẾT QUẢ
    const errTitle = (errorTitle || title)(en);          // tiêu đề các embed LỖI (mặc định = title)

    const user = await db.getUser(userId);
    const userHealth = user && user.health !== undefined ? user.health : 100;
    if (userHealth < 30) {
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
            title: errTitle, description: t(locale, 'common.low_health', { current: userHealth }) })] });
    }

    // Kiểm tra và sử dụng công cụ
    const toolResult = await db.useTool(userId, tool.id);
    if (!toolResult || toolResult.status === 'no_tool') {
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
            title: errTitle, description: toolMissing(toolNameTrans, tool, en) })] });
    }

    const cd = onCooldown(key, userId, config.ACTION_COOLDOWN_MS);
    if (cd) {
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
            title: errTitle, description: t(locale, 'common.cooldown', { time: cd }) })] });
    }

    // Kiểm tra Pet để kích hoạt buff
    const userPet = await db.getPet(userId);

    // 1) Thỏ con: giảm năng lượng tiêu hao
    let actualEnergyCost = energyCost;
    let thoBuff = false;
    let thoName = '';
    if (userPet && userPet.species === 'tho') {
        const thoLvl = petLevel(userPet.exp);
        if (thoLvl >= 5) {
            thoBuff = true;
            thoName = userPet.name || (en ? 'Bunny' : 'Thỏ con');
            actualEnergyCost = Math.round(energyCost * 0.85);
        }
    }

    // 2) Rồng con: tăng EXP
    let rongBuff = false;
    let rongName = '';
    if (userPet && userPet.species === 'rong') {
        const rongLvl = petLevel(userPet.exp);
        if (rongLvl >= 5) {
            rongBuff = true;
            rongName = userPet.name || (en ? 'Baby Dragon' : 'Rồng con');
        }
    }

    const e = await db.spendEnergy(userId, actualEnergyCost);
    if (e < 0) {
        const cur = await db.getEnergy(userId);
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
            title: errTitle, description: t(locale, 'common.no_energy', { current: cur, max: config.ENERGY.MAX, cost: actualEnergyCost }) })] });
    }

    db.questIncr(userId, key === 'fish' ? 'fish' : 'gather', 1);

    // Mẻ thu được (onPick: buff Gấu của câu cá nâng cấp mẻ TRƯỚC khi tính tiền)
    let c = pick(table);
    if (onPick) c = onPick(c, userPet, en);

    let payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;
    // onPayout: buff Gấu của đào/chặt tăng payout SAU khi tính base
    let bearNote = '';
    if (onPayout && payout > 0) {
        const r = onPayout(payout, userPet, en);
        payout = r.payout;
        bearNote = r.note || '';
    }

    const fatigue = conditionMultiplier(e, user.health);
    const gross = payout;
    if (payout > 0) payout = Math.round(payout * fatigue);
    const dz = await applyDisease(db, userId, user, locale);
    if (dz.incomeMult !== 1 && payout > 0) payout = Math.round(payout * dz.incomeMult);
    const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
    if (premium && payout > 0) payout = Math.round(payout * (1 + config.PREMIUM.INCOME_BONUS));
    const eventMult = getEventMult();
    if (eventMult !== 1 && payout > 0) payout = Math.round(payout * eventMult);

    const displayName = name(c, en);

    let desc;
    if (payout > 0) {
        await db.addMoney(userId, payout, 'wallet');
        db.questIncr(userId, 'earn', payout);

        const grossStr = fatigue < 1 && gross > 0
            ? (en ? ` *(base ${fmt(gross, locale)}, tired -${Math.round((1 - fatigue) * 100)}%)` : ` *(gốc ${fmt(gross, locale)}, mệt -${Math.round((1 - fatigue) * 100)}%)*`)
            : '';
        const premStr = premium ? ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*` : '';
        const evStr = eventMult > 1 ? (en ? ` *(Event x${eventMult} 🎉)*` : ` *(Sự kiện x${eventMult} 🎉)*`) : '';

        desc = sold(c, displayName, fmt(payout, locale), { grossStr, premStr, evStr }, en);
    } else {
        desc = empty(c, displayName, en);
    }

    if (thoBuff) desc += thoNote(thoName, en);
    if (bearNote) desc += bearNote;
    if (dz.note) desc += `\n${dz.note}`;

    // Drop đặc thù theo hoạt động (copy nguyên văn từ lệnh gốc)
    desc += await onDrops({ userId, c, userPet, locale, payout });

    // Dòng độ bền công cụ
    desc += toolLine(toolNameTrans, tool, toolResult, en);

    const u = await db.getUser(userId);
    let gainedExp = 4 + Math.floor(Math.random() * 3); // 4..6 EXP
    if (rongBuff) gainedExp = Math.round(gainedExp * 1.15);
    if (eventMult !== 1) gainedExp = Math.round(gainedExp * eventMult);
    const oldLevel = getLevelFromExp(Number(u?.exp || 0));
    const newExp = await db.updateExp(userId, gainedExp);
    const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);

    if (rongBuff) {
        desc += en
            ? `\n🐲 Baby Dragon **${rongName}** lent dragon power, giving +15% EXP!`
            : `\n🐲 Bé rồng **${rongName}** truyền long lực giúp cậu nhận thêm 15% EXP!`;
    }
    if (newLevel > oldLevel) {
        const bonus = levelUpReward(oldLevel, newLevel);
        if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
        desc += en
            ? `\n🎉 Reached **Level ${newLevel}**! Bonus: **+${fmt(bonus, locale)}** ${config.CURRENCY} 🎁`
            : `\n🎉 Lên **Level ${newLevel}**! Thưởng **+${fmt(bonus, locale)}** ${config.CURRENCY} 🎁`;

        // Gợi ý tham gia server support nếu vượt mốc cấp độ và ở server cộng đồng ngoài
        const { getMilestoneInviteMessage } = require('./supportReward');
        const inviteMsg = getMilestoneInviteMessage(oldLevel, newLevel, locale);
        if (inviteMsg && interaction.guildId !== config.ROLE_REWARDS.SUPPORT_GUILD_ID) {
            desc += `\n\n${inviteMsg}`;
        }
    }

    // Cộng XP Sổ Sứ Mệnh (20% cơ hội rơi 20-30 XP)
    if (Math.random() < 0.20) {
        const bpXp = Math.floor(Math.random() * 11) + 20; // 20-30 XP
        const bpRes = await require('./battlepass').addXp(userId, bpXp);
        if (bpRes && bpRes.levelUp) {
            desc += t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel });
        }
    }

    const fieldWalletName = en ? '💵 Wallet Balance' : '💵 Số dư ví';
    const fieldXpName = en ? 'Experience' : 'Kinh nghiệm';
    const fieldEnergyName = en ? 'Energy' : 'Năng lượng';
    const fieldHealthName = en ? '❤️ Health' : '❤️ Sức khỏe';

    const embedType = payout > 0 ? 'success' : 'warning';
    const embed = buildWaguriEmbed(interaction, embedType, {
        title: headerTitle,
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

// ---- Bản đồ tên tài nguyên (đào/chặt) — copy nguyên văn ----
const RESOURCE_NAMES = {
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
    'Cây cổ thụ': { en: 'Ancient Wood', vi: 'Cây cổ thụ' },
    'Củi khô': { en: 'Dry Firewood', vi: 'Củi khô' },
    'Gỗ thường': { en: 'Regular Wood', vi: 'Gỗ thường' },
    'Gỗ lim': { en: 'Ironwood', vi: 'Gỗ lim' },
    'Gỗ hương': { en: 'Sandalwood', vi: 'Gỗ hương' },
    'Trầm hương': { en: 'Agarwood', vi: 'Trầm hương' },
    'Gỗ sưa đỏ': { en: 'Red Sandalwood', vi: 'Gỗ sưa đỏ' },
    'Đá thường': { en: 'Common Stone', vi: 'Đá thường' },
    'Than đá': { en: 'Coal', vi: 'Than đá' },
    'Bạc': { en: 'Silver', vi: 'Bạc' },
    'Vàng': { en: 'Gold', vi: 'Vàng' },
    'Kim cương': { en: 'Diamond', vi: 'Kim cương' }
};

const RESOURCE_TOOLS = {
    mine: { id: 'cuoc_sat', name: 'Cuốc sắt', nameEn: 'Iron Pickaxe', emoji: '⛏️' },
    chop: { id: 'riu_sat', name: 'Rìu sắt', nameEn: 'Iron Axe', emoji: '🪓' },
};

/**
 * Wrapper cho /mine và /chop — chia sẻ toàn bộ chữ + logic drop cũ của gather.
 * (Trước đây mine/chop gọi runGather({title,table,key}); nay các phần đặc thù đã chuyển
 * thành opts, gom lại ở đây để mine.js/chop.js vẫn mỏng như cũ.)
 */
function runResourceGather(interaction, { key, title, table }) {
    const tool = RESOURCE_TOOLS[key] || RESOURCE_TOOLS.chop;
    return runGather(interaction, {
        key, tool, table,
        title: (en) => en ? (key === 'mine' ? '⛏️・Mining' : '🪓・Chop Wood') : title,
        errorTitle: (en) => en ? '⛏️・Gathering' : '⛏️・Khai thác',
        name: (c, en) => (RESOURCE_NAMES[c.name]?.[en ? 'en' : 'vi']) || c.name,
        toolMissing: (toolNameTrans, tl, en) => en
            ? `You need to buy a **${toolNameTrans}** ${tl.emoji} at \`/shop\` first! 🌸`
            : `Cậu cần mua **${toolNameTrans}** ${tl.emoji} ở \`/shop\` mới thực hiện được nhé~ 🌸`,
        // Gấu con: +10% payout (sau khi tính base) + ghi chú
        onPayout: (payout, userPet, en) => {
            if (userPet && userPet.species === 'gau' && petLevel(userPet.exp) >= 5) {
                const gauName = userPet.name || (en ? 'Bear Cub' : 'Gấu con');
                return {
                    payout: Math.round(payout * 1.1),
                    note: en
                        ? `\n🐻 Bear Cub **${gauName}** helped you harvest more efficiently (+10% yield)!`
                        : `\n🐻 Bé gấu **${gauName}** sức mạnh giúp cậu khai thác hăng hái hơn (+10% sản lượng)!`,
                };
            }
            return { payout, note: '' };
        },
        sold: (c, nm, payoutStr, ex, en) => en
            ? `You gathered ${c.emoji} **${nm}** and sold it for **+${payoutStr}** ${config.CURRENCY}!${ex.grossStr}${ex.premStr}${ex.evStr}`
            : `Cậu thu được ${c.emoji} **${nm}** và bán được **+${payoutStr}** ${config.CURRENCY}!${ex.grossStr}${ex.premStr}${ex.evStr}`,
        empty: (c, nm, en) => en
            ? `You only found ${c.emoji} **${nm}**... which is worth nothing 😅`
            : `Cậu chỉ nhặt được ${c.emoji} **${nm}**... chẳng đáng bao nhiêu 😅`,
        thoNote: (thoName, en) => en
            ? `\n🐰 Bunny **${thoName}** helped you save 15% energy!`
            : `\n🐰 Bé thỏ **${thoName}** nhanh nhẹn giúp cậu tiết kiệm 15% năng lượng!`,
        toolLine: (toolNameTrans, tl, toolResult, en) => {
            const brokenStr = toolResult.broken ? (en ? ' *(broken! Need repair or buy new)*' : ' *(đã hỏng! Cần mua mới hoặc sửa)*') : '';
            return en
                ? `\n${toolNameTrans} durability: **${toolResult.durability}/100** ${tl.emoji}${brokenStr}`
                : `\nĐộ bền ${toolNameTrans}: **${toolResult.durability}/100** ${tl.emoji}${brokenStr}`;
        },
        onDrops: async ({ userId, c, userPet, locale }) => {
            const en = !!locale?.startsWith('en');
            let out = '';
            const DROPS = { mine: ['quang_sat', 'da'], chop: ['go'] };
            if (DROPS[key]) {
                const rand = Math.random();
                if (rand < 0.45) {
                    const matId = DROPS[key][Math.floor(Math.random() * DROPS[key].length)];
                    const petSkills = userPet?.skills || {};
                    const doubleGemLvl = petSkills.double_gem || 0;
                    let qty = 1;
                    let doubleGemSuccess = false;
                    if (key === 'mine' && doubleGemLvl > 0) {
                        const doubleChance = doubleGemLvl === 1 ? 0.15 : 0.35;
                        if (Math.random() < doubleChance) { qty = 2; doubleGemSuccess = true; }
                    }
                    await db.giveItemAdmin(userId, matId, qty);
                    await db.discoverItem(userId, matId);
                    const it = await db.getItem(matId);
                    const itNameTrans = t(locale, `items.${matId}.name`) || it?.name || matId;
                    if (doubleGemSuccess) {
                        out += en
                            ? `\n🎒 Picked up: **${qty}× ${itNameTrans}** *(for \`/craft\` - ⛏️ Pet Double Ores!)*`
                            : `\n🎒 Nhặt thêm: **${qty}× ${itNameTrans}** *(để \`/craft\` - ⛏️ Pet Nhân đôi Quặng!)*`;
                    } else {
                        out += en
                            ? `\n🎒 Picked up: **${qty}× ${itNameTrans}** *(for \`/craft\`)*`
                            : `\n🎒 Nhặt thêm: **${qty}× ${itNameTrans}** *(để \`/craft\`)*`;
                    }
                }
                // Vật phẩm cực hiếm
                const petSkills = userPet?.skills || {};
                const doubleGemLvl = petSkills.double_gem || 0;
                const dropRates = config.COLLECTIONS?.DROP_RATES || { MINE_VANG_DONG_TRIEU: 0.01, CHOP_KY_NAM: 0.005 };
                let rareChanceMult = 1;
                if (key === 'mine' && doubleGemLvl > 0) rareChanceMult += doubleGemLvl * 0.10;
                if (key === 'mine' && Math.random() < (dropRates.MINE_VANG_DONG_TRIEU * rareChanceMult)) {
                    await db.giveItemAdmin(userId, 'vang_dong_tren', 1);
                    await db.discoverItem(userId, 'vang_dong_tren');
                    const iName = t(locale, 'items.vang_dong_tren.name') || 'Vàng Đông Triều';
                    out += en
                        ? `\n✨ The rubble collapsed to reveal: **1× ${iName}** 🟡 *(Rare Ore!)*`
                        : `\n✨ Đất đá sụt lở để lộ ra: **1× Vàng Đông Triều** 🟡 *(Quặng hiếm!)*`;
                } else if (key === 'chop' && Math.random() < dropRates.CHOP_KY_NAM) {
                    await db.giveItemAdmin(userId, 'ky_nam', 1);
                    await db.discoverItem(userId, 'ky_nam');
                    const iName = t(locale, 'items.ky_nam.name') || 'Kỳ Nam';
                    out += en
                        ? `\n🌲 Tree sap condensed into: **1× ${iName}** 🌟 *(Epic Wood!)*`
                        : `\n🌲 Nhựa cây tụ lại thành khối: **1× Kỳ Nam** 🌟 *(Gỗ Sử Thi cực hiếm!)*`;
                }
            }
            return out;
        },
    });
}

module.exports = { runGather, runResourceGather, fmt };
