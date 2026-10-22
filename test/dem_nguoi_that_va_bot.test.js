// ============================================================
// test/dem_nguoi_that_va_bot.test.js — tách người thật / bot (Đợt 5 spec dọn dẹp 29/08).
//
// VÌ SAO CÓ TỆP NÀY: chủ bot cần số người THẬT để tự phân tích, mà con số duy nhất bot
// có sẵn (`memberCount`) gộp cả bot vào. Cách đếm đúng (`members.fetch()`) ghi cache
// toàn bộ thành viên, đá vào sweeper 60 phút ở `18543c3` — trên VPS 384MB thì một
// server 3.300 người là cả một vấn đề.
//
// Nên dùng phép xấp xỉ bằng role quản lý, ĐÃ NGHIỆM THU 22-10-2026 trên 5 server đông
// nhất: lệch 4/181 bot = 2,2%, server 3.330 người lệch ĐÚNG 0.
//
// HAI CÁI BẪY tệp này canh, vì cả hai đã THỰC SỰ xảy ra khi viết:
//   1. `client.shard` là `null` ở prod (chạy `index.js` trực tiếp, không qua `shard.js`)
//      -> viết `client.shard.ids` không rẽ nhánh sẽ ném TypeError ngay lúc khởi động.
//   2. `serverinfo.js` gọi `demGuild(...)` mà THIẾU dòng require — `node --check` vẫn
//      XANH vì đó là lỗi lúc chạy, không phải lỗi cú pháp. Nên test này NẠP THẬT cả
//      hai tệp tiêu thụ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { demBot, demGuild, thamSoI18n, demTienTrinh, nhanShard, dongConsole } = require('../src/lib/demThanhVien');

// guild giả: `roles.cache.filter()` chỉ cần trả thứ có `.size`, giống Collection của discord.js
const gia = (tong, soBot) => ({
    memberCount: tong,
    roles: { cache: { filter: () => ({ size: soBot }) } },
});

test('tách đúng người/bot từ memberCount', () => {
    assert.deepStrictEqual(demGuild(gia(260, 33)), { tong: 260, bot: 33, nguoi: 227 });
});

test('bot nhiều hơn tổng -> kẹp lại, không ra số âm', () => {
    assert.deepStrictEqual(demGuild(gia(5, 99)), { tong: 5, bot: 5, nguoi: 0 });
});

test('guild thiếu dữ liệu -> trả 0, không ném', () => {
    assert.deepStrictEqual(demGuild({}), { tong: 0, bot: 0, nguoi: 0 });
    assert.strictEqual(demBot({}), 0);
});

test('roles.cache ném lỗi -> demBot trả 0 chứ không làm sập ready', () => {
    const no = { memberCount: 10, roles: { get cache() { throw new Error('chưa nạp'); } } };
    assert.strictEqual(demBot(no), 0);
    assert.deepStrictEqual(demGuild(no), { tong: 10, bot: 0, nguoi: 10 });
});

test('thamSoI18n đổi tên khoá sang tên locale dùng', () => {
    assert.deepStrictEqual(thamSoI18n(gia(260, 33)), { humans: 227, bots: 33, total: 260 },
        'locale viết {humans}/{bots}; truyền thẳng demGuild() thì placeholder không được thay');
});

test('gộp nhiều guild trong một tiến trình', () => {
    const client = { guilds: { cache: new Map([['a', gia(100, 10)], ['b', gia(50, 5)]]) } };
    assert.deepStrictEqual(demTienTrinh(client), { servers: 2, tong: 150, bot: 15, nguoi: 135 });
});

test('client.shard = null (đúng trạng thái prod) -> KHÔNG ném, đọc từ ws.shards', () => {
    const client = { shard: null, ws: { shards: new Map([[0, {}]]) } };
    assert.strictEqual(nhanShard(client), '0/1',
        'client.shard là null ở prod — chạm vào client.shard.ids sẽ ném TypeError lúc khởi động');
});

test('có sharding -> nhãn lấy từ client.shard', () => {
    assert.strictEqual(nhanShard({ shard: { ids: [1], count: 4 } }), '1/4');
});

test('dòng console có đủ 4 số chủ bot cần: server, người thật, bot, shard', () => {
    const client = {
        guilds: { cache: new Map([['a', gia(3330, 48)]]) },
        shard: null,
        ws: { shards: new Map([[0, {}]]) },
    };
    const d = dongConsole(client);
    assert.match(d, /1 server/);
    assert.match(d, /3,282 người thật/, 'phải là người THẬT (3330 − 48), không phải memberCount thô');
    assert.match(d, /48 bot/);
    assert.match(d, /shard 0\/1/);
});

// ---- hai tệp tiêu thụ: nạp THẬT, vì thiếu require là lỗi lúc chạy mà --check không thấy ----

test('ready.js in dòng console đó lúc khởi động', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', 'src', 'events', 'ready.js'), 'utf8');
    assert.match(js, /dongConsole\(client\)/,
        'Đợt 5 T16: thiếu dòng này thì chủ bot không có số người thật để phân tích');
    // `[^)]*` KHÔNG dùng được ở đây: lời gọi thật có `require('../lib/demThanhVien')`, tức có
    // dấu `)` nằm giữa `setInterval(` và `dongConsole` -> neo trượt, phép bẻ ngược lọt qua.
    assert.ok(!/setInterval\([\s\S]{0,160}?dongConsole/.test(js),
        'KHÔNG đặt lịch in lại: lịch 30 phút làm vô hiệu sweeper cache 60 phút ở 18543c3');
});

test('serverinfo.js nạp được VÀ có require thamSoI18n', () => {
    const cmd = require('../src/commands/admin/serverinfo.js');
    assert.ok(cmd.data && typeof cmd.execute === 'function');
    const js = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'commands', 'admin', 'serverinfo.js'), 'utf8');
    assert.match(js, /thamSoI18n\(guild\)/, 'T17: /serverinfo phải tách người thật/bot');
    assert.match(js, /require\('\.\.\/\.\.\/lib\/demThanhVien'\)/,
        'gọi thamSoI18n mà thiếu require -> ReferenceError lúc chạy, node --check vẫn xanh');
});

test('hai chuỗi mới có ở CẢ vi và en, và nhận đúng placeholder', () => {
    for (const ten of ['vi', 'en']) {
        const L = require(`../src/locales/${ten}.json`);
        for (const k of ['report_split', 'members_split']) {
            const s = L.commands.serverinfo[k];
            assert.ok(typeof s === 'string' && s.trim(), `${ten}.json thiếu commands.serverinfo.${k}`);
            assert.match(s, /\{humans\}/, `${ten}.${k} thiếu {humans}`);
            assert.match(s, /\{bots\}/, `${ten}.${k} thiếu {bots}`);
        }
    }
});

test('chuỗi + demGuild ghép lại ra câu hoàn chỉnh, không còn dấu ngoặc nào', () => {
    const { t } = require('../src/lib/i18n');
    for (const ten of ['vi', 'en']) {
        const cau = t(ten, 'commands.serverinfo.members_split', thamSoI18n(gia(260, 33)));
        assert.match(cau, /227/, `${ten}: thiếu số người thật`);
        assert.match(cau, /33/, `${ten}: thiếu số bot`);
        assert.ok(!/[{}]/.test(cau), `${ten}: còn placeholder chưa thay: ${cau}`);
    }
});
