const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
    getVietnamTime,
    getCurrentMood,
    buildReminderPayload,
    recordGuildActivity,
    isGuildActive
} = require('../src/lib/companionReminder');

describe('Waguri Companion Reminders', () => {
    test('getVietnamTime trả về định dạng thời gian UTC+7 chính xác', () => {
        // 2026-09-22 13:30 UTC -> 2026-09-22 20:30 VN
        const utcDate = new Date(Date.UTC(2026, 8, 22, 13, 30, 0));
        const vn = getVietnamTime(utcDate);
        assert.strictEqual(vn.hours, 20);
        assert.strictEqual(vn.minutes, 30);
        assert.strictEqual(vn.dateStr, '2026-09-22');
        assert.strictEqual(vn.dayOfWeek, 2); // Tuesday (Thứ Ba)
    });

    test('getCurrentMood nhận diện chính xác 4 khung giờ và mood', () => {
        // 1. Thứ 2 (day 1) - 20:30 VN -> study
        const t2Utc = new Date(Date.UTC(2026, 8, 21, 13, 30, 0));
        const moodT2 = getCurrentMood(t2Utc);
        assert.ok(moodT2);
        assert.strictEqual(moodT2.mood, 'study');

        // 2. Thứ 3 (day 2) - 11:45 VN -> bakery
        const t3Utc = new Date(Date.UTC(2026, 8, 22, 4, 45, 0));
        const moodT3 = getCurrentMood(t3Utc);
        assert.ok(moodT3);
        assert.strictEqual(moodT3.mood, 'bakery');

        // 3. Thứ 6 (day 5) - 20:30 VN -> weekend
        const t6Utc = new Date(Date.UTC(2026, 8, 25, 13, 30, 0));
        const moodT6 = getCurrentMood(t6Utc);
        assert.ok(moodT6);
        assert.strictEqual(moodT6.mood, 'weekend');

        // 4. Chủ Nhật (day 0) - 22:30 VN -> sleep
        const cnUtc = new Date(Date.UTC(2026, 8, 27, 15, 30, 0));
        const moodCn = getCurrentMood(cnUtc);
        assert.ok(moodCn);
        assert.strictEqual(moodCn.mood, 'sleep');

        // 5. Khung giờ không khớp -> null
        const otherUtc = new Date(Date.UTC(2026, 8, 21, 8, 0, 0)); // 15:00 VN
        assert.strictEqual(getCurrentMood(otherUtc), null);
    });

    test('buildReminderPayload dựng đầy đủ embed và button cho tất cả 4 moods', () => {
        const moods = ['study', 'bakery', 'weekend', 'sleep'];
        for (const mood of moods) {
            const payloadWarm = buildReminderPayload(mood, 'warm', 'vi');
            assert.strictEqual(payloadWarm.embeds.length, 1);
            assert.strictEqual(payloadWarm.components.length, 1);
            assert.ok(payloadWarm.embeds[0].data.title.length > 0);
            assert.ok(payloadWarm.embeds[0].data.description.length > 0);
            assert.ok(payloadWarm.components[0].components.length >= 2);

            const payloadEnergeticEn = buildReminderPayload(mood, 'energetic', 'en');
            assert.strictEqual(payloadEnergeticEn.embeds.length, 1);
            assert.strictEqual(payloadEnergeticEn.components.length, 1);
            assert.ok(payloadEnergeticEn.embeds[0].data.title.length > 0);
        }
    });

    test('isGuildActive phát hiện chính xác guild hoạt động và guild vắng lặng', () => {
        const guildId = 'test_guild_active_123';
        recordGuildActivity(guildId);
        assert.strictEqual(isGuildActive(guildId, 6), true);

        // Guild chưa từng hoạt động hoặc quá 6 tiếng
        const deadGuildId = 'dead_guild_999';
        const { _guildActivityMap } = require('../src/lib/companionReminder');
        _guildActivityMap.set(deadGuildId, Date.now() - 7 * 3600 * 1000); // 7 tiếng trước
        assert.strictEqual(isGuildActive(deadGuildId, 6), false);
    });
});
