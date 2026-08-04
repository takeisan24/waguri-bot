/**
 * Core Engine: Study Companion & Pomodoro Manager
 * Manages active focus sessions, progress bar rendering, and atomic reward completion.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../database');
const { t } = require('../lib/i18n');

// Active sessions map: userId -> SessionObject
const activeSessions = new Map();

// Dọn session bỏ hoang: user pause rồi bỏ đi -> session kẹt trong activeSessions MÃI (khóa /study start
// tới khi restart) + interval 30s leak. Phiên tối đa 120 phút; phiên "sống" quá 3h chắc chắn là rác ->
// huỷ (early-exit, không thưởng) — finishSession dọn timer/interval + xoá khỏi map. .unref() để không giữ
// event-loop khi tắt bot. (finishSession là function declaration nên đã hoisted, gọi được ở đây.)
const MAX_SESSION_AGE_MS = 3 * 60 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const [userId, s] of activeSessions) {
        if (now - (s.startedAt || 0) > MAX_SESSION_AGE_MS) {
            finishSession(userId, true).catch(() => {});
        }
    }
}, 10 * 60 * 1000).unref();

/**
 * Render visual progress bar [▓▓▓▓▓▓░░░░] 60%
 */
function renderProgressBar(percent, length = 12) {
    const clamped = Math.max(0, Math.min(100, percent));
    const filledLength = Math.round((clamped / 100) * length);
    const emptyLength = length - filledLength;
    const filledBar = '▓'.repeat(filledLength);
    const emptyBar = '░'.repeat(emptyLength);
    return `[${filledBar}${emptyBar}] ${clamped}%`;
}

/**
 * Format milliseconds to MM:SS
 */
function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Build Study Control Row Buttons
 */
function buildControlRow(isPaused = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(isPaused ? 'study_resume' : 'study_pause')
            .setLabel(isPaused ? 'Tiếp tục ▶️' : 'Tạm dừng ⏸️')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('study_stop')
            .setLabel('Nộp bài sớm ⏹️')
            .setStyle(ButtonStyle.Danger)
    );
}

/**
 * Build Study Progress Embed
 */
function buildStudyEmbed(session, remainingMs) {
    const totalMs = session.durationMinutes * 60 * 1000;
    const elapsedMs = totalMs - remainingMs;
    const percent = Math.min(100, Math.floor((elapsedMs / totalMs) * 100));
    const progressBar = renderProgressBar(percent);
    const formattedRemaining = formatTime(remainingMs);

    const embed = new EmbedBuilder()
        .setColor(session.isPaused ? '#F59E0B' : '#8B5CF6')
        .setTitle(`📚 GÓC HỌC BÀI POMODORO WAGURI — ${session.sessionName}`)
        .setDescription(
            `*Waguri đang ngồi cạnh giữ im lặng để cậu tập trung nè~* 🌸\n\n` +
            `**Môn học / Công việc:** ${session.sessionName}\n` +
            `**Tiến trình:** \`${progressBar}\`\n` +
            `**Thời gian còn lại:** \`${formattedRemaining}\` / \`${session.durationMinutes} phút\`\n` +
            `**Trạng thái:** ${session.isPaused ? '⏸️ *Tạm dừng giải lao*' : '🟢 *Đang tập trung cùng Waguri...*'}`
        )
        .setFooter({ text: 'Waguri Study Companion • Tập trung 25p - Nghỉ 5p' })
        .setTimestamp();

    return embed;
}

/**
 * Complete Study Session & Award Rewards
 */
async function finishSession(userId, isEarlyExit = false) {
    const session = activeSessions.get(userId);
    if (!session) return null;

    try {
        if (session.timer) clearTimeout(session.timer);
        if (session.updateInterval) clearInterval(session.updateInterval);
    } catch {
        // Cleanup safety
    } finally {
        activeSessions.delete(userId);
    }

    if (isEarlyExit) {
        if (session.dbSessionId) {
            await db.cancelStudySession(session.dbSessionId, userId);
        }
        return { status: 'CANCELLED', session };
    }

    // Award rewards
    const minutes = session.durationMinutes;
    const earnedCoins = BigInt(minutes * 50);
    const earnedExp = BigInt(minutes * 20);
    const studyPoints = Math.floor(minutes / 5);

    let res = null;
    if (session.dbSessionId) {
        res = await db.completeStudySession(session.dbSessionId, userId, earnedCoins, earnedExp, studyPoints);
    }

    // CHỈ coi là đã trao thưởng khi RPC trả success=true. Nếu RPC lỗi/null (vd cột sai, DB treo)
    // -> awarded=false để KHÔNG hiển thị "thành công giả" (đã cộng Xu/EXP) khi thật ra chưa cộng.
    const awarded = !!(res && res.success);

    return {
        status: 'COMPLETED',
        session,
        awarded,
        earnedCoins,
        earnedExp,
        studyPoints,
        newStreak: (res && res.new_streak) || 1
    };
}

/**
 * Helper to schedule session finish timer
 */
