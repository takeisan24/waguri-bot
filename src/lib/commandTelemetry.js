// ============================================================
// src/lib/commandTelemetry.js — Hệ Thống Đo Lường Lệnh (Telemetry)
//
// Cơ chế:
// 1. In-Memory Accumulator: ghi nhận đồng bộ tức thì trên hot-path lệnh với độ trễ 0ms,
//    không gây lag bot hay tốn DB query khi user tương tác.
// 2. Đẩy xuống DB theo PHẦN TĂNG THÊM (delta) mỗi 5 phút + khi tắt bot.
// 3. Cổng 2 (tỷ lệ lỗi) và Cổng 3 (lệnh chết 14/30 ngày) đọc từ DB, không từ RAM.
//
// VÌ SAO PHẢI CÓ DB (audit 2026-10-08): bản trước đếm HOÀN TOÀN trong RAM —
// `exportTelemetrySnapshot()` chỉ *trả về* object mà không ai ghi đi đâu, hook SIGTERM chỉ
// gán `lastFlushTime`, và bộ đếm bị `clear()` khi sang ngày. Hệ quả: tỷ lệ lỗi reset mỗi
// lần restart, còn quy tắc "0 lượt trong 14 ngày liên tiếp -> watchlist, 30 ngày -> khai tử"
// trong docs/daily-checklist.md KHÔNG có dữ liệu nào để tính. Đó là phép đo trên giấy.
//
// VÌ SAO GỬI DELTA CHỨ KHÔNG GỬI SỐ TUYỆT ĐỐI: sau restart bộ đếm RAM về 0. Ghi đè số
// tuyệt đối sẽ XOÁ phần đã tích luỹ của chính ngày hôm đó. RPC `ghi_telemetry_lenh` (0154)
// vì thế làm `+=`, và ở đây chỉ gửi phần chưa gửi.
//
// GỬI THẤT BẠI KHÔNG MẤT SỐ: delta chỉ được đánh dấu "đã gửi" sau khi RPC trả về thành
// công. Mạng rớt thì lần flush sau gửi lại đúng phần đó.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

// `${ngày}\u0000${lệnh}` -> bộ đếm của riêng (ngày, lệnh) đó.
// KHÔNG xoá theo ngày nữa: giữ cả ngày cũ cho tới khi flush xong mới dọn, nếu không thì
// lượt gọi lúc 23:59 bị mất trắng khi đồng hồ nhảy sang ngày mới trước lần flush kế tiếp.
const commandStats = new Map();
let currentTrackingDate = getCurrentDateStr();
let trackingStartTime = Date.now();
let lastFlushTime = Date.now();
let dangFlush = false;
let flushTimer = null;

const FLUSH_MS = 5 * 60 * 1000;
const GIU_NGAY = 180; // số ngày giữ trong DB (don_telemetry_lenh)

function getCurrentDateStr() {
    // Giờ Việt Nam UTC+7
    const now = new Date(Date.now() + 7 * 3600 * 1000);
    return now.toISOString().slice(0, 10);
}

const khoa = (day, command) => `${day}\u0000${command}`;

function layO(day, command) {
    const k = khoa(day, command);
    let e = commandStats.get(k);
    if (!e) {
        e = {
            day, command,
            total: 0, success: 0, error: 0,
            users: new Set(),        // toàn bộ user thấy trong tiến trình này (để hiển thị)
            usersPending: new Set(),  // user CHƯA gửi xuống DB
            sentTotal: 0, sentError: 0,
        };
        commandStats.set(k, e);
    }
    return e;
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
    return Array.from(new Set(Array.from(commandStats.values()).map(e => e.command)));
}

/**
 * Ghi nhận một lượt thực thi lệnh (0ms non-blocking)
 * @param {string} commandName Tên lệnh slash
 * @param {string} userId ID Discord người dùng
 * @param {boolean} success Trạng thái thành công hay lỗi
 */
function recordCommand(commandName, userId, success = true) {
    if (!commandName) return;

    const today = getCurrentDateStr();
    if (today !== currentTrackingDate) {
        // Sang ngày mới: chỉ đổi mốc theo dõi. Bộ đếm ngày cũ ĐƯỢC GIỮ để flush, khác bản
        // trước (clear() ngay) — nếu xoá ở đây thì mọi lượt gọi chưa flush của ngày cũ bay mất.
        currentTrackingDate = today;
        trackingStartTime = Date.now();
    }

    const e = layO(today, commandName);
    e.total++;
    if (success) e.success++;
    else e.error++;

    if (userId) {
        const u = String(userId);
        e.users.add(u);
        e.usersPending.add(u);
    }
}

