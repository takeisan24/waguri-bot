/**
 * Core Engine: Study Companion & Pomodoro Manager
 * Manages active focus sessions, progress bar rendering, and atomic reward completion.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../database');
const { t, getInteractionLanguage } = require('../lib/i18n');

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
function buildControlRow(isPaused = false, locale = 'vi') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(isPaused ? 'study_resume' : 'study_pause')
            .setLabel(t(locale, isPaused ? 'commands.study.btn_resume' : 'commands.study.btn_pause'))
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('study_stop')
            .setLabel(t(locale, 'commands.study.btn_stop'))
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
    const lc = session.locale || 'vi';

    const embed = new EmbedBuilder()
        .setColor(session.isPaused ? '#F59E0B' : '#8B5CF6')
        .setTitle(t(lc, 'commands.study.panel_title', { name: session.sessionName }))
        .setDescription(t(lc, 'commands.study.panel_desc', {
            name: session.sessionName,
            bar: progressBar,
            remain: formattedRemaining,
            total: session.durationMinutes,
            status: t(lc, session.isPaused ? 'commands.study.panel_status_paused' : 'commands.study.panel_status_focus'),
        }))
        .setFooter({ text: t(lc, 'commands.study.panel_footer') })
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
                    .setTitle(t(session.locale || 'vi', 'commands.study.done_title', { name: session.sessionName }))
                    .setDescription(t(session.locale || 'vi', 'commands.study.done_desc', {
                        minutes: session.durationMinutes, coins: result.earnedCoins,
                        exp: result.earnedExp, points: result.studyPoints, streak: result.newStreak,
                    }))
                    .setTimestamp();
            } else {
                // RPC cộng thưởng thất bại -> KHÔNG báo đã nhận thưởng (tránh lừa người dùng).
                finishEmbed = new EmbedBuilder()
                    .setColor('#F59E0B')
                    .setTitle(t(session.locale || 'vi', 'commands.study.done_partial_title', { name: session.sessionName }))
                    .setDescription(t(session.locale || 'vi', 'commands.study.done_partial_desc', {
                        minutes: session.durationMinutes,
                    }))
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
    // Chốt trong RAM chỉ tiết kiệm một vòng gọi DB cho trường hợp hiển nhiên. Nó KHÔNG đủ để
    // chặn trùng: Map này rỗng sau mỗi lần bot restart, và nó không biết gì về phiên mở bên web.
    // Chốt thật nằm ở DB (cửa chung + chỉ mục duy nhất) qua db.startStudySession bên dưới.
    if (activeSessions.has(userId)) {
        return { success: false, reason: 'ALREADY_ACTIVE' };
    }

    const duration = Math.max(15, Math.min(120, durationMinutes || 25));
    const name = sessionName || 'Pomodoro Study';

    // Insert DB session record — cửa chung sẽ từ chối nếu người này đang có phiên ở BẤT KỲ đâu
    // (Discord hay web). Ném ALREADY_ACTIVE để phân biệt với DB hỏng.
    let dbSession;
    try {
        dbSession = await db.startStudySession(userId, guildId, name, duration);
    } catch (e) {
        if (e && e.code === 'ALREADY_ACTIVE') {
            return { success: false, reason: 'ALREADY_ACTIVE' };
        }
        throw e;
    }

    // DB hỏng thật (đã ghi log ở tầng dưới) -> KHÔNG mở phiên chạy chay, vì phiên không có
    // dbSessionId thì tới lúc hết giờ sẽ không cộng được thưởng nào, mà người dùng đã ngồi đủ giờ.
    if (!dbSession) {
        return { success: false, reason: 'DB_ERROR' };
    }

    const dbSessionId = dbSession.id;

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
        message: null,
        locale: await getInteractionLanguage(interaction),
    };

    activeSessions.set(userId, session);

    // Setup timer finish
    scheduleFinishTimer(session, totalMs);

    // Setup interval for progress bar embed updates every 30s
    session.updateInterval = setInterval(async () => {
        // ĐẬP NHỊP TRƯỚC mọi thứ khác, và đập cả khi ĐANG TẠM DỪNG: tạm dừng vẫn là đang giữ
        // phiên. Nếu để lệnh này sau `if (session.isPaused) return` thì ai tạm dừng quá 5 phút
        // sẽ bị cửa vào coi là bỏ hoang và huỷ mất phiên.
        if (session.dbSessionId) {
            await db.beatStudySession(session.dbSessionId, session.userId).catch(() => {});
        }

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
            content: t(await getInteractionLanguage(interaction), 'commands.study.err_no_session'),
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
    }

    if (session.message && message && session.message.id !== message.id) {
        return interaction.reply({
            content: t(session.locale || 'vi', 'commands.study.err_not_yours'),
            flags: MessageFlags.Ephemeral
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
