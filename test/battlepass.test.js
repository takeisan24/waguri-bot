// test/battlepass.test.js
// Test tích hợp hệ thống Sổ Sứ Mệnh (Battle Pass)
require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');

const hasTestDb = process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (hasTestDb) {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
}

if (!hasTestDb) {
    test('Bỏ qua Battle Pass Integration Test — thiếu TEST_SUPABASE_*', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const bpLib = require('../src/lib/battlepass');
    const rewardsConfig = require('../src/data/battlepass_rewards');

    const testUser = 'discord_battle_pass_test_user';

    async function cleanup() {
        // Dọn dẹp dữ liệu của user test trong battle_pass_users, inventory và users
        await supabase.from('battle_pass_users').delete().eq('user_id', testUser);
        await supabase.from('inventory').delete().eq('user_id', testUser);
        await supabase.from('users').delete().eq('user_id', testUser);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Battle Pass: Cộng XP & Lên cấp Sổ Sứ Mệnh', async () => {
        // 1. Tạo user test
        await db.getUser(testUser);
        const seasonId = bpLib.getCurrentSeasonId();

        // Ban đầu chưa có dữ liệu Sổ Sứ Mệnh
        let bp = await db.getBattlePass(testUser, seasonId);
        assert.strictEqual(bp, null, 'Ban đầu không có dữ liệu BP');

        // 2. Cộng 500 XP
        let res = await bpLib.addXp(testUser, 500);
        assert.ok(res, 'Cộng XP thành công');
        assert.strictEqual(res.xp, 500, 'XP hiện tại là 500');
        assert.strictEqual(res.levelUp, false, 'Chưa lên cấp');
        assert.strictEqual(res.newLevel, 0, 'Cấp hiện tại vẫn là 0');

        // 3. Cộng thêm 600 XP (tổng 1100 XP -> Lên cấp 1)
        res = await bpLib.addXp(testUser, 600);
        assert.ok(res, 'Cộng XP lần 2 thành công');
        assert.strictEqual(res.xp, 1100, 'XP hiện tại là 1100');
        assert.strictEqual(res.levelUp, true, 'Đã lên cấp');
        assert.strictEqual(res.newLevel, 1, 'Cấp mới là 1');

        bp = await db.getBattlePass(testUser, seasonId);
        assert.ok(bp, 'Đã tạo bản ghi Sổ Sứ Mệnh');
        assert.strictEqual(bp.xp, 1100, 'DB lưu XP đúng');
    });

    test('Battle Pass: Cộng XP chat AI & Giới hạn hàng ngày (max 50 XP)', async () => {
        const seasonId = bpLib.getCurrentSeasonId();
        // Reset dữ liệu hàng ngày bằng cách xóa dòng
        await supabase.from('battle_pass_users').delete().eq('user_id', testUser);

        // Tạo lại bản ghi bằng addXp 0
        await bpLib.addXp(testUser, 0);

        // Gọi addAiXp 5 lần liên tiếp (mỗi lần 10 XP, tổng cộng 50 XP)
        for (let i = 1; i <= 5; i++) {
            let res = await bpLib.addAiXp(testUser);
            assert.ok(res, `Cộng XP AI lần ${i} thành công`);
            assert.strictEqual(res.success, true, `Lần ${i} thành công thực tế`);
            assert.strictEqual(res.gainedXp, 10, `Lượng XP nhận được lần ${i} là 10`);
        }

        // Lần thứ 6: Đã đạt giới hạn 50 XP/ngày -> không được cộng nữa
        let res6 = await bpLib.addAiXp(testUser);
        assert.ok(res6, 'Gọi addAiXp lần 6 thành công');
        assert.strictEqual(res6.success, false, 'Lần 6 bị chặn');
        assert.strictEqual(res6.gainedXp, 0, 'Không nhận thêm XP nào');

        const bp = await db.getBattlePass(testUser, seasonId);
        assert.strictEqual(bp.xp, 50, 'Tổng XP trong DB chỉ là 50');
    });

    test('Battle Pass: Mua Premium bằng xu ảo', async () => {
        const seasonId = bpLib.getCurrentSeasonId();
        await supabase.from('battle_pass_users').delete().eq('user_id', testUser);
        await bpLib.addXp(testUser, 0);

        // Ban đầu ví có 0 xu -> Mua sẽ thất bại vì thiếu tiền
        let buyRes = await bpLib.buyPremium(testUser);
        assert.strictEqual(buyRes, 'insufficient_funds', 'Thất bại do thiếu xu');

        // Cộng 300,000 xu vào ví
        await db.addMoney(testUser, 300000, 'wallet');

        // Mua lại Premium
        buyRes = await bpLib.buyPremium(testUser);
        assert.strictEqual(buyRes, 'ok', 'Mua Premium thành công');

        const user = await db.getUser(testUser);
        assert.strictEqual(Number(user.wallet), 100000, 'Ví bị trừ đúng 200,000 xu');

        const bp = await db.getBattlePass(testUser, seasonId);
        assert.strictEqual(bp.is_premium, true, 'Sổ Sứ Mệnh đã kích hoạt Premium');

        // Mua lại lần nữa -> đã sở hữu
        buyRes = await bpLib.buyPremium(testUser);
        assert.strictEqual(buyRes, 'already_premium', 'Báo lỗi đã sở hữu Premium');
    });

    test('Battle Pass: Nhận quà hàng loạt (claimAll)', async () => {
        const seasonId = bpLib.getCurrentSeasonId();
        await cleanup();
        await db.getUser(testUser);

        // 1. Level 0: Không có quà
        let claimRes = await bpLib.claimAll(testUser);
        assert.strictEqual(claimRes.status, 'level_too_low', 'Cấp độ quá thấp để nhận quà');

        // 2. Cộng XP lên Level 2
        await bpLib.addXp(testUser, 2000);

        // Nhận quà Free cho Level 1 (1000 xu) và Level 2 (1x banh_mi)
        claimRes = await bpLib.claimAll(testUser);
        assert.strictEqual(claimRes.status, 'ok', 'Nhận quà thành công');
        assert.deepStrictEqual(claimRes.freeLevels, [1, 2], 'Nhận thành công level 1, 2 Free');
        assert.strictEqual(claimRes.premiumLevels.length, 0, 'Chưa có Premium nên không nhận Premium');
        assert.strictEqual(claimRes.coins, 1000, 'Cộng 1000 xu');
        assert.deepStrictEqual(claimRes.items, { banh_mi: 1 }, 'Nhận 1 bánh mì');

        // Kiểm tra tiền ví và kho đồ
        let user = await db.getUser(testUser);
        assert.strictEqual(Number(user.wallet), 1000, 'Ví có 1000 xu');
        let inv = await db.getInventory(testUser);
        let banhMiItem = inv.find(i => i.item_id === 'banh_mi');
        assert.ok(banhMiItem, 'Đã nhận bánh mì vào kho đồ');
        assert.strictEqual(banhMiItem.quantity, 1, 'Số lượng bánh mì là 1');

        // 3. Mua Premium và Nhận quà Premium của Level 1 (3000 xu) + Level 2 (1x bo_hoa)
        await db.addMoney(testUser, 200000, 'wallet'); // Nạp đủ tiền mua Premium
        await bpLib.buyPremium(testUser);

        claimRes = await bpLib.claimAll(testUser);
        assert.strictEqual(claimRes.status, 'ok', 'Nhận quà Premium thành công');
        assert.strictEqual(claimRes.freeLevels.length, 0, 'Quà Free đã nhận rồi');
        assert.deepStrictEqual(claimRes.premiumLevels, [1, 2], 'Nhận thành công level 1, 2 Premium');
        assert.strictEqual(claimRes.coins, 3000, 'Nhận thêm 3000 xu Premium Level 1');
        assert.deepStrictEqual(claimRes.items, { bo_hoa: 1 }, 'Nhận 1 bó hoa Premium Level 2');

        // 4. Nhận lại lần nữa -> không có gì để nhận
        claimRes = await bpLib.claimAll(testUser);
        assert.strictEqual(claimRes.status, 'nothing_to_claim', 'Không còn quà nào để nhận');
    });
}
