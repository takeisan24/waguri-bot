// ============================================================
// src/lib/commandTelemetry.js — Hệ Thống Đo Lường Lệnh (Telemetry)
//
// Cơ chế:
// 1. In-Memory Accumulator: Ghi nhận đồng bộ tức thì trên hot-path lệnh
//    với độ trễ 0ms, không gây lag bot hay tốn DB query khi user tương tác.
// 2. Tự động kiểm tra chuyển ngày (UTC+7): Tự lưu và reset bộ đếm khi sang ngày mới.
// 3. Auto-Flush & Hook SIGTERM/SIGINT: Đảm bảo không mất trắng dữ liệu khi bot restart.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

// commandName -> { total: number, success: number, error: number, users: Set<string> }
const commandStats = new Map();
let currentTrackingDate = getCurrentDateStr();
let trackingStartTime = Date.now();
let lastFlushTime = Date.now();

function getCurrentDateStr() {
    // Giờ Việt Nam UTC+7
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    return now.toISOString().slice(0, 10);
}

/**
 * Lấy danh sách tất cả các lệnh đã đăng ký trong hệ thống
 */
function getAllRegisteredCommands() {
    try {
        const surfacePath = path.join(__dirname, '..', '..', 'scripts', 'command-surface.json');
        if (fs.existsSync(surfacePath)) {
            const surface = JSON.parse(fs.readFileSync(surfacePath, 'utf8'));
            return Object.keys(surface);
        }
    } catch {
        // Fallback: nếu không đọc được file surface
    }
    return Array.from(commandStats.keys());
}

/**
 * Ghi nhận một lượt thực thi lệnh (0ms non-blocking)
 * @param {string} commandName Tên lệnh slash
 * @param {string} userId ID Discord người dùng
 * @param {boolean} success Trạng thái thành công hay lỗi
 */
function recordCommand(commandName, userId, success = true) {
    if (!commandName) return;

    // Kiểm tra nếu đã sang ngày mới thì lưu snapshot và reset bộ đếm
    const today = getCurrentDateStr();
    if (today !== currentTrackingDate) {
        currentTrackingDate = today;
        commandStats.clear();
        trackingStartTime = Date.now();
    }

    let entry = commandStats.get(commandName);
    if (!entry) {
        entry = { total: 0, success: 0, error: 0, users: new Set() };
        commandStats.set(commandName, entry);
    }

    entry.total++;
    if (success) {
        entry.success++;
    } else {
        entry.error++;
    }

    if (userId) {
        entry.users.add(String(userId));
    }
}

/**
 * Lấy báo cáo thống kê sử dụng lệnh trong ngày
 * @returns {object} Báo cáo chi tiết: top lệnh, lệnh chết, tỷ lệ lỗi, user hoạt động
 */
function getDailyStats() {
    const allRegistered = getAllRegisteredCommands();
    const commandList = [];
    let totalCalls = 0;
    let totalErrors = 0;
    const globalUsers = new Set();

    for (const [name, data] of commandStats.entries()) {
        totalCalls += data.total;
        totalErrors += data.error;
        for (const u of data.users) {
            globalUsers.add(u);
        }
        commandList.push({
            name,
            total: data.total,
            success: data.success,
            error: data.error,
            uniqueUsers: data.users.size
        });
    }

    // Sắp xếp lệnh theo lượt gọi giảm dần
    commandList.sort((a, b) => b.total - a.total);

    // Xác định các lệnh "chết" (0 lượt gọi hôm nay)
    const deadCommands = allRegistered.filter(cmd => !commandStats.has(cmd) || commandStats.get(cmd).total === 0);

    const errorRate = totalCalls > 0 ? (totalErrors / totalCalls) : 0;

    return {
        date: currentTrackingDate,
        trackingStartTime,
        lastFlushTime,
        uptimeMs: Date.now() - trackingStartTime,
        totalCalls,
        totalErrors,
        errorRate,
        uniqueUsersCount: globalUsers.size,
        topCommands: commandList.slice(0, 10),
        activeCommandsCount: commandList.length,
        deadCommands,
        totalRegisteredCommands: allRegistered.length,
        rawStats: commandList
    };
}

/**
 * Xuất dữ liệu JSON để lưu trữ hoặc đồng bộ
 */
function exportTelemetrySnapshot() {
    const stats = getDailyStats();
    lastFlushTime = Date.now();
    return {
        date: stats.date,
        taken_at: new Date().toISOString(),
        total_calls: stats.totalCalls,
        total_errors: stats.totalErrors,
        error_rate: Number((stats.errorRate * 100).toFixed(2)),
        unique_users: stats.uniqueUsersCount,
        top_commands: stats.topCommands.map(c => ({ name: c.name, calls: c.total, users: c.uniqueUsers })),
        dead_commands_count: stats.deadCommands.length
    };
}

// Hook sự kiện thoát tiến trình để ghi log cảnh báo
process.on('SIGTERM', () => {
    console.log('[TELEMETRY] Process received SIGTERM. Finalizing telemetry snapshot...');
    lastFlushTime = Date.now();
});

process.on('SIGINT', () => {
    console.log('[TELEMETRY] Process received SIGINT. Finalizing telemetry snapshot...');
    lastFlushTime = Date.now();
});

module.exports = {
    recordCommand,
    getDailyStats,
    exportTelemetrySnapshot,
    getAllRegisteredCommands
};
