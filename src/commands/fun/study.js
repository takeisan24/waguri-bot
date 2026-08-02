const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const studyLib = require('../../lib/study');
const db = require('../../database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('study')
        .setDescription('Đồng hành học tập Pomodoro 24/7 cùng Waguri 📚')
        .addSubcommand(sub =>
            sub
                .setName('start')
                .setDescription('Bắt đầu phiên học tập tập trung Pomodoro')
                .addIntegerOption(opt =>
                    opt
                        .setName('duration')
                        .setDescription('Thời gian tập trung (phút): 25, 50, hoặc 15-120 tùy chọn')
                        .setRequired(false)
                        .setMinValue(15)
                        .setMaxValue(120)
                )
                .addStringOption(opt =>
                    opt
                        .setName('title')
                        .setDescription('Tên môn học hoặc công việc (vd: Ôn thi Toán, Code Web)')
                        .setRequired(false)
                        .setMaxLength(50)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName('status')
                .setDescription('Xem tiến trình phiên học và chuỗi chuyên cần hiện tại')
        )
        .addSubcommand(sub =>
            sub
                .setName('stop')
                .setDescription('Nộp bài và kết thúc sớm phiên học')
        )
        .addSubcommand(sub =>
            sub
                .setName('leaderboard')
                .setDescription('Xem Bảng xếp hạng Học Viên Chuyên Cần')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        if (subcommand === 'start') {
            const duration = interaction.options.getInteger('duration') || 25;
            const title = interaction.options.getString('title') || 'Pomodoro Study';

            const result = await studyLib.startStudySession(userId, guildId, title, duration, interaction);
            if (!result.success && result.reason === 'ALREADY_ACTIVE') {
                return interaction.reply({
                    content: '🌸 *Cậu đang có một phiên học tập trung chưa hoàn thành rùi nhen! Dùng `/study status` để xem hoặc `/study stop` để nộp bài sớm nhen~* 🍵',
                    ephemeral: true
                });
            }

            const session = result.session;
            const embed = studyLib.buildStudyEmbed(session, session.remainingMs);
            const row = studyLib.buildControlRow(session.isPaused);

            const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
            session.message = msg;
            return;
        }

        if (subcommand === 'status') {
            const session = studyLib.activeSessions.get(userId);
            if (!session) {
                const userRow = await db.getUser(userId);
                const streak = userRow?.study_streak || 0;
                const totalMinutes = userRow?.total_study_minutes || 0;
                const points = userRow?.study_points || 0;

                const embed = new EmbedBuilder()
                    .setColor('#8B5CF6')
                    .setTitle('📚 NHẬT KÝ HỌC TẬP WAGURI')
                    .setDescription(
                        `*Hiện tại cậu chưa có phiên học nào đang chạy nhen~*\n\n` +
                        `**Thống kê cá nhân:**\n` +
                        `• **Chuỗi Chuyên Cần 📚:** \`${streak} ngày\`\n` +
                        `• **Tổng thời gian tập trung:** \`${Math.floor(totalMinutes / 60)} giờ ${totalMinutes % 60} phút\`\n` +
                        `• **Hạt Hoa Kikyo 🌸:** \`${points} hạt\`\n\n` +
                        '*Dùng `/study start` để bắt đầu một phiên Pomodoro 25 phút mới cùng Waguri nhen!* ✨'
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            const remaining = session.endsAt - Date.now();
            const embed = studyLib.buildStudyEmbed(session, remaining);
            const row = studyLib.buildControlRow(session.isPaused);
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (subcommand === 'stop') {
            const result = await studyLib.finishSession(userId, true);
            if (!result) {
                return interaction.reply({
                    content: '🌸 *Cậu chưa có phiên học nào đang chạy để dừng nhen~* 🍵',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `🌸 *Waguri đã lưu lại phiên học "${result.session.sessionName}" cho cậu rùi nhen~ Hẹn gặp lại cậu ở phiên học tiếp theo!* ✨`,
                ephemeral: true
            });
        }

        if (subcommand === 'leaderboard') {
            const topList = await db.getStudyLeaderboard(10);
            if (!topList || topList.length === 0) {
                return interaction.reply({
                    content: '🌸 *Chưa có thành tích học tập nào được ghi nhận. Hãy gõ `/study start` để là người đầu tiên ghi danh nhen!* ✨',
                    ephemeral: true
                });
            }

            let desc = '🏆 **TOP 10 HỌC VIÊN CHUYÊN CẦN HỌC VIỆN KIKYO** 📚\n\n';
            topList.forEach((row, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️';
                desc += `${medal} **#${idx + 1}** <@${row.user_id}> — \`${row.study_streak} ngày\` (Tổng ${Math.floor((row.total_study_minutes || 0) / 60)}h ${row.total_study_minutes % 60}m)\n`;
            });

            const embed = new EmbedBuilder()
                .setColor('#8B5CF6')
                .setTitle('📚 BẢNG XẾP HẠNG HỌC TẬP WAGURI')
                .setDescription(desc)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
};