/** Dọn bộ đếm của ngày CŨ đã gửi xong, để Map không phình theo thời gian chạy. */
function donBoDemCu() {
    const today = getCurrentDateStr();
    for (const [k, e] of commandStats) {
        if (e.day === today) continue;
        if (e.total === e.sentTotal && e.error === e.sentError && e.usersPending.size === 0) {
            commandStats.delete(k);
        }
    }
}

/**
 * Đẩy phần chưa gửi xuống DB. An toàn khi gọi trùng (có cờ chống chồng lệnh).
 * @returns {Promise<{rows:number, error?:boolean, skipped?:boolean}>}
 */
async function flushTelemetry() {
    if (dangFlush) return { rows: 0, skipped: true };

    const rows = [];
    for (const e of commandStats.values()) {
        const dCalls = e.total - e.sentTotal;
        const dErrors = e.error - e.sentError;
        if (dCalls <= 0 && dErrors <= 0 && e.usersPending.size === 0) continue;
        rows.push({
            day: e.day,
            command: e.command,
            calls: Math.max(dCalls, 0),
            errors: Math.max(dErrors, 0),
            users: Array.from(e.usersPending),
        });
    }
    if (!rows.length) {
        // Bot rảnh thì KHÔNG gọi DB lần nào — quan trọng với Supabase free tier.
        return { rows: 0 };
    }

    dangFlush = true;
    try {
        const db = require('../database.js');
        const ok = await db.ghiTelemetryLenh(rows);
        if (!ok) return { rows: 0, error: true }; // giữ nguyên delta -> lần sau gửi lại

        // Chỉ trừ ĐÚNG phần vừa gửi. Lượt gọi phát sinh trong lúc chờ RPC vẫn còn nguyên
        // trong delta và sẽ đi ở lần flush kế tiếp.
        for (const r of rows) {
            const e = commandStats.get(khoa(r.day, r.command));
            if (!e) continue;
            e.sentTotal += r.calls;
            e.sentError += r.errors;
            for (const u of r.users) e.usersPending.delete(u);
        }
        lastFlushTime = Date.now();
        donBoDemCu();
        return { rows: rows.length };
    } catch (e) {
        console.warn('[TELEMETRY] Flush failed, keeping counters for retry:', e?.message || e);
        return { rows: 0, error: true };
    } finally {
        dangFlush = false;
    }
}

/** Bật vòng flush định kỳ. Gọi một lần lúc bot ready. */
function startTelemetryFlush(intervalMs = FLUSH_MS) {
    if (flushTimer) return flushTimer;
    flushTimer = setInterval(() => {
        flushTelemetry().catch(() => {});
    }, intervalMs);
    flushTimer.unref(); // không giữ event-loop khi tắt bot
    return flushTimer;
}

/**
 * Lấy báo cáo thống kê sử dụng lệnh trong ngày (RAM — chỉ tính từ lúc tiến trình này chạy).
 * Dùng cho các chỉ số tức thì; Cổng 2/3 phải dùng getWindowStats() để không mất số sau restart.
 */
