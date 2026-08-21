// ============================================================
// test/level_announce.test.js — Cầu chì cho lời báo lên cấp ở đường CHAT.
//
// VÌ SAO CẦN: `grantChatReward` từng vứt giá trị trả về của `updateExp`, nên 91/332 người
// đã lên cấp mà chưa từng được bot nói một câu (đo 2026-08-21). Nay đường chat có báo,
// và test này chốt hai hợp đồng đối nghịch nhau:
//   · PHẢI báo khi thật sự lên cấp — nếu không thì ta lại quay về đúng chỗ cũ.
//   · PHẢI im trong mọi trường hợp còn lại — bot nói nhiều giữa cuộc trò chuyện là lý do
//     đủ để admin tắt. Một server 197 người từng tắt AI khi AI hỏng và không ai bật lại.
//
// Chạy thuần, không cần DB: cờ server và i18n đều được thay bằng bản giả qua require.cache.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// --- Thay guildflags + i18n TRƯỚC khi levelAnnounce được nạp -------------------
// levelAnnounce giữ tham chiếu tới hàm ngay lúc require, nên vá sau sẽ không ăn.
const flagsPath = require.resolve('../src/lib/guildflags');
const i18nPath = require.resolve('../src/lib/i18n');

let flagOn = true;
require.cache[flagsPath] = {
    id: flagsPath, filename: flagsPath, loaded: true, exports: {
        levelUpEnabled: async () => flagOn,
        pvpEnabled: async () => true,
        policeJailEnabled: async () => true,
        gamblingEnabled: async () => true,
    },
};
require.cache[i18nPath] = {
    id: i18nPath, filename: i18nPath, loaded: true, exports: {
        // Trả về chính khoá -> khẳng định được ĐÚNG khoá nào được dùng, không phụ thuộc câu chữ.
        t: (_loc, key, vars) => (vars && vars.level !== undefined ? `${key}:${vars.level}` : key),
        getInteractionLanguage: async () => 'vi',
        detectVietnamese: () => undefined,
        getLanguage: l => l,
        invalidateLocaleCache: () => {},
    },
};

const { announceLevelUp, shouldAnnounce, pickAnnounceLevel, ctaKeyFor } = require('../src/lib/levelAnnounce');
const { expForLevel } = require('../src/lib/leveling');

// Message giả tối thiểu — chỉ cần đủ cho đường báo cấp.
function fakeMessage() {
    const sent = [];
    return {
        sent,
        content: 'một tin nhắn đủ dài để được thưởng',
        guildId: 'g1',
        guild: { preferredLocale: 'vi' },
        author: { id: 'u1', username: 'tester' },
        reply: async payload => { sent.push(payload); return payload; },
    };
}

test('shouldAnnounce: báo hết cấp 2-5, sau đó thưa còn mỗi 5 cấp', () => {
    assert.equal(shouldAnnounce(1), false, 'cấp 1 không phải lên cấp');
    for (const L of [2, 3, 4, 5]) assert.equal(shouldAnnounce(L), true, `cấp ${L} phải báo`);
    for (const L of [6, 7, 8, 9, 11, 14]) assert.equal(shouldAnnounce(L), false, `cấp ${L} phải im`);
    for (const L of [10, 15, 20, 30]) assert.equal(shouldAnnounce(L), true, `cấp ${L} phải báo`);
});

test('pickAnnounceLevel: nhảy nhiều cấp chỉ báo MỘT lần, theo cấp mới nhất', () => {
    assert.equal(pickAnnounceLevel(1, 3), 3, 'vượt cả cấp 2 lẫn 3 -> báo cấp mới nhất');
    assert.equal(pickAnnounceLevel(3, 3), null, 'không lên cấp -> im');
    assert.equal(pickAnnounceLevel(5, 4), null, 'cấp lùi (không nên xảy ra) -> im');
});

test('pickAnnounceLevel: nhảy 4->6 vẫn báo, vì đã vượt qua cấp 5', () => {
    // Đây là ca dễ sai nhất: chỉ xét `shouldAnnounce(6)` thì sai, và người ta vượt cấp 5
    // trong im lặng. Phải xét MỌI cấp vừa vượt qua.
    assert.equal(pickAnnounceLevel(4, 6), 6);
    assert.equal(pickAnnounceLevel(6, 8), null, 'không cấp nào trong 7..8 đáng báo -> im');
});

