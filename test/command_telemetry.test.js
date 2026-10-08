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

    it('5. Cổng 4 Daily Checklist: Tính đúng Faucet và Sink từ bom_vao & hut_ra của ledger_flow', () => {
        const mockLedgerFlow = [
            { source: 'claim_daily', bom_vao: 8400, hut_ra: 0, rong: 8400, so_lan: 6 },
            { source: 'thue_tai_san', bom_vao: 0, hut_ra: 2511, rong: -2511, so_lan: 6 },
            { source: 'baucua', bom_vao: 2000, hut_ra: 1000, rong: 1000, so_lan: 2 }
        ];

        let totalFaucet = 0;
        let totalSink = 0;
        for (const row of mockLedgerFlow) {
            totalFaucet += Number(row.bom_vao || 0);
            totalSink += Number(row.hut_ra || 0);
        }

        assert.equal(totalFaucet, 10400, 'totalFaucet phải tính đúng tổng bom_vao');
        assert.equal(totalSink, 3511, 'totalSink phải tính đúng tổng hut_ra');
        assert.ok(!('tong_xu' in mockLedgerFlow[0]), 'ledger_flow không có trường tong_xu');
    });
});

// ============================================================
// Phần đẩy xuống DB (migration 0154/0155). Trước 08/10/2026 telemetry nằm HOÀN TOÀN trong
// RAM: tỷ lệ lỗi reset mỗi lần restart và quy tắc "0 lượt / 14-30 ngày" của Cổng 3 không có
// dữ liệu nào để tính. Các test dưới đây khoá đúng những chỗ dễ vỡ của cơ chế delta.
// ============================================================
describe('📊 Command Telemetry — đẩy xuống DB', () => {
    const duongDanDb = require.resolve('../src/database.js');
    const T = require('../src/lib/commandTelemetry');

    // Chặn không cho nạp database.js thật (sẽ đòi nối Supabase). node --test chạy mỗi file
    // trong một tiến trình riêng nên require.cache ở đây không ảnh hưởng file test khác.
    function gaDb({ ghiOk = true, cuaSo = null } = {}) {
        const log = { lanGoi: 0, payloads: [] };
        require.cache[duongDanDb] = {
            id: duongDanDb, filename: duongDanDb, loaded: true, children: [], paths: [],
            exports: {
                ghiTelemetryLenh: async (rows) => {
                    log.lanGoi++;
                    log.payloads.push(JSON.parse(JSON.stringify(rows)));
                    return ghiOk;
                },
                telemetryLenhCuaSo: async () => cuaSo,
            },
        };
        return log;
    }

    it('6. flushTelemetry gửi phần tăng thêm, và KHÔNG gửi lại phần đã gửi', async () => {
        const cmd = 'zz_delta_' + Date.now();
        recordCommand(cmd, 'uA', true);
        recordCommand(cmd, 'uB', true);
        recordCommand(cmd, 'uA', false);

        let log = gaDb();
        const r1 = await T.flushTelemetry();
        assert.ok(r1.rows >= 1, 'Lần flush đầu phải gửi ít nhất 1 dòng');
        const d1 = log.payloads[0].find(x => x.command === cmd);
        assert.ok(d1, 'Payload phải chứa lệnh vừa ghi');
        assert.equal(d1.calls, 3, 'Gửi đúng 3 lượt');
        assert.equal(d1.errors, 1, 'Gửi đúng 1 lỗi');
        assert.deepEqual(d1.users.sort(), ['uA', 'uB'], 'Gửi đúng danh sách user chưa gửi');

        log = gaDb();
        await T.flushTelemetry();
        const d2 = (log.payloads[0] || []).find(x => x.command === cmd);
        assert.equal(d2, undefined, 'Lần flush thứ hai KHÔNG được gửi lại lệnh đó (chống đếm trùng)');

        recordCommand(cmd, 'uC', true);
        log = gaDb();
        await T.flushTelemetry();
        const d3 = log.payloads[0].find(x => x.command === cmd);
        assert.equal(d3.calls, 1, 'Chỉ gửi phần tăng thêm (1 lượt), không gửi lại tổng');
        assert.deepEqual(d3.users, ['uC'], 'Chỉ gửi user mới');
    });

    it('7. Gửi thất bại thì GIỮ nguyên số để lần sau gửi lại (không mất lượt gọi)', async () => {
        const cmd = 'zz_fail_' + Date.now();
        recordCommand(cmd, 'uX', true);
        recordCommand(cmd, 'uX', false);

        let log = gaDb({ ghiOk: false });
        const r = await T.flushTelemetry();
        assert.equal(r.error, true, 'Phải báo lỗi khi RPC trả về thất bại');

        log = gaDb({ ghiOk: true });
        await T.flushTelemetry();
        const d = log.payloads[0].find(x => x.command === cmd);
        assert.ok(d, 'Lần sau phải gửi lại đúng lệnh đã thất bại');
        assert.equal(d.calls, 2, 'Gửi lại đủ 2 lượt, không mất');
        assert.equal(d.errors, 1, 'Gửi lại đủ 1 lỗi');
        assert.deepEqual(d.users, ['uX'], 'User chưa gửi vẫn còn trong hàng chờ');
    });

    it('8. Không có gì để gửi thì KHÔNG gọi DB lần nào (bot rảnh = 0 request)', async () => {
        const log = gaDb();
        await T.flushTelemetry();           // dọn hết phần còn treo
        const sauKhiDon = log.lanGoi;
        await T.flushTelemetry();           // lần này không còn delta
        assert.equal(log.lanGoi, sauKhiDon, 'Lần flush không có delta phải không gọi DB');
    });

    it('9. Sang ngày mới KHÔNG xoá bộ đếm của ngày cũ chưa gửi', async () => {
        const cmd = 'zz_ngay_' + Date.now();
        recordCommand(cmd, 'uHomNay', true);

        const goc = Date.now;
        try {
            Date.now = () => goc() + 24 * 3600 * 1000;   // nhảy sang ngày mai
            recordCommand(cmd, 'uNgayMai', true);
        } finally {
            Date.now = goc;
        }

        const log = gaDb();
        await T.flushTelemetry();
        const dong = log.payloads[0].filter(x => x.command === cmd);
        assert.equal(dong.length, 2, 'Phải gửi 2 dòng cho 2 ngày khác nhau');
        const ngay = dong.map(x => x.day).sort();
        assert.notEqual(ngay[0], ngay[1], 'Hai dòng phải mang hai mốc ngày khác nhau');
        assert.ok(dong.every(x => x.calls === 1), 'Mỗi ngày đúng 1 lượt — không dồn vào một ngày');
    });

    it('10. getDeadWatchlist KHÔNG phán lệnh chết khi lịch sử chưa đủ 14/30 ngày', async () => {
        const homNay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
        gaDb({ cuaSo: { days: 30, from_day: homNay, ngay_bat_dau: homNay, total_calls: 5, total_errors: 0, unique_users: 1, commands: [{ name: 'daily', calls: 5, errors: 0, users: 1 }] } });

        const w = await T.getDeadWatchlist();
        assert.ok(w, 'Phải đọc được watchlist');
        assert.equal(w.ngayCo, 1, 'Mới có 1 ngày lịch sử');
        assert.equal(w.duLieu14, false, 'Chưa đủ 14 ngày');
        assert.equal(w.watchlist.length, 0, 'Chưa đủ dữ liệu thì watchlist phải TRỐNG, không phán bừa');
        assert.equal(w.khaiTu.length, 0, 'Chưa đủ dữ liệu thì danh sách khai tử phải TRỐNG');
        assert.ok(w.tongLenh >= 70, 'Vẫn đếm được tổng số lệnh đăng ký');
    });

    it('11. getWindowStats trả null khi KHÔNG đọc được DB (null != 0 lượt)', async () => {
        gaDb({ cuaSo: null });
        const w = await T.getWindowStats(1);
        assert.equal(w, null, 'Không đọc được DB phải trả null để người gọi nói "chưa đo được"');
        const dead = await T.getDeadWatchlist();
        assert.equal(dead, null, 'Và watchlist cũng phải là null, không phải mảng rỗng');
    });
});
