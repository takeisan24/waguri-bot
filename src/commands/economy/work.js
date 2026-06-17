const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const scripts = require('../../data/workScripts');
const { getLevelFromExp } = require('../../lib/leveling');
const { onCooldown } = require('../../lib/cooldown');
const { fatigueMultiplier } = require('../../lib/fatigue');

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
        if (cd) return interaction.editReply(`Từ từ thôi nào~ nghỉ ${cd}s rồi làm tiếp nhé! 🌸`);

        // 1. Tiêu năng lượng (gate chính)
        const energyLeft = await db.spendEnergy(userId, config.ENERGY.COST_PER_WORK);
        if (energyLeft < 0) {
            const cur = await db.getEnergy(userId);
            return interaction.editReply(
                `Cậu hết năng lượng rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${config.ENERGY.COST_PER_WORK}). ` +
                `Nghỉ ngơi chút hoặc ăn gì đó bằng \`/eat\` nhé~ 🌸`
            );
        }

        try {
            const user = await db.getUser(userId);
            if (!user) return interaction.editReply('Hơ, mình chưa lấy được dữ liệu của cậu, thử lại sau nhé~ 🌸');

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

            // 4. Kết quả: 20% (risk) xui · còn lại có 8% jackpot · 70%+ thành công
            let category, earnedMoney, color;
            if (Math.random() < riskRate) {
                category = 'fail';
                earnedMoney = -(Math.floor(Math.random() * (minWage / 2)) + 1);
                color = config.COLORS.WARNING;
            } else if (Math.random() < config.WORK.JACKPOT_CHANCE) {
                category = 'jackpot';
                earnedMoney = Math.round(maxWage * config.WORK.JACKPOT_MULT * buffMult);
                color = config.COLORS.JACKPOT;
            } else {
                category = 'success';
                const base = Math.floor(Math.random() * (maxWage - minWage + 1)) + minWage;
                earnedMoney = Math.round(base * buffMult);
                color = config.COLORS.SUCCESS;
            }
            // Mệt mỏi: làm liên tục thì thu nhập giảm dần
            const fatigue = fatigueMultiplier(userId);
            const grossMoney = earnedMoney;
            if (earnedMoney > 0) earnedMoney = Math.round(earnedMoney * fatigue);

            await db.addMoney(userId, earnedMoney, 'wallet');
            const newWallet = Number(user.wallet) + earnedMoney;

            // Nhiệm vụ: đếm số lần làm + tổng tiền kiếm (chỉ khi dương)
            db.questIncr(userId, 'work', 1);
            if (earnedMoney > 0) db.questIncr(userId, 'earn', earnedMoney);

            const amtStr = `${fmt(Math.abs(earnedMoney))} ${config.CURRENCY}`;
            let resultMessage = pickLine(jobKey, category)
                .replace(/\{amount\}/g, amtStr)
                .replace(/\{job\}/g, jobName);
            if (buffActive && earnedMoney > 0) resultMessage += ` *(buff +${Math.round((buffMult - 1) * 100)}%)*`;

            // 5. EXP theo cấp nghề
            const gainedExp = Math.round(config.WORK.EXP_BASE + config.WORK.EXP_PER_LEVEL * jobLevel)
                + Math.floor(Math.random() * (config.WORK.EXP_RANDOM + 1));
            const oldLevel = getLevelFromExp(Number(user.exp));
            const newExp = await db.updateExp(userId, gainedExp);
            const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);

            // 6. Embed
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('💼 Kết quả làm việc')
                .setDescription(resultMessage)
                .addFields(
                    { name: '💵 Số dư ví', value: `${earnedMoney >= 0 ? '+' : '-'}${fmt(Math.abs(earnedMoney))}${fatigue < 1 && grossMoney > 0 ? ` *(gốc ${fmt(grossMoney)}, mệt -${Math.round((1 - fatigue) * 100)}%)*` : ''} → **${fmt(newWallet)}** ${config.CURRENCY}`, inline: false },
                    { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
                    { name: 'Cấp độ', value: `Lv.${newLevel}`, inline: true },
                    { name: 'Năng lượng', value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                )
                .setTimestamp();
            if (newLevel > oldLevel) {
                embed.addFields({ name: '🎉 Lên cấp!', value: `Chúc mừng cậu đạt **Level ${newLevel}**! Cố lên nhé~`, inline: false });
            }
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[WORK COMMAND ERROR]', error);
            await interaction.editReply('Ơ, có lỗi khi xử lý lệnh làm việc rồi, cậu thử lại sau nhé~ 🌸');
        }
    },
};
