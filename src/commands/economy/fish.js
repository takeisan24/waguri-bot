const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const FISH = require('../../data/fish');
const { onCooldown } = require('../../lib/cooldown');
const { conditionMultiplier } = require('../../lib/fatigue');
const { applyDisease } = require('../../lib/disease');
const { getLevelFromExp, levelUpReward } = require('../../lib/leveling');
const { getEventMult } = require('../../lib/event');

const { t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

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
        const locale = interaction.locale;

        const user = await db.getUser(userId);
        const userHealth = user && user.health !== undefined ? user.health : 100;
        if (userHealth < 30) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                title: locale.startsWith('en') ? '🎣・Go Fishing' : '🎣・Đi câu cá',
                description: t(locale, 'common.low_health', { current: userHealth })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Kiểm tra và sử dụng công cụ
        const toolResult = await db.useTool(userId, 'can_cau');
        if (!toolResult || toolResult.status === 'no_tool') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                title: locale.startsWith('en') ? '🎣・Go Fishing' : '🎣・Đi câu cá',
                description: locale.startsWith('en')
                    ? 'You need to buy a **Fishing Rod** 🎣 at `/shop` first! 🌸'
                    : 'Cậu cần mua **Cần câu cá** 🎣 ở `/shop` mới đi câu được nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const cd = onCooldown('fish', userId, config.ACTION_COOLDOWN_MS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: locale.startsWith('en') ? '🎣・Go Fishing' : '🎣・Đi câu cá',
                description: t(locale, 'common.cooldown', { time: cd })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Kiểm tra Pet để kích hoạt buff
        const userPet = await db.getPet(userId);
        const { petLevel } = require('../../data/pets');

        // 1) Thỏ con: giảm năng lượng tiêu hao
        let actualEnergyCost = config.FISH.ENERGY_COST;
        let thoBuff = false;
        let thoName = '';
        if (userPet && userPet.species === 'tho') {
            const thoLvl = petLevel(userPet.exp);
            if (thoLvl >= 5) {
                thoBuff = true;
                thoName = userPet.name || 'Thỏ con';
                actualEnergyCost = Math.round(config.FISH.ENERGY_COST * 0.85);
            }
        }

        // 2) Rồng con: tăng EXP
        let rongBuff = false;
        let rongName = '';
        if (userPet && userPet.species === 'rong') {
            const rongLvl = petLevel(userPet.exp);
            if (rongLvl >= 5) {
                rongBuff = true;
                rongName = userPet.name || 'Rồng con';
            }
        }

        const energyLeft = await db.spendEnergy(userId, actualEnergyCost);
        if (energyLeft < 0) {
            const cur = await db.getEnergy(userId);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: locale.startsWith('en') ? '🎣・Go Fishing' : '🎣・Đi câu cá',
                description: t(locale, 'common.no_energy', { current: cur, max: config.ENERGY.MAX, cost: actualEnergyCost })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        db.questIncr(userId, 'fish', 1); // nhiệm vụ: đếm mỗi lần đi câu (kể cả lần trắng tay)

        const c = pickCatch();
        let payout = c.max > 0 ? Math.floor(Math.random() * (c.max - c.min + 1)) + c.min : 0;
        const fatigue = conditionMultiplier(energyLeft, user.health);
        const gross = payout;
        if (payout > 0) payout = Math.round(payout * fatigue);
        const dz = await applyDisease(db, userId, user);
        if (dz.incomeMult !== 1 && payout > 0) payout = Math.round(payout * dz.incomeMult);
        const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
        if (premium && payout > 0) payout = Math.round(payout * (1 + config.PREMIUM.INCOME_BONUS));
        const eventMult = getEventMult();
        if (eventMult !== 1 && payout > 0) payout = Math.round(payout * eventMult);

        const fishNames = {
            'Rác / lốp xe cũ': { en: 'Trash / Old Tire', vi: 'Rác / lốp xe cũ' },
            'Cá lòng tong': { en: 'Small Fish', vi: 'Cá lòng tong' },
            'Cá rô phi': { en: 'Tilapia', vi: 'Cá rô phi' },
            'Cá lóc bự': { en: 'Big Snakehead Fish', vi: 'Cá lóc bự' },
            'Cá hiếm': { en: 'Rare Fish', vi: 'Cá hiếm' },
            'Rương kho báu': { en: 'Treasure Chest', vi: 'Rương kho báu' }
        };
        const displayFishName = (fishNames[c.name]?.[locale.startsWith('en') ? 'en' : 'vi']) || c.name;

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
                ? `You caught ${c.emoji} **${displayFishName}** and sold it for **+${fmt(payout, locale)}** ${config.CURRENCY}!${grossStr}${premStr}${evStr}`
                : `Cậu câu được ${c.emoji} **${displayFishName}** và bán được **+${fmt(payout, locale)}** ${config.CURRENCY}!${grossStr}${premStr}${evStr}`;
        } else {
            desc = locale.startsWith('en')
                ? `You only caught ${c.emoji} **${displayFishName}**... and got nothing 😅 Better luck next time~`
                : `Cậu chỉ câu phải ${c.emoji} **${displayFishName}**... chẳng được gì cả 😅 Lần sau may hơn nhé~`;
        }
        
        if (thoBuff) {
            desc += locale.startsWith('en')
                ? `\n🐰 Kitten/Rabbit **${thoName}** helped you save 15% energy!`
                : `\n🐰 Bé thỏ **${thoName}** nhanh nhẹn giúp cậu tiết kiệm 15% năng lượng!`;
        }
        if (dz.note) desc += `\n${dz.note}`;

        // Rơi cá nguyên liệu Tiệm Bánh Gekka (Phase 2 & 3)
        if (c.max > 0) {
            const rand = Math.random();
            if (c.name === 'Cá lòng tong' && rand < 0.35) {
                await db.giveItemAdmin(userId, 'ca_tuoi', 1);
                await db.discoverItem(userId, 'ca_tuoi');
                const iName = t(locale, 'items.ca_tuoi.name') || 'Cá Tươi';
                desc += locale.startsWith('en')
                    ? `\n🐟 Your bucket has **1× ${iName}** *(ingredient for \`/tiembanh\`)*`
                    : `\n🐟 Giỏ cá có thêm **1× Cá Tươi** *(nguyên liệu \`/tiembanh\`)*`;
            } else if (c.name === 'Cá rô phi' && rand < 0.45) {
                await db.giveItemAdmin(userId, 'ca_tuoi', 1);
                await db.discoverItem(userId, 'ca_tuoi');
                const iName = t(locale, 'items.ca_tuoi.name') || 'Cá Tươi';
                desc += locale.startsWith('en')
                    ? `\n🐟 Your bucket has **1× ${iName}** *(ingredient for \`/tiembanh\`)*`
                    : `\n🐟 Giỏ cá có thêm **1× Cá Tươi** *(nguyên liệu \`/tiembanh\`)*`;
            } else if (c.name === 'Cá lóc bự') {
                if (rand < 0.30) {
                    await db.giveItemAdmin(userId, 'ca_ngon', 1);
                    await db.discoverItem(userId, 'ca_ngon');
                    const iName = t(locale, 'items.ca_ngon.name') || 'Cá Ngon';
                    desc += locale.startsWith('en')
                        ? `\n✨ Your bucket has **1× ${iName}** *(special bakery ingredient!)*`
                        : `\n✨ Giỏ cá có thêm **1× Cá Ngon** *(nguyên liệu làm bánh đặc biệt!)*`;
                } else if (rand < 0.70) {
                    await db.giveItemAdmin(userId, 'ca_tuoi', 1);
                    await db.discoverItem(userId, 'ca_tuoi');
                    const iName = t(locale, 'items.ca_tuoi.name') || 'Cá Tươi';
                    desc += locale.startsWith('en')
                        ? `\n🐟 Your bucket has **1× ${iName}** *(ingredient for \`/tiembanh\`)*`
                        : `\n🐟 Giỏ cá có thêm **1× Cá Tươi** *(nguyên liệu \`/tiembanh\`)*`;
                }
            } else if (c.name === 'Cá hiếm') {
                const dropRates = config.COLLECTIONS?.DROP_RATES || { FISH_CA_RONG_VANG: 0.10 };
                if (rand < dropRates.FISH_CA_RONG_VANG) {
                    await db.giveItemAdmin(userId, 'ca_rong_vang', 1);
                    await db.discoverItem(userId, 'ca_rong_vang');
                    const iName = t(locale, 'items.ca_rong_vang.name') || 'Cá Rồng Kim Long';
                    desc += locale.startsWith('en')
                        ? `\n🏮 Your bucket has **1× ${iName}** 👑 *(super rare Epic item!)*`
                        : `\n🏮 Giỏ cá có thêm **1× Cá Rồng Kim Long** 👑 *(vật phẩm Sử Thi siêu hiếm!)*`;
                } else if (rand < 0.40) {
                    await db.giveItemAdmin(userId, 'ca_hiem', 1);
                    await db.discoverItem(userId, 'ca_hiem');
                    const iName = t(locale, 'items.ca_hiem.name') || 'Cá Hiếm';
                    desc += locale.startsWith('en')
                        ? `\n🌟 Your bucket has **1× ${iName}** *(rare ingredient for bakery!)*`
                        : `\n🌟 Giỏ cá có thêm **1× Cá Hiếm** *(nguyên liệu siêu hiếm cho tiệm!)*`;
                } else {
                    await db.giveItemAdmin(userId, 'ca_ngon', 1);
                    await db.discoverItem(userId, 'ca_ngon');
                    const iName = t(locale, 'items.ca_ngon.name') || 'Cá Ngon';
                    desc += locale.startsWith('en')
                        ? `\n✨ Your bucket has **1× ${iName}** *(special bakery ingredient!)*`
                        : `\n✨ Giỏ cá có thêm **1× Cá Ngon** *(nguyên liệu làm bánh đặc biệt!)*`;
                }
            } else if (c.name === 'Rương kho báu') {
                const dropRates = config.COLLECTIONS?.DROP_RATES || { FISH_CA_KOI_NHAT: 0.10 };
                if (rand < dropRates.FISH_CA_KOI_NHAT) {
                    await db.giveItemAdmin(userId, 'ca_koi_nhat', 1);
                    await db.discoverItem(userId, 'ca_koi_nhat');
                    const iName = t(locale, 'items.ca_koi_nhat.name') || 'Cá Koi Hoàng Gia';
                    desc += locale.startsWith('en')
                        ? `\n👑 Your bucket has **1× ${iName}** ⭐ *(super rare LEGENDARY item!)*`
                        : `\n👑 Giỏ cá có thêm **1× Cá Koi Hoàng Gia** ⭐ *(vật phẩm HUYỀN THOẠI cực hiếm!)*`;
                }
            }
        }

        const brokenStr = toolResult.broken ? (locale.startsWith('en') ? ' *(broken! Need repair or buy new)*' : ' *(đã hỏng! Cần mua mới hoặc sửa)*') : '';
        desc += locale.startsWith('en')
            ? `\nFishing rod durability: **${toolResult.durability}/100** 🎣${brokenStr}`
            : `\nĐộ bền Cần câu: **${toolResult.durability}/100** 🎣${brokenStr}`;

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
            const bpRes = await require('../../lib/battlepass').addXp(userId, bpXp);
            if (bpRes && bpRes.levelUp) {
                desc += t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel });
            }
        }

        const fieldWalletName = locale.startsWith('en') ? '💵 Wallet Balance' : '💵 Số dư ví';
        const fieldXpName = locale.startsWith('en') ? 'Experience' : 'Kinh nghiệm';
        const fieldEnergyName = locale.startsWith('en') ? 'Energy' : 'Năng lượng';
        const fieldHealthName = locale.startsWith('en') ? '❤️ Health' : '❤️ Sức khỏe';

        const embedType = payout > 0 ? 'success' : 'warning';
        const embed = buildWaguriEmbed(interaction, embedType, {
            title: locale.startsWith('en') ? '🎣・Go Fishing' : '🎣・Đi câu cá',
            description: desc,
            fields: [
                { name: fieldWalletName, value: `${payout > 0 ? '+' + fmt(payout, locale) + ' → ' : ''}**${fmt(u?.wallet || 0, locale)}** ${config.CURRENCY}`, inline: false },
                { name: fieldXpName, value: `+${gainedExp} EXP`, inline: true },
                { name: fieldEnergyName, value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: fieldHealthName, value: `${u && u.health !== undefined ? u.health : 100}/100`, inline: true }
            ]
        }).setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
