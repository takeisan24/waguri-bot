const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const scripts = require('../../data/workScripts');
const { getLevelFromExp, levelUpReward } = require('../../lib/leveling');
const { onCooldown } = require('../../lib/cooldown');
const { conditionMultiplier } = require('../../lib/fatigue');
const { getEventMult } = require('../../lib/event');
const { buildWaguriEmbed } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

function pickLine(jobKey, category) {
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

        // 0. Cooldown nhẹ chống spam
        const cd = onCooldown('work', userId, config.ACTION_COOLDOWN_MS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `Từ từ thôi nào~ nghỉ ${cd}s rồi làm tiếp nhé! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        try {
            const user = await db.getUser(userId);
            if (!user) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: 'Hơ, mình chưa lấy được dữ liệu của cậu, thử lại sau nhé~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // 1. Kiểm tra sức khỏe (Health)
            const userHealth = user.health !== undefined ? user.health : 100;
            if (userHealth < 30) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    title: '🏥 Sức khỏe quá yếu',
                    description: `Sức khỏe của cậu quá yếu (**${userHealth}/100** ❤️). Cậu cần ít nhất **30** sức khỏe để làm việc. Hãy dùng thuốc/hộp y tế (\`/eat\`) hoặc chạy lệnh \`/hospital\` để nhập viện nhé!`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // 2. Kiểm tra phương tiện di chuyển trong kho đồ để tính chi phí năng lượng.
            //    Xét MỌI xe trong config.VEHICLES, chọn xe có energy_cost THẤP NHẤT đang sở hữu
            //    (khớp thứ tự ưu tiên của RPC use_vehicle).
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
                    description: `Cậu hết năng lượng rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${energyCost}). Nghỉ ngơi chút hoặc ăn gì đó bằng \`/eat\` nhé~ 🌸`
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

                // Giảm sức khỏe ngẫu nhiên từ 10 đến 20 điểm
                const healthLoss = Math.floor(Math.random() * 11) + 10;
                await db.addHealth(userId, -healthLoss);
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

            // Premium: +% thu nhập (user đã fetch sẵn, không tốn query thêm)
            const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
            if (premium && earnedMoney > 0) earnedMoney = Math.round(earnedMoney * (1 + config.PREMIUM.INCOME_BONUS));

            // Sự kiện toàn cục (vd Tết x2): nhân thu nhập + EXP
            const eventMult = getEventMult();
            if (eventMult !== 1 && earnedMoney > 0) earnedMoney = Math.round(earnedMoney * eventMult);

            await db.addMoney(userId, earnedMoney, 'wallet');
            const userAfter = await db.getUser(userId);
            const newWallet = userAfter ? Number(userAfter.wallet) : (Number(user.wallet) + earnedMoney);
            const currentHealth = userAfter && userAfter.health !== undefined ? userAfter.health : 100;

            // Nhiệm vụ: đếm số lần làm + tổng tiền kiếm (chỉ khi dương)
            db.questIncr(userId, 'work', 1);
            if (earnedMoney > 0) db.questIncr(userId, 'earn', earnedMoney);

            const amtStr = `${fmt(Math.abs(earnedMoney))} ${config.CURRENCY}`;
            let resultMessage = pickLine(jobKey, category)
                .replace(/\{amount\}/g, amtStr)
                .replace(/\{job\}/g, jobName);
            if (buffActive && earnedMoney > 0) resultMessage += ` *(buff +${Math.round((buffMult - 1) * 100)}%)*`;
            if (premium && earnedMoney > 0) resultMessage += ` *(Premium +${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% 💎)*`;
            if (eventMult > 1 && earnedMoney > 0) resultMessage += ` *(Sự kiện x${eventMult} 🎉)*`;
            if (fatigue < 1 && earnedMoney > 0) resultMessage += ` *(mệt -${Math.round((1 - fatigue) * 100)}%)*`;
            if (usedInsurance) resultMessage += `\n🛡️ **Bảo hiểm Lao động** đã kích hoạt giúp gánh 80% thiệt hại!`;
            if (category === 'jackpot' && catBuff) resultMessage += `\n🐱 Bé mèo **${userPetName}** dụi dụi mang lại tài lộc đầy túi!`;

            if (usedVehicle) {
                const vehicleName = config.VEHICLES[usedVehicle.vehicle_id]?.name || usedVehicle.vehicle_id;
                resultMessage += `\n🚗 Cậu đã lái **${vehicleName}** đi làm (Độ bền xe: ${usedVehicle.durability}/100)${usedVehicle.broken ? ' ⚠️ *Xe đã bị hỏng sau chuyến đi này!*' : ''}`;
            }

            // 5. EXP theo cấp nghề
            let gainedExp = Math.round(config.WORK.EXP_BASE + config.WORK.EXP_PER_LEVEL * jobLevel)
                + Math.floor(Math.random() * (config.WORK.EXP_RANDOM + 1));
            if (eventMult !== 1) gainedExp = Math.round(gainedExp * eventMult);
            const oldLevel = getLevelFromExp(Number(user.exp));
            const newExp = await db.updateExp(userId, gainedExp);
            const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);

            // 6. Embed — kèm 1 gợi ý "bước tiếp theo" theo ngữ cảnh (dẫn dắt người mới)
            let tip = '';
            if (!user.onboarded) tip = 'Người mới hả? Gõ `/start` nhận **quà chào mừng** từ mình nha~ 🎁';
            else if (category === 'fail') tip = 'Đen một chút thôi mà, đừng buồn nha~ Lần sau may mắn hơn, mình tin cậu! 🌸';
            else if (!user.job_id) tip = 'Cậu đang làm **nghề tự do** — gõ `/jobs` xin nghề để lương cao hơn nha~ 💼';
            else if (energyLeft < energyCost * 2) tip = 'Năng lượng sắp cạn rồi, `/eat` hoặc `/ngu` nghỉ chút cho lại sức nhé~ 🌸';
            else if (newLevel > oldLevel) tip = 'Lên cấp rồi nè! Ghé `/jobs` xem có mở nghề xịn hơn không nha~ ✨';
            const description = `> ${resultMessage}\n\n` + (tip ? `> 💡 ${tip}\n` : '');
            const fields = [
                { name: '💵 Số dư ví', value: `${earnedMoney >= 0 ? '+' : '-'}${fmt(Math.abs(earnedMoney))}${fatigue < 1 && grossMoney > 0 ? ` *(gốc ${fmt(grossMoney)}, mệt -${Math.round((1 - fatigue) * 100)}%)*` : ''} → **${fmt(newWallet)}** ${config.CURRENCY}`, inline: false },
                { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
                { name: 'Cấp độ', value: `Lv.${newLevel}`, inline: true },
                { name: 'Năng lượng', value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: '❤️ Sức khỏe', value: `${currentHealth}/100`, inline: true },
            ];

            if (newLevel > oldLevel) {
                const bonus = levelUpReward(oldLevel, newLevel);
                if (bonus > 0) await db.addMoney(userId, bonus, 'wallet');
                fields.push({ name: '🎉 Lên cấp!', value: `Chúc mừng cậu đạt **Level ${newLevel}**! Thưởng **+${fmt(bonus)}** ${config.CURRENCY} 🎁`, inline: false });
            }

            const typeMap = { fail: 'error', jackpot: 'jackpot', success: 'success' };
            const embedType = typeMap[category] || 'success';
            
            const embed = buildWaguriEmbed(interaction, embedType, {
                title: '💼・Kết quả làm việc',
                description,
                fields
            }).setTimestamp();

            // Nút "Làm tiếp" — bấm để làm việc lần nữa (vẫn qua cooldown/năng lượng).
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`work:again:${userId}`).setLabel('🔄 Làm tiếp').setStyle(ButtonStyle.Secondary)
            );
            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            console.error('[WORK COMMAND ERROR]', error);
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Ơ, có lỗi khi xử lý lệnh làm việc rồi, cậu thử lại sau nhé~ 🌸'
            });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
