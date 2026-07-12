// test/backlog_max_depth.test.js
// Test tích hợp toàn bộ các tính năng mới trong backlog: Chuyển sinh, Sự kiện thế giới, Đền thờ clan, Kỹ năng pet.
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');

const hasTestDb = process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (!hasTestDb) {
    test('Bỏ qua Backlog Max Depth Integration Test — thiếu TEST_SUPABASE_*', () => {
        assert.ok(true);
    });
} else {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;

    const db = require('../src/database');
    const { supabase } = db;

    const testUser = 'discord_backlog_max_depth_test_user';
    const testClan = 'backlog_max_depth_test_clan';

    async function cleanup() {
        // Xóa user_badges, contributions, world_events, clan_upgrades, clans, user_pets, users
        await supabase.from('world_event_contributions').delete().eq('user_id', testUser);
        await supabase.from('user_badges').delete().eq('user_id', testUser);
        await supabase.from('user_pets').delete().eq('user_id', testUser);
        await supabase.from('clan_upgrades').delete().filter('clan_id', 'in', `(select id from public.clans where name = '${testClan}')`);
        await supabase.from('clans').delete().eq('name', testClan);
        await supabase.from('users').delete().eq('user_id', testUser);
        await supabase.from('world_events').delete().eq('target_type', 'coins').eq('target_amount', 999999);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Prestige: Yêu cầu cấp độ và reset ví/ngân hàng, tự động trang bị badge', async () => {
        // 1. Tạo user
        await db.getUser(testUser);
        
        // 2. Thử prestige khi không đủ EXP -> thất bại
        const r1 = await db.prestigeUser(testUser, 240100);
        assert.strictEqual(r1.status, 'level_insufficient', 'Không đủ level/EXP thì không cho prestige');

        // 3. Đặt EXP cao và thêm tiền để kiểm tra reset
        await supabase.from('users').update({ exp: 250000, wallet: 12345, bank: 67890 }).eq('user_id', testUser);

        // 4. Tiến hành prestige -> thành công
        const r2 = await db.prestigeUser(testUser, 240100);
        assert.strictEqual(r2.status, 'ok', 'Prestige thành công');
        assert.strictEqual(r2.new_prestige, 1, 'Prestige level lên cấp 1');

        // 5. Kiểm tra tài khoản đã reset và nhận quà khởi nghiệp
        const u = await db.getUser(testUser);
        assert.strictEqual(Number(u.exp), 0, 'EXP reset về 0');
        assert.strictEqual(Number(u.wallet), 5000, 'Ví được đặt về 5000 xu khởi nghiệp');
        assert.strictEqual(Number(u.bank), 0, 'Ngân hàng bị xóa về 0');

        // 6. Kiểm tra badge tự động trang bị
        const badges = await db.getUserBadges(testUser);
        const prestigeBadge = badges.find(b => b.badge_id === 'prestige_1');
        assert.ok(prestigeBadge, 'Có huy hiệu prestige_1');
        assert.strictEqual(prestigeBadge.is_equipped, true, 'Huy hiệu tự động trang bị');
    });

    test('World Event: Đóng góp tài nguyên & Nhận thưởng co-op', async () => {
        // 1. Tạo sự kiện thế giới nháp
        const endsAt = new Date();
        endsAt.setHours(endsAt.getHours() + 2);
        const event = await db.createWorldEvent('coins', 999999, endsAt.toISOString());
        assert.ok(event, 'Tạo sự kiện thành công');

        // 2. Thử đóng góp mà không đủ tiền -> thất bại
        await supabase.from('users').update({ wallet: 100 }).eq('user_id', testUser);
        const r1 = await db.contributeWorldEvent(testUser, event.id, 500);
        assert.strictEqual(r1, 'insufficient', 'Không đủ tiền đóng góp');

        // 3. Nạp tiền đóng góp -> thành công
        await supabase.from('users').update({ wallet: 20000 }).eq('user_id', testUser);
        const r2 = await db.contributeWorldEvent(testUser, event.id, 10000);
        assert.strictEqual(r2, 'ok', 'Đóng góp 10,000 xu thành công');

        // Check tiến độ của event
        const latest = await db.getLatestWorldEvent();
        assert.strictEqual(Number(latest.current_amount), 10000, 'Đã cập nhật tiến trình tích lũy');

        // 4. Thử nhận thưởng khi chưa hoàn thành -> thất bại
        const claimErr = await db.claimWorldEventReward(testUser, event.id);
        assert.strictEqual(claimErr, 'not_completed', 'Chưa hoàn thành sự kiện thì không claim được');

        // 5. Nâng tiến trình lên tối đa để hoàn thành sự kiện
        await supabase.from('world_events').update({ current_amount: 999999, completed: true }).eq('id', event.id);

        // 6. Nhận thưởng thành công
        const claimOk = await db.claimWorldEventReward(testUser, event.id);
        assert.strictEqual(claimOk, 'ok', 'Nhận thưởng co-op thành công');

        // 7. Thử nhận lại -> đã nhận
        const claimDup = await db.claimWorldEventReward(testUser, event.id);
        assert.strictEqual(claimDup, 'already_claimed', 'Không được nhận trùng lặp');
    });

    test('Clan Shrine: Quyên góp nguyên liệu và nâng cấp đền thờ', async () => {
        // Nạp tiền tạo clan (50,000 xu)
        await supabase.from('users').update({ wallet: 100000 }).eq('user_id', testUser);

        // 1. Tạo clan mới
        const rClan = await db.clanCreate(testUser, testClan);
        assert.ok(rClan, 'Tạo clan thành công');
        const myClan = await db.clanByName(testClan);

        // 2. Góp nguyên liệu vào kho bang hội
        const res1 = await db.clanDepositResource(myClan.id, 'tam_go', 50);
        assert.ok(res1, 'Quyên góp Tấm Gỗ thành công');
        assert.strictEqual(res1.tam_go, 50, 'Số dư Tấm Gỗ đúng');

        const res2 = await db.clanDepositResource(myClan.id, 'thoi_sat', 20);
        assert.strictEqual(res2.thoi_sat, 20, 'Số dư Thỏi Sắt đúng');

        // Nạp thêm xu vào ngân hàng clan
        await supabase.from('clans').update({ bank: 20000 }).eq('id', myClan.id);

        // 3. Tiến hành nâng cấp Đền thờ bang hội -> thành công
        const up = await db.upgradeClanShrine(myClan.id, 20000, 50, 20);
        assert.strictEqual(up, 'ok', 'Nâng cấp đền thờ thành công');

        // 4. Kiểm tra đền thờ nâng lên cấp 1 và khấu trừ nguyên liệu
        const clanUp = await db.getClanUpgrade(myClan.id);
        assert.strictEqual(clanUp.shrine_level, 1, 'Đền thờ đạt cấp 1');

        const clanFinal = await db.clanById(myClan.id);
        assert.strictEqual(Number(clanFinal.bank), 0, 'Xu trong quỹ bang đã bị khấu trừ');
        assert.strictEqual(clanFinal.resources.tam_go, 0, 'Tấm Gỗ đã bị khấu trừ');
        assert.strictEqual(clanFinal.resources.thoi_sat, 0, 'Thỏi Sắt đã bị khấu trừ');
    });

    test('Pet Skill Tree: Tăng điểm kỹ năng và nâng cấp kỹ năng', async () => {
        // 1. Nhận nuôi pet
        await db.adoptPet(testUser, 'meo', 'Test Pet');

        // 2. Thêm điểm kỹ năng
        const newPoints = await db.addPetSkillPoints(testUser, 2);
        assert.strictEqual(newPoints, 2, 'Cộng điểm kỹ năng thành công');

        // 3. Nâng cấp kỹ năng pet -> thành công
        const ok = await db.updatePetSkills(testUser, { fishing_luck: 1 }, 1);
        assert.ok(ok, 'Nâng cấp kỹ năng thành công');

        const p = await db.getPet(testUser);
        assert.strictEqual(p.skills.fishing_luck, 1, 'Kỹ năng câu cá đạt Lv 1');
        assert.strictEqual(p.skill_points, 1, 'Còn lại 1 điểm kỹ năng');
    });
}
