require('../src/lib/envLoader');
const test = require('node:test');
const assert = require('node:assert');

// 1. Test logic thuần (Milestone Invite Message)
test('getMilestoneInviteMessage: trả về tin nhắn mời khi vượt qua mốc level', () => {
    const { getMilestoneInviteMessage } = require('../src/lib/supportReward');
    
    // Test qua mốc Lv 5 (cũ 4, mới 6)
    const msgVi = getMilestoneInviteMessage(4, 6, 'vi');
    assert.ok(msgVi);
    assert.ok(msgVi.includes('Tập sự Gekka'));
    assert.ok(msgVi.includes('10.000 xu'));

    const msgEn = getMilestoneInviteMessage(4, 6, 'en');
    assert.ok(msgEn);
    assert.ok(msgEn.includes('Gekka Apprentice'));
    assert.ok(msgEn.includes('10,000 coins'));

    // Không vượt qua mốc nào (cũ 6, mới 7)
    const msgNone = getMilestoneInviteMessage(6, 7, 'vi');
    assert.strictEqual(msgNone, null);
});

// 2. Test đồng bộ Role (Mocking GuildMember & Roles)
test('syncSupportGuildRoles: bỏ qua nếu không phải Server Support hoặc thiếu quyền', async () => {
    const { syncSupportGuildRoles } = require('../src/lib/supportReward');
    
    // Mock member ngoài guild support
    const mockMemberOutside = {
        guild: { id: 'guild_khac' },
        roles: { cache: { has: () => false } }
    };
    
    // Sẽ exit sớm mà không crash
    await syncSupportGuildRoles(mockMemberOutside, 10);
    assert.ok(true);
});

// 3. Test Integration Database (nếu có DB test)
const hasTestDb = process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (hasTestDb) {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
}

if (!hasTestDb) {
    test('Bỏ qua DB Integration Test — thiếu TEST_SUPABASE_* (không chạy để tránh đụng prod)', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const testUser = 'discord_test_user_support_reward';

    async function cleanup() {
        await supabase.from('users').delete().eq('user_id', testUser);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Integration: claimSupportGift - nhận quà thành công lần đầu và bị block lần hai', async () => {
        // Tạo user test mới
        const u = await db.getUser(testUser);
        assert.ok(u);
        assert.strictEqual(u.claimed_support_gift, false, 'Mặc định chưa nhận quà');

        // Nhận quà lần đầu
        const res1 = await db.claimSupportGift(testUser, 10000);
        assert.strictEqual(res1, true, 'Nhận quà lần đầu thành công');

        const uAfter = await db.getUser(testUser);
        assert.strictEqual(Number(uAfter.wallet), 10000, 'Ví nhận được 10000 xu');
        assert.strictEqual(uAfter.claimed_support_gift, true, 'Trạng thái chuyển thành true');

        // Thử nhận lần hai
        const res2 = await db.claimSupportGift(testUser, 10000);
        assert.strictEqual(res2, false, 'DB chặn nhận quà lần thứ hai');
        
        const uFinal = await db.getUser(testUser);
        assert.strictEqual(Number(uFinal.wallet), 10000, 'Ví vẫn giữ nguyên 10000 xu');
    });
}
