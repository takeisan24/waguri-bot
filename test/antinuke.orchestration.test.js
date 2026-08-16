// ============================================================
// test/antinuke.orchestration.test.js — Khoá phần DÂY NỐI của hệ chống nuke.
//
// `antinuke.test.js` khoá phần não thuần (đếm, ngưỡng, bitmask quyền). File này khoá
// thứ khác hẳn: đường dây thật từ "một hành vi vừa xảy ra" đến "kẻ tấn công đã bị
// chặn" — lọc miễn trừ, dry-run vs thi hành thật, khoá server, và các nhánh THẤT BẠI
// (chủ server, thứ bậc role, DB chết).
//
// Vì sao đáng công dựng guild giả: bài học `/market` của chính repo này — 9 subcommand
// bốc hơi mà toàn bộ test đơn vị vẫn xanh, vì không test nào chạy qua đường dây thật.
// Với anti-nuke thì hậu quả nặng hơn nhiều: một dây đứt nghĩa là ngồi im nhìn server
// bị xoá sạch, và không ai phát hiện cho tới lúc đã muộn.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { Collection } = require('discord.js');

const { stubDb } = require('./helpers/mockInteraction');
const db = require('../src/database.js');
const antinuke = require('../src/lib/antinuke');
const cacheCfg = require('../src/lib/antinuke/config');

const BOT = 'bot_waguri';
const CHU = 'chu_server';

/** Guild giả — chỉ dựng ĐÚNG bề mặt discord.js mà tầng điều phối chạm tới. */
function taoGuild({ id = 'g_test', executorId = 'ke_xau', executorLaBot = false, viTriRole = 5 } = {}) {
    const nhatKy = { ban: [], kick: [], stripped: null, khoa: [] };
    // Kẻ thực thi phải THỰC SỰ giữ role, nếu không `tuocRole` thoát sớm ("không có gì
    // để gỡ") và bài test tưởng là đã tước nhưng thực ra chưa gọi API nào.
    const roleThuong = { id: 'role_mod', managed: false };
    const roleTichHop = { id: 'role_bot_managed', managed: true };
    const member = {
        id: executorId,
        user: { bot: executorLaBot },
        roles: {
            highest: { position: viTriRole },
            cache: new Collection([[roleThuong.id, roleThuong], [roleTichHop.id, roleTichHop]]),
            set: async (giu) => { nhatKy.stripped = giu; },
            remove: async () => {},
        },
        kick: async () => { nhatKy.kick.push(executorId); },
    };
    const guild = {
        id,
        name: 'Server Test',
        ownerId: CHU,
        features: [],
        verificationLevel: 0,
        client: { user: { id: BOT } },
        members: {
            me: { permissions: { has: () => true }, roles: { highest: { position: 100 } } },
            cache: new Collection([[executorId, member]]),
            fetch: async (i) => (i === executorId ? member : null),
            fetchMe: async () => guild.members.me,
        },
        roles: {
            cache: new Collection(),
            everyone: { permissions: { bitfield: 0n }, setPermissions: async () => {} },
        },
        bans: { create: async (uid) => { nhatKy.ban.push(uid); } },
        channels: { cache: new Collection(), fetch: async () => null },
        fetchOwner: async () => ({ send: async () => {} }),
        disableInvites: async () => { nhatKy.khoa.push('invites'); },
        setVerificationLevel: async () => { nhatKy.khoa.push('verification'); },
    };
    member.guild = guild;
    return { guild, nhatKy };
}

/** Nạp cấu hình vào cache RAM + chặn mọi đường ghi DB thật. Trả hàm khôi phục. */
async function dungCanh(guildId, { enabled = true, mode = 'enforce', whitelist = [] } = {}) {
    const suCo = [];
    const goc = stubDb(db, {
        antinukeGet: async () => ({ enabled, mode, config: {}, whitelist }),
        antinukeIncidentOpen: async (row) => { suCo.push(row); return 1; },
        antinukeActionLog: async () => true,
        antinukeSetConfig: async () => 'ok',
        getGuildSettings: async () => ({ language: 'vi' }),
    });
    await cacheCfg.invalidate(guildId);
    return { suCo, khoiPhuc: () => { goc(); cacheCfg._reset(); } };
}

