const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const scripts = require('../../data/workScripts');
const { getLevelFromExp, levelUpReward } = require('../../lib/leveling');
const { onCooldown } = require('../../lib/cooldown');
const { conditionMultiplier } = require('../../lib/fatigue');
const { applyDisease } = require('../../lib/disease');
const { getEventMult } = require('../../lib/event');
const { buildWaguriEmbed } = require('../../lib/embed');
const { handleNewbieQuest } = require('../../lib/newbie');

const { getInteractionLanguage, t } = require('../../lib/i18n');
const scriptsVi = require('../../data/workScripts');
const scriptsEn = require('../../data/workScripts_en');

const fmt = (n, locale) => Number(n).toLocaleString(locale?.startsWith('en') ? 'en-US' : 'vi-VN');

function pickLine(jobKey, category, locale) {
    const scripts = locale?.startsWith('en') ? scriptsEn : scriptsVi;
    const set = (scripts[jobKey] && scripts[jobKey][category]) || scripts.default[category];
    return set[Math.floor(Math.random() * set.length)];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Làm việc để kiếm tiền (tốn năng lượng)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');

        // 0. Cooldown nhẹ chống spam
        const cd = onCooldown('work', userId, config.ACTION_COOLDOWN_MS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'common.cooldown', { time: cd })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        try {
            const user = await db.getUser(userId);
            if (!user) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: t(locale, 'common.db_error')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // 1. Kiểm tra sức khỏe (Health)
            const userHealth = user.health !== undefined ? user.health : 100;
            if (userHealth < 30) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    title: isEn ? '🏥 Weak Health' : '🏥 Sức khỏe quá yếu',
                    description: t(locale, 'common.low_health', { current: userHealth })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // 2. Kiểm tra phương tiện di chuyển trong kho đồ để tính chi phí năng lượng.
            const inv = await db.getInventory(userId);
            const vehKeys = Object.keys(config.VEHICLES);
            const ownedVehicles = inv.filter(i => vehKeys.includes(i.item_id)).map(i => i.item_id);
            let bestVehicleId = null;
            if (ownedVehicles.length > 0) {
                bestVehicleId = ownedVehicles.reduce((best, id) =>
                    config.VEHICLES[id].energy_cost < config.VEHICLES[best].energy_cost ? id : best, ownedVehicles[0]);
            }

            let energyCost = config.ENERGY.COST_PER_WORK; // 10
            if (bestVehicleId) {
                energyCost = config.VEHICLES[bestVehicleId].energy_cost;
            }

            // 3. Tiêu năng lượng (gate chính)
            const energyLeft = await db.spendEnergy(userId, energyCost);
            if (energyLeft < 0) {
                const cur = await db.getEnergy(userId);
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'common.no_energy', { current: cur, max: config.ENERGY.MAX, cost: energyCost })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // 4. Sử dụng xe (trừ độ bền)
            let usedVehicle = null;
            if (bestVehicleId) {
                usedVehicle = await db.useVehicle(userId);
            }

            // 2. Thông số nghề
            let { name: jobName, min_wage: minWage, max_wage: maxWage, risk_rate: riskRate, required_level: jobLevel } = config.WORK.DEFAULT_JOB;
            let jobKey = 'default';
            if (user.job_id) {
                const job = await db.getJob(user.job_id);
                if (job) {
                    jobName = job.name; minWage = job.min_wage; maxWage = job.max_wage;
                    riskRate = job.risk_rate; jobLevel = job.required_level; jobKey = job.id;
                }
            }

            // 3. Buff thu nhập
            const buffActive = user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now();
            const buffMult = buffActive ? Number(user.buff_mult) : 1;

            // Kiểm tra xem user có nuôi Mèo tài lộc không (Level >= 5)
            let catBuff = false;
            let userPetName = '';
            const userPet = await db.getPet(userId);
            if (userPet && userPet.species === 'meo') {
                const { petLevel } = require('../../data/pets');
                const catLvl = petLevel(userPet.exp);
                if (catLvl >= 5) {
                    catBuff = true;
                    userPetName = userPet.name || 'Mèo con';
                }
            }

            // Kiểm tra xem user có nuôi Rồng con không (Level >= 5)
            let rongBuff = false;
            let rongName = '';
            if (userPet && userPet.species === 'rong') {
                const { petLevel } = require('../../data/pets');
                const rongLvl = petLevel(userPet.exp);
                if (rongLvl >= 5) {
                    rongBuff = true;
                    rongName = userPet.name || 'Rồng con';
                }
            }

            // 4. Kết quả: xui theo risk_rate của nghề (5–25%) · còn lại 8% jackpot · phần lớn là thành công
            let category, earnedMoney, color, usedInsurance = false;
            if (Math.random() < riskRate) {
                category = 'fail';
                let loss = Math.floor(Math.random() * (minWage / 2)) + 1;
                usedInsurance = await db.useInsurance(userId, 'bh_lao_dong');
                if (usedInsurance) {
                    loss = Math.round(loss * 0.2); // Giảm 80% thiệt hại
                }
                earnedMoney = -loss;
                color = config.COLORS.WARNING;
            } else if (Math.random() < (catBuff ? (config.WORK.JACKPOT_CHANCE + 0.05) : config.WORK.JACKPOT_CHANCE)) {
                category = 'jackpot';
                earnedMoney = Math.round(maxWage * config.WORK.JACKPOT_MULT * buffMult);
                color = config.COLORS.JACKPOT;
            } else {
                category = 'success';
                const base = Math.floor(Math.random() * (maxWage - minWage + 1)) + minWage;
                earnedMoney = Math.round(base * buffMult);
                color = config.COLORS.SUCCESS;
            }
            // Mệt mỏi: năng lượng/sức khỏe càng thấp (dưới 50%) thì thu nhập càng giảm
            const fatigue = conditionMultiplier(energyLeft, user.health);
            const grossMoney = earnedMoney;
            if (earnedMoney > 0) earnedMoney = Math.round(earnedMoney * fatigue);

            // Premium: +% thu nhập
            const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
            if (premium && earnedMoney > 0) earnedMoney = Math.round(earnedMoney * (1 + config.PREMIUM.INCOME_BONUS));

            // Prestige (Chuyển sinh): +5% thu nhập mỗi cấp prestige
            if (user.prestige > 0 && earnedMoney > 0) {
                earnedMoney = Math.round(earnedMoney * (1 + user.prestige * config.PRESTIGE.INCOME_BUFF_PER_LEVEL));
            }

            // Sự kiện toàn cục (vd Tết x2): nhân thu nhập + EXP
            const eventMult = getEventMult();
            if (eventMult !== 1 && earnedMoney > 0) earnedMoney = Math.round(earnedMoney * eventMult);
            // Hệ Bệnh: làm quá sức có thể đổ bệnh; đang bệnh thì giảm thu nhập + mất máu.
            const dz = await applyDisease(db, userId, user, locale);
            if (dz.incomeMult !== 1 && earnedMoney > 0) earnedMoney = Math.round(earnedMoney * dz.incomeMult);

            await db.addMoney(userId, earnedMoney, 'wallet');
            const userAfter = await db.getUser(userId);
            const newWallet = userAfter ? Number(userAfter.wallet) : (Number(user.wallet) + earnedMoney);
            const currentHealth = userAfter && userAfter.health !== undefined ? userAfter.health : 100;

            // Nhiệm vụ: đếm số lần làm + tổng tiền kiếm (chỉ khi dương)
            db.questIncr(userId, 'work', 1);
            await handleNewbieQuest(interaction, 'work', 1);
            if (earnedMoney > 0) db.questIncr(userId, 'earn', earnedMoney);

            const displayJobName = t(locale, `jobs.${jobKey}.name`) || jobName;
            const amtStr = `${fmt(Math.abs(earnedMoney), locale)} ${config.CURRENCY}`;
            let resultMessage = pickLine(jobKey, category, locale)
                .replace(/\{amount\}/g, amtStr)
                .replace(/\{job\}/g, displayJobName);
            if (buffActive && earnedMoney > 0) resultMessage += ` *(buff +${Math.round((buffMult - 1) * 100)}%)*`;
            if (premium && earnedMoney > 0) resultMessage += ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*`;
            if (eventMult > 1 && earnedMoney > 0) {
                resultMessage += isEn ? ` *(Event x${eventMult} 🎉)*` : ` *(Sự kiện x${eventMult} 🎉)*`;
            }
            if (fatigue < 1 && earnedMoney > 0) {
                resultMessage += isEn ? ` *(fatigue -${Math.round((1 - fatigue) * 100)}%)*` : ` *(mệt -${Math.round((1 - fatigue) * 100)}%)*`;
            }
            if (usedInsurance) {
                resultMessage += isEn
                    ? `\n🛡️ **Labor Insurance** activated, covering 80% of losses!`
                    : `\n🛡️ **Bảo hiểm Lao động** đã kích hoạt giúp gánh 80% thiệt hại!`;
            }
            if (category === 'jackpot' && catBuff) {
                resultMessage += isEn
                    ? `\n🐱 Kitten **${userPetName}** rubbed against you, bringing fortune to your pocket!`
                    : `\n🐱 Bé mèo **${userPetName}** dụi dụi mang lại tài lộc đầy túi!`;
            }
            if (rongBuff) {
                resultMessage += isEn
                    ? `\n🐲 Baby Dragon **${rongName}** lent dragon power, giving +15% EXP!`
                    : `\n🐲 Bé rồng **${rongName}** truyền long lực giúp cậu nhận thêm 15% EXP!`;
            }
            if (dz.note) resultMessage += `\n${dz.note}`;

            if (usedVehicle) {
                const vehicleName = config.VEHICLES[usedVehicle.vehicle_id]?.name || usedVehicle.vehicle_id;
                const vehicleNameTrans = t(locale, `items.${usedVehicle.vehicle_id}.name`) || vehicleName;
                resultMessage += isEn
                    ? `\n🚗 You drove **${vehicleNameTrans}** to work (Durability: ${usedVehicle.durability}/100)${usedVehicle.broken ? ' ⚠️ *Vehicle broke after this trip!*' : ''}`
                    : `\n🚗 Cậu đã lái **${vehicleNameTrans}** đi làm (Độ bền xe: ${usedVehicle.durability}/100)${usedVehicle.broken ? ' ⚠️ *Xe đã bị hỏng sau chuyến đi này!*' : ''}`;
            }

            // 5. EXP theo cấp nghề
            let gainedExp = Math.round(config.WORK.EXP_BASE + config.WORK.EXP_PER_LEVEL * jobLevel)
                + Math.floor(Math.random() * (config.WORK.EXP_RANDOM + 1));
            if (rongBuff) {
                gainedExp = Math.round(gainedExp * 1.15);
            }
            if (eventMult !== 1) gainedExp = Math.round(gainedExp * eventMult);

            // Đền thờ Clan: +2% EXP mỗi cấp đền thờ
            if (user.clan_id) {
                const clanUpgrades = await db.getClanUpgrade(user.clan_id);
                if (clanUpgrades && clanUpgrades.shrine_level > 0) {
                    gainedExp = Math.round(gainedExp * (1 + clanUpgrades.shrine_level * 0.02));
                }
            }

            const oldLevel = getLevelFromExp(Number(user.exp));
            const newExp = await db.updateExp(userId, gainedExp);
            const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);

            // Cộng XP Sổ Sứ Mệnh (20% cơ hội rơi 20-30 XP)
            if (Math.random() < 0.20) {
                const bpXp = Math.floor(Math.random() * 11) + 20; // 20-30 XP
                const bpRes = await require('../../lib/battlepass').addXp(userId, bpXp);
                if (bpRes && bpRes.levelUp) {
                    resultMessage += t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel });
                }
            }

            // 6. Embed
            let tip = '';
            if (isEn) {
                if (!user.onboarded) tip = 'New here? Type `/start` to claim your **welcome gift** from me~ 🎁';
                else if (category === 'fail') tip = 'A bit unlucky, but don\'t be sad~ Better luck next time, I believe in you! 🌸';
                else if (!user.job_id) tip = 'You are working as a **freelancer** — type `/jobs` to get a job for a higher salary~ 💼';
            } else {
                if (!user.onboarded) tip = 'Cậu mới đến hả? Gõ `/start` để nhận **quà chào mừng** của mình nha~ 🎁';
                else if (category === 'fail') tip = 'Hơi thiếu may mắn chút nhưng đừng buồn nha~ Trận sau sẽ tốt hơn thôi, mình tin cậu! 🌸';
                else if (!user.job_id) tip = 'Cậu đang làm **Nghề tự do** — hãy gõ `/jobs` để xin việc có thu nhập cao hơn nhé~ 💼';
            }

            const description = `> ${resultMessage}\n\n` + (tip ? `> 💡 ${tip}\n` : '');
            
            const fieldWalletName = isEn ? '💵 Wallet Balance' : '💵 Số dư ví';
            const fieldXpName = isEn ? 'Experience' : 'Kinh nghiệm';
            const fieldLvlName = isEn ? 'Level' : 'Cấp độ';
            const fieldEnergyName = isEn ? 'Energy' : 'Năng lượng';
            const fieldHealthName = isEn ? '❤️ Health' : '❤️ Sức khỏe';

            const grossStr = fatigue < 1 && grossMoney > 0
                ? (isEn
                    ? ` *(base ${fmt(grossMoney, locale)}, tired -${Math.round((1 - fatigue) * 100)}%)*`
                    : ` *(gốc ${fmt(grossMoney, locale)}, mệt -${Math.round((1 - fatigue) * 100)}%)*`)
                : '';

            const fields = [
                { name: fieldWalletName, value: `${earnedMoney >= 0 ? '+' : '-'}${fmt(Math.abs(earnedMoney), locale)}${grossStr} → **${fmt(newWallet, locale)}** ${config.CURRENCY}`, inline: false },
                { name: fieldXpName, value: `+${gainedExp} EXP`, inline: true },
                { name: fieldLvlName, value: `Lv.${newLevel}`, inline: true },
                { name: fieldEnergyName, value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: fieldHealthName, value: `${currentHealth}/100`, inline: true },
            ];

            if (newLevel > oldLevel) {
                const bonus = levelUpReward(oldLevel, newLevel);
                if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
                const lvlUpTitle = isEn ? '🎉 Level Up!' : '🎉 Lên cấp!';
                const lvlUpDesc = isEn
                    ? `Congratulations on reaching **Level ${newLevel}**! Bonus: **+${fmt(bonus, locale)}** ${config.CURRENCY} 🎁`
                    : `Chúc mừng cậu đạt **Level ${newLevel}**! Thưởng **+${fmt(bonus, locale)}** ${config.CURRENCY} 🎁`;
                fields.push({ name: lvlUpTitle, value: lvlUpDesc, inline: false });
            }

            const typeMap = { fail: 'error', jackpot: 'jackpot', success: 'success' };
            const embedType = typeMap[category] || 'success';
            
            const embed = buildWaguriEmbed(interaction, embedType, {
                title: isEn ? '💼・Work Result' : '💼・Kết quả làm việc',
                description,
                fields
            }).setTimestamp();

            // Nút "Làm tiếp" — bấm để làm việc lần nữa
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`work:again:${userId}`).setLabel(isEn ? '🔄 Work Again' : '🔄 Làm tiếp').setStyle(ButtonStyle.Secondary)
            );
            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('[WORK COMMAND ERROR]', error);
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: isEn 
                    ? 'Oops, an error occurred while processing the work command. Please try again later~ 🌸'
                    : 'Ơ, có lỗi khi xử lý lệnh làm việc rồi, cậu thử lại sau nhé~ 🌸'
            });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
