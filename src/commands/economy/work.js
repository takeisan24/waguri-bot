const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Làm việc để kiếm tiền (tốn năng lượng)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        // 1. Tiêu năng lượng NGUYÊN TỬ (gate chính, thay cho cooldown)
        const energyLeft = await db.spendEnergy(userId, config.ENERGY.COST_PER_WORK);
        if (energyLeft < 0) {
            const cur = await db.getEnergy(userId);
            return interaction.editReply(
                `Cậu hết năng lượng rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${config.ENERGY.COST_PER_WORK}). ` +
                `Nghỉ ngơi chút để hồi sức, hoặc ăn gì đó bằng \`/eat\` nhé~ 🌸`
            );
        }

        try {
            const user = await db.getUser(userId);
            if (!user) return interaction.editReply('Hơ, mình chưa lấy được dữ liệu của cậu, thử lại sau nhé~ 🌸');

            // 2. Thông số nghề (mặc định nếu chưa apply)
            let { name: jobName, min_wage: minWage, max_wage: maxWage, risk_rate: riskRate, required_level: jobLevel } = config.WORK.DEFAULT_JOB;
            if (user.job_id) {
                const job = await db.getJob(user.job_id);
                if (job) {
                    jobName = job.name; minWage = job.min_wage; maxWage = job.max_wage;
                    riskRate = job.risk_rate; jobLevel = job.required_level;
                }
            }

            // 3. Buff thu nhập (nếu còn hạn)
            const now = Date.now();
            const buffActive = user.buff_expires_at && new Date(user.buff_expires_at).getTime() > now;
            const buffMult = buffActive ? Number(user.buff_mult) : 1;

            // 4. Rủi ro / thành công
            const isUnlucky = Math.random() < riskRate;
            let earnedMoney = 0;
            let resultMessage = '';

            if (isUnlucky) {
                earnedMoney = -Math.floor(Math.random() * (minWage / 2));
                await db.addMoney(userId, earnedMoney, 'wallet');
                resultMessage = `⚠️ Ôi, hôm nay làm **${jobName}** gặp chút trục trặc, cậu mất **${Math.abs(earnedMoney)}** ${config.CURRENCY}. Lần sau may mắn hơn nhé!`;
            } else {
                let base = Math.floor(Math.random() * (maxWage - minWage + 1)) + minWage;
                earnedMoney = Math.round(base * buffMult);
                await db.addMoney(userId, earnedMoney, 'wallet');
                const buffNote = buffActive ? ` *(buff +${Math.round((buffMult - 1) * 100)}%)*` : '';
                resultMessage = `✅ Tốt lắm! Cậu làm **${jobName}** và kiếm được **${earnedMoney}** ${config.CURRENCY}${buffNote}.`;
            }

            // 5. EXP theo cấp nghề
            const gainedExp = Math.round(config.WORK.EXP_BASE + config.WORK.EXP_PER_LEVEL * jobLevel)
                + Math.floor(Math.random() * (config.WORK.EXP_RANDOM + 1));
            const oldLevel = getLevelFromExp(Number(user.exp));
            const newExp = await db.updateExp(userId, gainedExp);
            const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);

            // 6. Embed
            const embed = new EmbedBuilder()
                .setColor(isUnlucky ? config.COLORS.WARNING : config.COLORS.SUCCESS)
                .setTitle('💼 Kết quả làm việc')
                .setDescription(resultMessage)
                .addFields(
                    { name: 'Kinh nghiệm', value: `+${gainedExp} EXP`, inline: true },
                    { name: 'Cấp độ', value: `Lv.${newLevel}`, inline: true },
                    { name: 'Năng lượng', value: `${energyLeft}/${config.ENERGY.MAX} ⚡`, inline: true },
                )
                .setTimestamp();

            if (newLevel > oldLevel) {
                embed.addFields({ name: '🎉 Lên cấp!', value: `Chúc mừng cậu đã đạt **Level ${newLevel}**! Cố lên nhé~`, inline: false });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[WORK COMMAND ERROR]', error);
            await interaction.editReply('Ơ, có lỗi khi xử lý lệnh làm việc rồi, cậu thử lại sau nhé~ 🌸');
        }
    },
};