/** Bắn n lần cùng một hành vi từ cùng một người. */
async function banLienTiep(guild, executorId, action, n) {
    for (let i = 0; i < n; i++) await antinuke.xuLy(guild, executorId, action, {});
}

test('điều phối: dưới ngưỡng thì KHÔNG có sự cố, KHÔNG ai bị đụng tới', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_duoi_nguong' });
    const c = await dungCanh(guild.id);
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 2);
        assert.strictEqual(c.suCo.length, 0);
        assert.deepStrictEqual(nhatKy.ban, []);
    } finally { c.khoiPhuc(); }
});

test('điều phối: thi hành thật -> vượt ngưỡng là BAN ngay, và ghi sự cố', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_enforce' });
    const c = await dungCanh(guild.id, { mode: 'enforce' });
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 3);
        assert.deepStrictEqual(nhatKy.ban, ['ke_xau'], 'kẻ tấn công phải bị cấm');
        assert.strictEqual(c.suCo.length, 1);
        assert.strictEqual(c.suCo[0].verdict, 'ban');
        assert.strictEqual(c.suCo[0].punished, true);
    } finally { c.khoiPhuc(); }
});

test('điều phối: dry-run -> vẫn ghi sự cố nhưng KHÔNG trừng phạt, KHÔNG khoá', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_dryrun' });
    const c = await dungCanh(guild.id, { mode: 'dryrun' });
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 3);
        assert.deepStrictEqual(nhatKy.ban, [], 'dry-run tuyệt đối không được đụng vào ai');
        assert.deepStrictEqual(nhatKy.khoa, [], 'dry-run cũng không được khoá server');
        assert.strictEqual(c.suCo.length, 1);
        assert.strictEqual(c.suCo[0].verdict, 'log');
        assert.strictEqual(c.suCo[0].punished, false);
    } finally { c.khoiPhuc(); }
});

test('điều phối: TẮT lá chắn -> không làm gì cả', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_tat' });
    const c = await dungCanh(guild.id, { enabled: false });
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 5);
        assert.strictEqual(c.suCo.length, 0);
        assert.deepStrictEqual(nhatKy.ban, []);
    } finally { c.khoiPhuc(); }
});

test('điều phối: người trong whitelist không bao giờ bị đụng tới', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_wl' });
    const c = await dungCanh(guild.id, { whitelist: [{ id: 'ke_xau', kind: 'user' }] });
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 5);
        assert.strictEqual(c.suCo.length, 0);
        assert.deepStrictEqual(nhatKy.ban, []);
    } finally { c.khoiPhuc(); }
});

test('điều phối: hành động của CHÍNH BOT không bao giờ bị tính (chống tự cắn)', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_self' });
    const c = await dungCanh(guild.id);
    try {
        await banLienTiep(guild, BOT, 'channel_delete', 10);
        assert.strictEqual(c.suCo.length, 0, 'bot dọn dẹp xong tự kết án mình là lỗi chết người');
        assert.deepStrictEqual(nhatKy.ban, []);
    } finally { c.khoiPhuc(); }
});

test('điều phối: CHỦ SERVER không bị trừng phạt, nhưng sự cố VẪN được ghi', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_owner', executorId: CHU });
    const c = await dungCanh(guild.id);
    try {
        await banLienTiep(guild, CHU, 'channel_delete', 3);
        assert.deepStrictEqual(nhatKy.ban, [], 'bot không có cửa đụng vào chủ server');
        assert.strictEqual(c.suCo.length, 1, 'im lặng thì chủ server thật không bao giờ biết');
        assert.strictEqual(c.suCo[0].punished, false);
        assert.strictEqual(c.suCo[0].detail.ketQua, 'owner');
    } finally { c.khoiPhuc(); }
});

