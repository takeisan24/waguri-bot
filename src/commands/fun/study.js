const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const studyLib = require('../../lib/study');
const db = require('../../database');
const { getInteractionLanguage, t } = require('../../lib/i18n');

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
        const locale = await getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        if (subcommand === 'start') {
            const duration = interaction.options.getInteger('duration') || 25;
            const title = interaction.options.getString('title') || 'Pomodoro Study';

            const result = await studyLib.startStudySession(userId, guildId, title, duration, interaction);
            if (!result.success && result.reason === 'ALREADY_ACTIVE') {
                return interaction.reply({
                    content: t(locale, 'commands.study.err_already_running'),
                    flags: MessageFlags.Ephemeral
                });
            }
            // DB hỏng KHÔNG được nói thành "đang có phiên khác" — hai chuyện khác hẳn nhau và
            // người dùng sẽ đi tìm phiên không tồn tại (đúng lớp lỗi của 45d7c92).
            if (!result.success) {
                return interaction.reply({
                    content: t(locale, 'common.retry_later'),
                    flags: MessageFlags.Ephemeral
                });
            }

            const session = result.session;
            const embed = studyLib.buildStudyEmbed(session, session.remainingMs);
            const row = studyLib.buildControlRow(session.isPaused, locale);

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
                    .setTitle(t(locale, 'commands.study.log_title'))
                    .setDescription(
                        t(locale, 'commands.study.log_stats', {
                            streak, hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60, points,
                        }) + t(locale, 'commands.study.log_hint')
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            const remaining = session.endsAt - Date.now();
            const embed = studyLib.buildStudyEmbed(session, remaining);
            const row = studyLib.buildControlRow(session.isPaused, locale);
            return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'stop') {
            const result = await studyLib.finishSession(userId, true);
            if (!result) {
                return interaction.reply({
                    content: t(locale, 'commands.study.err_no_session_stop'),
                    flags: MessageFlags.Ephemeral
                });
            }

            return interaction.reply({
                content: t(locale, 'commands.study.stop_saved', { name: result.session.sessionName }),
                flags: MessageFlags.Ephemeral
            });
        }

        if (subcommand === 'leaderboard') {
            const topList = await db.getStudyLeaderboard(10);
            if (!topList || topList.length === 0) {
                return interaction.reply({
                    content: t(locale, 'commands.study.lb_empty'),
                    flags: MessageFlags.Ephemeral
                });
            }

            let desc = t(locale, 'commands.study.lb_header');
            topList.forEach((row, idx) => {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🎖️';
                desc += t(locale, 'commands.study.lb_row', {
                    medal, rank: idx + 1, user: row.user_id, streak: row.study_streak,
                    hours: Math.floor((row.total_study_minutes || 0) / 60), minutes: row.total_study_minutes % 60,
                });
            });

            const embed = new EmbedBuilder()
                .setColor('#8B5CF6')
                .setTitle(t(locale, 'commands.study.lb_title'))
                .setDescription(desc)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
};