function scheduleFinishTimer(session, delayMs) {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(async () => {
        const result = await finishSession(session.userId, false);
        if (result && session.message) {
            let finishEmbed;
            if (result.awarded) {
                finishEmbed = new EmbedBuilder()
                    .setColor('#10B981')
                    .setTitle(`🎉 HOÀN THÀNH PHIÊN HỌC — ${session.sessionName}!`)
                    .setDescription(
                        `*Waguri khẽ vỗ tay chúc mừng cậu nè!* 🌸🍵\n\n` +
                        `Cậu đã chăm chỉ hoàn thành **${session.durationMinutes} phút** tập trung tuyệt vời!\n` +
                        `**Phần thưởng:**\n` +
                        `• **+${result.earnedCoins} Xu** 🪙\n` +
                        `• **+${result.earnedExp} EXP** ✨\n` +
                        `• **+${result.studyPoints} Hạt Hoa Kikyo 🌸**\n` +
                        `• **Chuỗi Chuyên Cần 📚:** \`${result.newStreak} ngày\`\n\n` +
                        `*Nghỉ tay 5-10 phút uống chút trà cùng Waguri rùi tiếp tục nhen!* ☕`
                    )
                    .setTimestamp();
            } else {
                // RPC cộng thưởng thất bại -> KHÔNG báo đã nhận thưởng (tránh lừa người dùng).
                finishEmbed = new EmbedBuilder()
                    .setColor('#F59E0B')
                    .setTitle(`✅ ĐÃ HOÀN THÀNH PHIÊN HỌC — ${session.sessionName}`)
                    .setDescription(
                        `*Waguri ghi nhận cậu đã học xong **${session.durationMinutes} phút** rồi nhen!* 🌸\n\n` +
                        `⚠️ Hệ thống đang bận nên **chưa cộng được phần thưởng** vào lúc này. ` +
                        `Cậu thử lại sau một chút hoặc báo admin nếu tình trạng lặp lại nhé~ 🍵`
                    )
                    .setTimestamp();
            }

            await session.message.edit({ embeds: [finishEmbed], components: [] }).catch(() => {});
        }
    }, delayMs);
}

/**
 * Start a new Study Session
 */
async function startStudySession(userId, guildId, sessionName, durationMinutes, interaction) {
    if (activeSessions.has(userId)) {
        return { success: false, reason: 'ALREADY_ACTIVE' };
    }

    const duration = Math.max(15, Math.min(120, durationMinutes || 25));
    const name = sessionName || 'Pomodoro Study';

    // Insert DB session record
    const dbSession = await db.startStudySession(userId, guildId, name, duration);
    const dbSessionId = dbSession?.id || null;

    const totalMs = duration * 60 * 1000;
    const session = {
        userId,
        guildId,
        sessionName: name,
        durationMinutes: duration,
        dbSessionId,
        startedAt: Date.now(),
        endsAt: Date.now() + totalMs,
        isPaused: false,
        remainingMs: totalMs,
        timer: null,
        updateInterval: null,
        message: null
    };

    activeSessions.set(userId, session);

    // Setup timer finish
    scheduleFinishTimer(session, totalMs);

    // Setup interval for progress bar embed updates every 30s
    session.updateInterval = setInterval(async () => {
        if (session.isPaused) return;

        const remaining = session.endsAt - Date.now();
        session.remainingMs = Math.max(0, remaining);

        if (remaining > 0 && session.message) {
            const embed = buildStudyEmbed(session, session.remainingMs);
            const row = buildControlRow(session.isPaused);
            await session.message.edit({ embeds: [embed], components: [row] }).catch(() => {});
        }
    }, 30_000).unref();

    return { success: true, session };
}

/**
 * Handle Study Control Buttons
 */
async function handleStudyButton(interaction) {
    const { customId, user, message } = interaction;
    const session = activeSessions.get(user.id);

    if (!session) {
        return interaction.reply({
            content: '🌸 *Cậu chưa có phiên học nào đang chạy nhen~* 🍵',
            ephemeral: true
        }).catch(() => {});
    }

    if (session.message && message && session.message.id !== message.id) {
        return interaction.reply({
            content: '🌸 *Đây không phải góc học tập của cậu nhen~ Cậu hãy dùng `/study start` để tạo phiên học cho riêng mình nha!* 🍵',
            ephemeral: true
        }).catch(() => {});
    }

    if (customId === 'study_pause') {
        if (session.isPaused) return interaction.deferUpdate().catch(() => {});
        session.isPaused = true;
        if (session.timer) {
            clearTimeout(session.timer);
            session.timer = null;
        }
        const remaining = session.endsAt - Date.now();
        session.remainingMs = Math.max(0, remaining);
        const embed = buildStudyEmbed(session, session.remainingMs);
        const row = buildControlRow(true);
        await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    } else if (customId === 'study_resume') {
        if (!session.isPaused) return interaction.deferUpdate().catch(() => {});
        session.isPaused = false;
        session.endsAt = Date.now() + session.remainingMs;
        scheduleFinishTimer(session, session.remainingMs);
        const embed = buildStudyEmbed(session, session.remainingMs);
        const row = buildControlRow(false);
        await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    } else if (customId === 'study_stop') {
        await finishSession(user.id, true);
        await interaction.update({
            content: `🌸 *Waguri đã lưu lại phiên học "${session.sessionName}" cho cậu rùi nhen~ Hẹn gặp lại cậu!* ✨`,
            embeds: [],
            components: []
        }).catch(() => {});
    }
    return true;
}

module.exports = {
    activeSessions,
    renderProgressBar,
    formatTime,
    buildStudyEmbed,
    buildControlRow,
    startStudySession,
    finishSession,
    handleStudyButton
};