test('điều phối: kẻ có role CAO HƠN bot -> ghi rõ lý do thứ bậc, không thất bại im lặng', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_hierarchy', viTriRole: 999 });
    const c = await dungCanh(guild.id);
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 3);
        assert.deepStrictEqual(nhatKy.ban, []);
        assert.strictEqual(c.suCo[0].detail.ketQua, 'hierarchy',
            'phải nói đúng lý do để chủ server biết mà kéo role bot lên trên cùng');
    } finally { c.khoiPhuc(); }
});

test('điều phối: leo thang quyền bị chặn ngay lần ĐẦU TIÊN', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_escalate' });
    const c = await dungCanh(guild.id);
    try {
        await antinuke.xuLy(guild, 'ke_xau', 'perm_escalate', {});
        assert.strictEqual(c.suCo.length, 1);
        assert.strictEqual(c.suCo[0].verdict, 'strip');
        assert.deepStrictEqual(nhatKy.stripped, ['role_bot_managed'],
            'phải gỡ role thường và GIỮ LẠI role tích hợp — Discord từ chối cả lệnh nếu đưa role managed vào payload');
    } finally { c.khoiPhuc(); }
});

test('điều phối: xoá kênh hàng loạt kéo theo KHOÁ SERVER', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_lockdown' });
    const c = await dungCanh(guild.id);
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 3);
        assert.ok(nhatKy.khoa.includes('invites'), 'phải tắt invite để chặn đợt raid tiếp theo');
        assert.ok(nhatKy.khoa.includes('verification'));
    } finally { c.khoiPhuc(); }
});

test('điều phối: hai kẻ tấn công trong cùng cửa sổ -> đánh dấu nghi chiếm tài khoản hàng loạt', async () => {
    const { guild } = taoGuild({ id: 'g_panic' });
    const c = await dungCanh(guild.id);
    try {
        await banLienTiep(guild, 'ke_a', 'channel_delete', 3);
        await banLienTiep(guild, 'ke_b', 'channel_delete', 3);
        assert.strictEqual(c.suCo.length, 2);
        assert.strictEqual(c.suCo[0].detail.panic, false);
        assert.strictEqual(c.suCo[1].detail.panic, true);
    } finally { c.khoiPhuc(); }
});

test('điều phối: DB chết giữa chừng KHÔNG được ngăn đòn quyết định', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_db_chet' });
    const c = await dungCanh(guild.id);
    // Cache đã ấm, giờ mọi đường GHI xuống DB đều hỏng — đúng kịch bản Supabase chập chờn.
    const lai = stubDb(db, {
        antinukeIncidentOpen: async () => { throw new Error('supabase down'); },
        antinukeActionLog: async () => { throw new Error('supabase down'); },
    });
    try {
        await banLienTiep(guild, 'ke_xau', 'channel_delete', 3);
        assert.deepStrictEqual(nhatKy.ban, ['ke_xau'],
            'lá chắn phải sống sót qua sự cố DB — đó là toàn bộ lý do cấu hình nằm trong RAM');
    } finally { lai(); c.khoiPhuc(); }
});

// ------------------------------------------------------------------
// Hồi quy: gộp sự cố + không ghi đè trạng thái khoá + báo động không bị DB chặn.
// Ba lỗi này tìm ra bằng thực nghiệm (xoá 10 kênh thay vì đúng 3), không phải bằng đọc code.
// ------------------------------------------------------------------
const lockdown = require('../src/lib/antinuke/lockdown');

test('gộp sự cố: xoá 10 kênh -> ĐÚNG MỘT sự cố và ĐÚNG MỘT lệnh ban', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_gop' });
    const c = await dungCanh(guild.id);
    try {
        for (let i = 0; i < 10; i++) await antinuke.xuLy(guild, 'ke_xau', 'channel_delete', { targetId: 'ch' + i });
        assert.strictEqual(c.suCo.length, 1, 'một vụ nuke phải là một sự cố, không phải tám');
        assert.strictEqual(nhatKy.ban.length, 1, 'ban lặp lại chỉ đốt băng thông API đúng lúc cần nhất');
    } finally { c.khoiPhuc(); }
});

