const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { recordCommand, getDailyStats, exportTelemetrySnapshot, getAllRegisteredCommands } = require('../src/lib/commandTelemetry');

describe('📊 Command Telemetry Unit Tests', () => {
    it('1. Ghi nhận lượt gọi lệnh thành công và lỗi chính xác', () => {
        const testCmd = 'test_ping_' + Date.now();
        recordCommand(testCmd, 'user_1', true);
        recordCommand(testCmd, 'user_2', true);
        recordCommand(testCmd, 'user_1', false);

        const stats = getDailyStats();
        const found = stats.rawStats.find(c => c.name === testCmd);

        assert.ok(found, 'Phải tìm thấy lệnh vừa ghi nhận');
        assert.equal(found.total, 3, 'Tổng số lượt gọi phải là 3');
        assert.equal(found.success, 2, 'Số lượt thành công phải là 2');
        assert.equal(found.error, 1, 'Số lượt lỗi phải là 1');
        assert.equal(found.uniqueUsers, 2, 'Số người dùng duy nhất phải là 2');
    });

    it('2. getDailyStats phải tính đúng tỷ lệ lỗi (errorRate) và sắp xếp top lệnh', () => {
        const stats = getDailyStats();
        assert.ok(typeof stats.errorRate === 'number', 'errorRate phải là số');
        assert.ok(stats.errorRate >= 0 && stats.errorRate <= 1, 'errorRate phải nằm trong khoảng [0, 1]');
        assert.ok(Array.isArray(stats.topCommands), 'topCommands phải là mảng');
        assert.ok(Array.isArray(stats.deadCommands), 'deadCommands phải là mảng');
        assert.ok(stats.totalRegisteredCommands >= 70, 'Tổng số lệnh đăng ký phải >= 70');
    });

    it('3. exportTelemetrySnapshot phải trả về đối tượng JSON hợp lệ', () => {
        const snap = exportTelemetrySnapshot();
        assert.ok(snap.date, 'Snapshot phải có trường date');
        assert.ok(snap.taken_at, 'Snapshot phải có trường taken_at');
        assert.ok(typeof snap.total_calls === 'number', 'total_calls phải là số');
        assert.ok(typeof snap.error_rate === 'number', 'error_rate phải là số');
        assert.ok(Array.isArray(snap.top_commands), 'top_commands phải là mảng');
    });

    it('4. getAllRegisteredCommands phải đọc danh sách từ command-surface.json', () => {
        const cmds = getAllRegisteredCommands();
        assert.ok(cmds.length >= 70, 'Phải đọc được ít nhất 70 lệnh');
        assert.ok(cmds.includes('daily'), 'Phải chứa lệnh daily');
        assert.ok(cmds.includes('farm'), 'Phải chứa lệnh farm');
        assert.ok(cmds.includes('bakery'), 'Phải chứa lệnh bakery');
        assert.ok(cmds.includes('loan'), 'Phải chứa lệnh loan');
    });
});