test('ctaKeyFor: mỗi mốc dạy đúng một việc, cấp khác thì không gợi ý gì', () => {
    assert.equal(ctaKeyFor(2), 'common.levelup.cta_daily');
    assert.equal(ctaKeyFor(3), 'common.levelup.cta_profile');
    assert.equal(ctaKeyFor(5), 'common.levelup.cta_work');
    assert.equal(ctaKeyFor(4), null);
    assert.equal(ctaKeyFor(10), null);
});

test('announceLevelUp: có lên cấp -> trả lời, KHÔNG ping ai', async () => {
    flagOn = true;
    const m = fakeMessage();
    // expForLevel(2) = 100. Vừa cộng 5 EXP và chạm đúng mốc -> cấp 1 lên cấp 2.
    await announceLevelUp(m, expForLevel(2), 5);

    assert.equal(m.sent.length, 1, 'phải gửi đúng một lời nhắn');
    const p = m.sent[0];
    assert.match(p.content, /common\.levelup\.text:2/, 'phải dùng chuỗi báo cấp với cấp 2');
    assert.match(p.content, /common\.levelup\.cta_daily/, 'cấp 2 phải kèm gợi ý /daily');
    assert.deepEqual(p.allowedMentions, { parse: [], repliedUser: false },
        'phải chặn MỌI ping — cả ping do trả lời sinh ra');
});

test('announceLevelUp: chưa lên cấp -> im hoàn toàn', async () => {
    flagOn = true;
    const m = fakeMessage();
    await announceLevelUp(m, expForLevel(2) - 10, 5);   // vẫn dưới mốc cấp 2
    assert.equal(m.sent.length, 0);
});

test('announceLevelUp: server tắt cờ -> im, dù có lên cấp thật', async () => {
    flagOn = false;
    const m = fakeMessage();
    await announceLevelUp(m, expForLevel(2), 5);
    assert.equal(m.sent.length, 0);
});

test('announceLevelUp: DB lỗi (newExp = null) -> im, không đoán bừa', async () => {
    flagOn = true;
    const m = fakeMessage();
    await announceLevelUp(m, null, 5);
    await announceLevelUp(m, undefined, 5);
    assert.equal(m.sent.length, 0);
});

test('announceLevelUp: cấp 7 im, cấp 10 báo', async () => {
    flagOn = true;

    const m7 = fakeMessage();
    await announceLevelUp(m7, expForLevel(7), 5);
    assert.equal(m7.sent.length, 0, 'cấp 7 không thuộc mốc đáng báo');

    const m10 = fakeMessage();
    await announceLevelUp(m10, expForLevel(10), 5);
    assert.equal(m10.sent.length, 1, 'cấp 10 là mốc mỗi-5-cấp');
    assert.doesNotMatch(m10.sent[0].content, /cta_/, 'cấp 10 không kèm gợi ý nào');
});

test('chuỗi i18n dùng trong code phải tồn tại thật ở CẢ vi và en', () => {
    // Bản giả `t` ở trên trả về chính khoá, nên test hành vi không phát hiện được khoá chết.
    // Đọc thẳng file ngôn ngữ để bịt chỗ đó.
    const KEYS = ['text', 'cta_daily', 'cta_profile', 'cta_work'];
    for (const loc of ['vi', 'en']) {
        const j = require(path.join('..', 'src', 'locales', `${loc}.json`));
        assert.ok(j.common.levelup, `${loc}: thiếu cả nhánh common.levelup`);
        for (const k of KEYS) {
            assert.equal(typeof j.common.levelup[k], 'string', `${loc}: thiếu common.levelup.${k}`);
        }
        assert.equal(typeof j.commands.config.levelup_success, 'string', `${loc}: thiếu levelup_success`);
        assert.equal(typeof j.commands.config.field_levelup, 'string', `${loc}: thiếu field_levelup`);
    }
    // `{level}` phải còn nguyên trong bản dịch, nếu không thì người đọc không thấy số cấp.
    for (const loc of ['vi', 'en']) {
        const j = require(path.join('..', 'src', 'locales', `${loc}.json`));
        assert.match(j.common.levelup.text, /\{level\}/, `${loc}: chuỗi báo cấp mất chỗ điền {level}`);
    }
});
