const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/database');
const {
    renderProgressBar,
    formatTime,
    startStudySession,
    finishSession,
    handleStudyButton,
    activeSessions
} = require('../src/lib/study');

// GIẢ LẬP TẦNG DB.
//
// Ba test vòng đời bên dưới trước đây chạy KHÔNG có giả lập, và chúng xanh chỉ vì lệnh ghi DB
// âm thầm hỏng (test không có credentials) rồi `startStudySession` vẫn mở phiên với
// dbSessionId = null. Tức chúng xanh nhờ đúng cái lỗi mà repo này ghét nhất: hỏng mà im lặng.
//
// Nay `startStudySession` fail-closed — DB hỏng thì KHÔNG mở phiên, vì mở ra thì người dùng
// ngồi đủ 25 phút rồi mới biết không có thưởng. Nên phải giả lập tường minh ở đây.
let idGia = 0;
const phienGia = new Map();          // sessionId -> userId, để giả lập chốt "một phiên một người"
db.startStudySession = async (userId) => {
    for (const chu of phienGia.values()) {
        if (chu === userId) {
            const e = new Error('ALREADY_ACTIVE');
            e.code = 'ALREADY_ACTIVE';
            throw e;
        }
    }
    const id = ++idGia;
    phienGia.set(id, userId);
    return { id, ends_at: new Date(Date.now() + 60_000).toISOString() };
};
db.beatStudySession = async () => true;
db.cancelStudySession = async (id) => { phienGia.delete(id); return { id }; };
db.completeStudySession = async (id, userId, coins, exp, points) => {
    phienGia.delete(id);
    return { success: true, new_streak: 1, earned_coins: Number(coins), earned_exp: Number(exp), study_points: points };
};

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

test('DB hỏng thì KHÔNG mở phiên, và không nói dối là đang có phiên khác', async () => {
    const userId = 'test_user_study_db_hong';
    activeSessions.delete(userId);

    const that = db.startStudySession;
    db.startStudySession = async () => null;   // tầng dưới đã ghi log rồi trả null
    try {
        const res = await startStudySession(userId, 'guild_1', 'DB chết', 25);
        assert.equal(res.success, false);
        assert.equal(res.reason, 'DB_ERROR',
            'DB hỏng phải ra DB_ERROR chứ không phải ALREADY_ACTIVE — gộp hai chuyện này lại thì '
            + 'người dùng đi tìm một phiên không hề tồn tại.');
        assert.equal(activeSessions.has(userId), false,
            'Không được mở phiên chạy chay khi DB hỏng: người đó sẽ ngồi đủ 25 phút rồi mới biết '
            + 'chẳng có thưởng nào được ghi.');
    } finally {
        db.startStudySession = that;
    }
});

test('phiên mở từ cửa khác (web) cũng chặn được /study start', async () => {
    const userId = 'test_user_study_hai_cua';
    activeSessions.delete(userId);

    const that = db.startStudySession;
    // Cửa chung phía DB từ chối vì người này đang có phiên bên web — Map RAM của bot rỗng.
    db.startStudySession = async () => {
        const e = new Error('ALREADY_ACTIVE');
        e.code = 'ALREADY_ACTIVE';
        throw e;
    };
    try {
        assert.equal(activeSessions.has(userId), false, 'Map RAM phải rỗng — đây chính là điểm mù cũ.');
        const res = await startStudySession(userId, 'guild_1', 'Mở từ Discord', 25);
        assert.equal(res.success, false);
        assert.equal(res.reason, 'ALREADY_ACTIVE');
    } finally {
        db.startStudySession = that;
    }
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