test('khoá server: gọi hai lần KHÔNG ghi đè bản ghi trạng thái gốc', async () => {
    const { guild } = taoGuild({ id: 'g_ghi_de' });
    const ghi = [];
    const goc = stubDb(db, {
        antinukeGet: async () => ({ enabled: true, mode: 'enforce', config: {}, whitelist: [] }),
        antinukeSetConfig: async (g, k, v) => { if (k === 'lockdown_state') ghi.push(v); return 'ok'; },
    });
    try {
        await cacheCfg.invalidate(guild.id);
        // Lần 1 khoá thật. Lần 2 mô phỏng gateway CHƯA kịp cập nhật guild.features/
        // verificationLevel — đúng cửa sổ khiến bản cũ ghi đè bằng trạng thái ĐÃ KHOÁ.
        await lockdown.khoa(guild, 'lan 1');
        guild.features = [];
        guild.verificationLevel = 0;
        await lockdown.khoa(guild, 'lan 2');
        assert.strictEqual(ghi.length, 1, 'chỉ được ghi trạng thái gốc đúng một lần');
        const luu = JSON.parse(ghi[0]);
        assert.strictEqual(luu.invitesDisabled, false, 'phải là trạng thái TRƯỚC khi khoá');
        assert.strictEqual(luu.verificationLevel, 0);
    } finally { goc(); cacheCfg._reset(); }
});

test('báo động không bị lượt ghi DB chậm chặn lại', async () => {
    const { guild, nhatKy } = taoGuild({ id: 'g_db_cham' });
    const c = await dungCanh(guild.id);
    // Supabase treo tới sát SUPABASE_TIMEOUT_MS (10s). Báo động không được chờ theo.
    // Timer KHÔNG unref: một lượt gọi DB thật cũng giữ event loop bằng socket của nó,
    // và nếu unref thì test runner thấy loop cạn trong khi promise còn treo.
    let treo = null;
    const lai = stubDb(db, {
        antinukeIncidentOpen: () => new Promise(r => { treo = setTimeout(() => r(7), 5000); }),
    });
    try {
        const batDau = Date.now();
        for (let i = 0; i < 3; i++) await antinuke.xuLy(guild, 'ke_xau', 'channel_delete', {});
        const tron = Date.now() - batDau;
        assert.ok(tron < 3000, 'phải thoát theo ngân sách 1,5s chứ không chờ hết 5s (đo được ' + tron + 'ms)');
        assert.deepStrictEqual(nhatKy.ban, ['ke_xau'], 'và đòn quyết định vẫn phải xảy ra');
    } finally { if (treo) clearTimeout(treo); lai(); c.khoiPhuc(); }
});

test('DB lỗi (vd migration chưa áp): KHÔNG nện Supabase mỗi sự kiện audit', async () => {
    const { guild } = taoGuild({ id: 'g_backoff' });
    let soLanGoi = 0;
    const goc = stubDb(db, {
        antinukeGet: async () => { soLanGoi++; return null; }, // null = RPC hỏng
    });
    try {
        cacheCfg._reset();
        for (let i = 0; i < 20; i++) await antinuke.xuLy(guild, 'ke_xau', 'channel_delete', {});
        assert.ok(soLanGoi <= 2,
            '20 sự kiện chỉ được sinh tối đa 2 lượt gọi DB (bản âm có TTL), đo được ' + soLanGoi);
    } finally { goc(); cacheCfg._reset(); }
});

test('DB hồi phục sau khi hỏng: cấu hình được nạp lại, không cần restart', async () => {
    const { guild } = taoGuild({ id: 'g_hoi_phuc' });
    let hong = true;
    const goc = stubDb(db, {
        antinukeGet: async () => (hong ? null : { enabled: true, mode: 'enforce', config: {}, whitelist: [] }),
    });
    try {
        cacheCfg._reset();
        await cacheCfg.refresh(guild.id);
        assert.strictEqual(cacheCfg.dangBaoVe(guild.id), false, 'DB hỏng + chưa từng có cấu hình -> coi như tắt');
        hong = false;
        await cacheCfg.invalidate(guild.id);
        assert.strictEqual(cacheCfg.dangBaoVe(guild.id), true, 'DB sống lại thì lá chắn phải bật lại được');
    } finally { goc(); cacheCfg._reset(); }
});
