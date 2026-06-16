const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Làm việc để kiếm tiền'),
    async execute(interaction) {
        // Hoãn lại reply để có thời gian xử lý database chờ API
        await interaction.deferReply();

        const userId = interaction.user.id;

        // 1. Claim cooldown NGUYÊN TỬ ngay từ đầu (chống spam/double-work khi chạy song song).
        //    Nếu claim được, cooldown đã được đặt luôn trong DB.
        const cooldownTime = await db.claimCooldown(userId, 'work', config.WORK.COOLDOWN_SECONDS);
        if (cooldownTime) {
            return await interaction.editReply(
                `Mới làm xong mệt quá bạn ơi 💦. Hãy quay lại sau <t:${Math.floor(cooldownTime / 1000)}:R> nữa nhé!`
            );
        }

        try {
            // 2. Lấy hoặc tạo dữ liệu người dùng
            const user = await db.getUser(userId);
            if (!user) {
                return await interaction.editReply('Lỗi hệ thống: Không thể kết nối với Thuế. Vui lòng thử lại sau!');
            }

            // 3. Xác định thông số nghề (mặc định nếu chưa apply job)
            let { name: jobName, min_wage: minWage, max_wage: maxWage, risk_rate: riskRate } = config.WORK.DEFAULT_JOB;

            if (user.job_id) {
                const { data: job } = await db.supabase
                    .from('jobs')
                    .select('*')
                    .eq('id', user.job_id)
                    .single();

                if (job) {
                    minWage = job.min_wage;
                    maxWage = job.max_wage;
                    jobName = job.name;
                    riskRate = job.risk_rate;
                }
            }

            // 4. Xử lý rủi ro (Risk event)
            // TODO (Phase 2): chuyển sang generator 70/20/10 + kịch bản hài hước theo từng nghề.
            const isUnlucky = Math.random() < riskRate;
            let earnedMoney = 0;
            let resultMessage = '';

            if (isUnlucky) {
                earnedMoney = -Math.floor(Math.random() * (minWage / 2));
                await db.addMoney(userId, earnedMoney, 'wallet');
                resultMessage = `⚠️ Xui xẻo! Hôm nay đi làm **${jobName}** bạn vướng phải rắc rối và bị mất **${Math.abs(earnedMoney)}** ${config.CURRENCY}.`;
            } else {
                earnedMoney = Math.floor(Math.random() * (maxWage - minWage + 1)) + minWage;
                await db.addMoney(userId, earnedMoney, 'wallet');
                resultMessage = `✅ Xuất sắc! Bạn cày cuốc **${jobName}** và kiếm được **${earnedMoney}** ${config.CURRENCY} vào ví!`;
            }

            // 5. Cộng EXP và tính level mới (cảnh báo lên cấp nếu có)
            const { min, max } = config.WORK.EXP_PER_WORK;
            const gainedExp = Math.floor(Math.random() * (max - min + 1)) + min;
            const oldLevel = getLevelFromExp(Number(user.exp));
            const newExp = await db.updateExp(userId, gainedExp);
            const newLevel = newExp === null ? oldLevel : getLevelFromExp(newExp);

            // 6. Gửi Embed thông báo
            const resultEmbed = new EmbedBuilder()
                .setColor(isUnlucky ? config.COLORS.ERROR : config.COLORS.SUCCESS)
                .setTitle('💼 Kết quả làm việc')
                .setDescription(resultMessage)
                .addFields(
                    { name: 'Kinh nghiệm nhận được', value: `+${gainedExp} EXP`, inline: true },
                    { name: 'Cấp độ', value: `Lv.${newLevel}`, inline: true }
                )
                .setTimestamp();

            if (newLevel > oldLevel) {
                resultEmbed.addFields({ name: '🎉 Chúc mừng!', value: `Bạn đã lên **Level ${newLevel}**!`, inline: false });
            }

            await interaction.editReply({ embeds: [resultEmbed] });

        } catch (error) {
            console.error('[WORK COMMAND ERROR]', error);
            await interaction.editReply('Đã xảy ra lỗi hệ thống nghiêm trọng khi xử lý lệnh làm việc.');
        }
    },
};
