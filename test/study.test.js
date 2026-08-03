const test = require('node:test');
const assert = require('node:assert/strict');
const {
    renderProgressBar,
    formatTime,
    startStudySession,
    finishSession,
    handleStudyButton,
    activeSessions
} = require('../src/lib/study');

test('renderProgressBar correct percentages', () => {
    assert.equal(renderProgressBar(0, 10), '[░░░░░░░░░░] 0%');
    assert.equal(renderProgressBar(50, 10), '[▓▓▓▓▓░░░░░] 50%');
    assert.equal(renderProgressBar(100, 10), '[▓▓▓▓▓▓▓▓▓▓] 100%');
});

test('formatTime mm:ss formatting', () => {
    assert.equal(formatTime(0), '00:00');
    assert.equal(formatTime(60_000), '01:00');
    assert.equal(formatTime(25 * 60 * 1000), '25:00');
});

test('startStudySession creates session and blocks duplicate', async () => {
    const userId = 'test_user_study_1';
    activeSessions.delete(userId);

    const res = await startStudySession(userId, 'guild_1', 'Ôn thi Toán', 25);
    assert.equal(res.success, true);
    assert.equal(res.session.durationMinutes, 25);
    assert.equal(res.session.sessionName, 'Ôn thi Toán');
    assert.equal(activeSessions.has(userId), true);

    const dupRes = await startStudySession(userId, 'guild_1', 'Code Web', 30);
    assert.equal(dupRes.success, false);
    assert.equal(dupRes.reason, 'ALREADY_ACTIVE');

    // Clean up
    await finishSession(userId, true);
    assert.equal(activeSessions.has(userId), false);
});

test('handleStudyButton pause and resume timer behavior', async () => {
    const userId = 'test_user_study_2';
    activeSessions.delete(userId);

    const res = await startStudySession(userId, 'guild_1', 'Test Pause Resume', 25);
    const session = res.session;
    session.message = { id: 'msg_100', edit: async () => {} };

    let replyPayload = null;
    let updatePayload = null;

    const mockInteraction = (customId, msgId = 'msg_100') => ({
        customId,
        user: { id: userId },
        message: { id: msgId },
        reply: async (data) => { replyPayload = data; },
        update: async (data) => { updatePayload = data; },
        deferUpdate: async () => {}
    });

    // 1. Pause session
    await handleStudyButton(mockInteraction('study_pause'));
    assert.equal(session.isPaused, true);
    assert.equal(session.timer, null); // Timer must be cleared on pause

    // 2. Button on different message (ownership check)
    replyPayload = null;
    await handleStudyButton(mockInteraction('study_resume', 'msg_other_user'));
    assert.ok(replyPayload);
    assert.match(replyPayload.content, /không phải góc học tập/);

    // 3. Resume session with correct message owner
    await handleStudyButton(mockInteraction('study_resume'));
    assert.equal(session.isPaused, false);
    assert.notEqual(session.timer, null); // Timer must be rescheduled

    // Clean up
    await finishSession(userId, true);
});

test('finishSession calculates correct rewards on completion', async () => {
    const userId = 'test_user_study_3';
    activeSessions.delete(userId);

    await startStudySession(userId, 'guild_1', 'Completed Session', 50);
    const result = await finishSession(userId, false);

    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.earnedCoins, 2500n); // 50 * 50
    assert.equal(result.earnedExp, 1000n);   // 50 * 20
    assert.equal(result.studyPoints, 10);    // Math.floor(50 / 5)
    assert.equal(activeSessions.has(userId), false);
});
