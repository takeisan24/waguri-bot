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
    test('Bỏ qua Collections Integration Test — thiếu TEST_SUPABASE_*', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const collections = require('../src/data/collections');

    const testUser = 'discord_collection_test_user';

    async function cleanup() {
        // Dọn dẹp dữ liệu của user test trong user_discoveries, user_collection_rewards và users
        await supabase.from('user_collection_rewards').delete().eq('user_id', testUser);
        await supabase.from('user_discoveries').delete().eq('user_id', testUser);
        await supabase.from('users').delete().eq('user_id', testUser);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Collections: discoverItem & getDiscoveries', async () => {
        // Tạo user test
        await db.getUser(testUser);

        // Ban đầu chưa có phát hiện nào
        let discoveries = await db.getDiscoveries(testUser);
        assert.strictEqual(discoveries.size, 0, 'Ban đầu không có phát hiện nào');

        // Phát hiện item 'da'
        let ok = await db.discoverItem(testUser, 'da');
        assert.strictEqual(ok, true, 'discoverItem trả về true');

        discoveries = await db.getDiscoveries(testUser);
        assert.strictEqual(discoveries.size, 1, 'Mở khóa được 1 vật phẩm');
        assert.ok(discoveries.has('da'), 'Có vật phẩm "da" trong Set');

        // Phát hiện trùng không gây lỗi (idempotent)
        ok = await db.discoverItem(testUser, 'da');
        assert.strictEqual(ok, true, 'discoverItem trùng lặp vẫn trả về true');

        discoveries = await db.getDiscoveries(testUser);
        assert.strictEqual(discoveries.size, 1, 'Mở khóa vẫn là 1 vật phẩm');
    });

    test('Collections: claimCollectionReward', async () => {
        // Tạo lại user, set ví = 0
        await supabase.from('users').update({ wallet: 0, title: null }).eq('user_id', testUser);
        await supabase.from('user_collection_rewards').delete().eq('user_id', testUser);
        await supabase.from('user_discoveries').delete().eq('user_id', testUser);

        const testSet = collections[0]; // Set Ngư Ông: 'ca_tuoi', 'ca_ngon', 'ca_hiem', 'ca_rong_vang', 'ca_koi_nhat'

        // 1. Thử nhận thưởng khi chưa có vật phẩm nào
        let result = await db.claimCollectionReward(
            testUser,
            testSet.id,
            testSet.items,
            testSet.reward_coins,
            testSet.title
        );
        assert.strictEqual(result, 'not_completed', 'Chặn nhận thưởng do chưa đủ vật phẩm');

        // 2. Mở khóa thiếu 1 món (chỉ mở 4/5 món)
        for (let i = 0; i < testSet.items.length - 1; i++) {
            await db.discoverItem(testUser, testSet.items[i]);
        }
        result = await db.claimCollectionReward(
            testUser,
            testSet.id,
            testSet.items,
            testSet.reward_coins,
            testSet.title
        );
        assert.strictEqual(result, 'not_completed', 'Vẫn chặn nhận thưởng khi thiếu 1 món');

        // 3. Mở khóa món cuối cùng để đủ bộ sưu tập
        await db.discoverItem(testUser, testSet.items[testSet.items.length - 1]);

        // Nhận thưởng thành công
        result = await db.claimCollectionReward(
            testUser,
            testSet.id,
            testSet.items,
            testSet.reward_coins,
            testSet.title
        );
        assert.strictEqual(result, 'ok', 'Nhận thưởng thành công');

        // Verify tiền và danh hiệu được cập nhật
        const u = await db.getUser(testUser);
        assert.strictEqual(Number(u.wallet), testSet.reward_coins, 'Ví tăng thêm đúng số tiền thưởng');
        assert.strictEqual(u.title, testSet.title, 'Cập nhật đúng danh hiệu');

        // 4. Nhận lại lần 2 phải bị chặn
        result = await db.claimCollectionReward(
            testUser,
            testSet.id,
            testSet.items,
            testSet.reward_coins,
            testSet.title
        );
        assert.strictEqual(result, 'already_claimed', 'Chặn không cho nhận thưởng trùng lặp');
    });
}