function getDailyStats() {
    const allRegistered = getAllRegisteredCommands();
    const today = getCurrentDateStr();
    const commandList = [];
    let totalCalls = 0;
    let totalErrors = 0;
    const globalUsers = new Set();

    for (const e of commandStats.values()) {
        if (e.day !== today) continue;
        totalCalls += e.total;
        totalErrors += e.error;
        for (const u of e.users) globalUsers.add(u);
        commandList.push({
            name: e.command,
            total: e.total,
            success: e.success,
            error: e.error,
            uniqueUsers: e.users.size
        });
    }

    commandList.sort((a, b) => b.total - a.total);

    const coLuot = new Set(commandList.filter(c => c.total > 0).map(c => c.name));
    const deadCommands = allRegistered.filter(cmd => !coLuot.has(cmd));
    const errorRate = totalCalls > 0 ? (totalErrors / totalCalls) : 0;

    return {
        date: today,
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
 * Thống kê theo cửa sổ N ngày, ĐỌC TỪ DB (sống sót qua restart).
 * @param {number} days số ngày tính cả hôm nay (1 = hôm nay)
 * @returns {Promise<null|{days:number,totalCalls:number,totalErrors:number,errorRate:number,
 *   uniqueUsers:number,commands:Array<{name:string,calls:number,errors:number,users:number}>}>}
 *   null nghĩa là KHÔNG đọc được DB — người gọi phải nói "chưa đo được", đừng hiểu là 0.
 */
async function getWindowStats(days = 1) {
    const db = require('../database.js');
    const data = await db.telemetryLenhCuaSo(days);
    if (!data) return null;

    const commands = Array.isArray(data.commands) ? data.commands.map(c => ({
        name: String(c.name),
        calls: Number(c.calls || 0),
        errors: Number(c.errors || 0),
        users: Number(c.users || 0),
    })) : [];
    const totalCalls = Number(data.total_calls || 0);
    const totalErrors = Number(data.total_errors || 0);

    return {
        days: Number(data.days || days),
        fromDay: data.from_day || null,
        ngayBatDau: data.ngay_bat_dau || null, // ngày sớm nhất CÓ dữ liệu; null = bảng trống
        totalCalls,
        totalErrors,
        errorRate: totalCalls > 0 ? totalErrors / totalCalls : 0,
        uniqueUsers: Number(data.unique_users || 0),
        commands,
    };
}

/** Số ngày lịch sử telemetry đã tích luỹ (tính cả hôm nay). 0 = chưa có dòng nào. */
function soNgayLichSu(ngayBatDau) {
    if (!ngayBatDau) return 0;
    const batDau = Date.parse(`${String(ngayBatDau).slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(batDau)) return 0;
    const homNay = Date.parse(`${getCurrentDateStr()}T00:00:00Z`);
    return Math.max(Math.round((homNay - batDau) / 86400000) + 1, 1);
}

/**
 * Danh sách khai tử theo đúng quy tắc docs/daily-checklist.md Cổng 3:
 *   · 0 lượt trong 14 ngày liên tiếp  -> watchlist
 *   · 0 lượt trong 30 ngày liên tiếp  -> đề nghị dời sang archive/commands/
 * Cộng CẢ số trong RAM của hôm nay để lượt gọi vừa xảy ra (chưa flush) không bị tính là chết.
 * @returns {Promise<null|{watchlist:string[], khaiTu:string[], song:number, tongLenh:number}>}
 */
async function getDeadWatchlist() {
    const w30 = await getWindowStats(30);
    if (!w30) return null;
    const w14 = await getWindowStats(14);
    if (!w14) return null;

    // CHỐT CHẶN DƯƠNG TÍNH GIẢ: telemetry DB bắt đầu từ 2026-10-08 (migration 0154). Trước
    // khi đủ 14/30 ngày lịch sử thì "0 lượt trong 14 ngày" chỉ nghĩa là CHƯA ĐO ĐỦ, không
    // phải lệnh chết — phán lúc đó sẽ đề nghị khai tử gần hết 73 lệnh.
    const ngayCo = soNgayLichSu(w30.ngayBatDau);

    const ram = new Set(getDailyStats().rawStats.filter(c => c.total > 0).map(c => c.name));
    const coTrong = (w) => {
        const s = new Set(w.commands.filter(c => c.calls > 0).map(c => c.name));
        for (const n of ram) s.add(n);
        return s;
    };
    const song14 = coTrong(w14);
    const song30 = coTrong(w30);

    const dangKy = getAllRegisteredCommands();
    return {
        ngayCo,
        duLieu14: ngayCo >= 14,
        duLieu30: ngayCo >= 30,
        watchlist: ngayCo >= 14 ? dangKy.filter(c => !song14.has(c) && song30.has(c)) : [],
        khaiTu: ngayCo >= 30 ? dangKy.filter(c => !song30.has(c)) : [],
        song: dangKy.filter(c => song14.has(c)).length,
        tongLenh: dangKy.length,
    };
}

/**
 * Xuất dữ liệu JSON để lưu trữ hoặc đồng bộ
 */
function exportTelemetrySnapshot() {
    const stats = getDailyStats();
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

// Hook sự kiện thoát tiến trình: flush nốt phần còn lại. Best-effort — tiến trình có thể
// bị kill trước khi RPC xong, nên vòng 5 phút ở trên mới là thứ chặn mất mát (tối đa 5 phút).
let dangTat = false;
function flushKhiTat(sig) {
    if (dangTat) return;
    dangTat = true;
    console.log(`[TELEMETRY] Received ${sig}, flushing remaining telemetry to DB...`);
    flushTelemetry()
        .then(r => console.log(`[TELEMETRY] Flushed ${r.rows} row(s) before shutdown.`))
        .catch(() => {});
}
process.on('SIGTERM', () => flushKhiTat('SIGTERM'));
process.on('SIGINT', () => flushKhiTat('SIGINT'));

module.exports = {
    recordCommand,
    getDailyStats,
    exportTelemetrySnapshot,
    getAllRegisteredCommands,
    flushTelemetry,
    startTelemetryFlush,
    getWindowStats,
    getDeadWatchlist,
    GIU_NGAY,
};
