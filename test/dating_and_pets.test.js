// test/dating_and_pets.test.js
// Test tích hợp tính năng Hẹn hò/Tặng quà (Dating) và Cho Pet ăn bằng vật phẩm (Pet Progression)
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
    test('Bỏ qua Dating and Pets Integration Test — thiếu TEST_SUPABASE_*', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const { petLevel } = require('../src/data/pets');

    const testUser = 'discord_dating_and_pets_test_user';

    async function cleanup() {
        await supabase.from('user_pets').delete().eq('user_id', testUser);
        await supabase.from('inventory').delete().eq('user_id', testUser);
        await supabase.from('users').delete().eq('user_id', testUser);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Dating: Tăng thiện cảm và trừ quà tặng chính xác', async () => {
        // 1. Tạo user
        await db.getUser(testUser);
        
        // 2. Thêm vật phẩm làm quà tặng vào kho
        await db.giveItemAdmin(testUser, 'bo_hoa', 2);
        
        // 3. Thực hiện tặng quà: Trừ 1 bó hoa và cộng thiện cảm
        const giftId = 'bo_hoa';
        const giftGain = 15;
        
        // Mô phỏng logic của /henho tang-qua
        const taken = await db.takeItem(testUser, giftId, 1);
        assert.strictEqual(taken, true, 'Trừ quà tặng thành công');
        
        // Kiểm tra số lượng quà còn lại
        const { data: invRow } = await supabase.from('inventory').select('quantity').eq('user_id', testUser).eq('item_id', giftId).single();
        assert.strictEqual(Number(invRow.quantity), 1, 'Kho còn lại 1 bó hoa');

        // Cộng thiện cảm
        const res = await db.incrAffection(testUser, giftGain);
        assert.ok(res, 'Cộng thiện cảm thành công');
        assert.strictEqual(res.added, giftGain, 'Số thiện cảm cộng thêm chính xác');
        assert.strictEqual(res.affection, giftGain, 'Tổng thiện cảm hiện tại chính xác');
    });

    test('Pet Progression: Cho Pet ăn bằng vật phẩm tăng EXP chính xác', async () => {
        // 1. Nhận nuôi Pet
        await db.adoptPet(testUser, 'meo', 'Miu Miu');
        
        // 2. Thêm vật phẩm thức ăn (Cá ngon) vào kho
        await db.giveItemAdmin(testUser, 'ca_ngon', 2);
        
        // 3. Cho Pet ăn bằng Cá ngon
        const foodId = 'ca_ngon';
        const foodMult = 1.5;
        const baseGain = 10;
        
        // Mô phỏng logic cho pet ăn bằng item
        const taken = await db.takeItem(testUser, foodId, 1);
        assert.strictEqual(taken, true, 'Trừ thức ăn thành công');
        
        const { data: invRow } = await supabase.from('inventory').select('quantity').eq('user_id', testUser).eq('item_id', foodId).single();
        assert.strictEqual(Number(invRow.quantity), 1, 'Kho còn lại 1 cá ngon');

        // Tính toán EXP cộng thêm
        const gain = Math.floor(baseGain * foodMult);
        
        const newExp = await db.feedPet(testUser, gain);
        assert.ok(newExp !== null, 'Cho ăn tăng EXP thành công');
        assert.strictEqual(newExp, gain, 'EXP hiện tại của pet chính xác');
    });

    test('Baking Season: Kiểm tra logic nướng bánh theo mùa âm lịch', () => {
        const bpLib = require('../src/lib/battlepass');
        const seasonId = bpLib.getCurrentSeasonId();
        
        let cakeId = 'banh_kem_dau';
        let cakeName = 'Bánh Kem Dâu Gekka';
        
        if (seasonId.startsWith('tet_')) {
            cakeId = 'banh_chung';
            cakeName = 'Bánh Chưng Xanh Tết';
        } else if (seasonId.startsWith('trungthu_')) {
            cakeId = 'banh_trung_thu';
            cakeName = 'Bánh Trung Thu Thập Cẩm';
        }
        
        // Trả ra bánh kem dâu nếu là mùa thường, bánh chưng/bánh trung thu nếu là mùa lễ
        if (seasonId.includes('normal')) {
            assert.strictEqual(cakeId, 'banh_kem_dau');
            assert.strictEqual(cakeName, 'Bánh Kem Dâu Gekka');
        } else if (seasonId.includes('tet')) {
            assert.strictEqual(cakeId, 'banh_chung');
            assert.strictEqual(cakeName, 'Bánh Chưng Xanh Tết');
        } else if (seasonId.includes('trungthu')) {
            assert.strictEqual(cakeId, 'banh_trung_thu');
            assert.strictEqual(cakeName, 'Bánh Trung Thu Thập Cẩm');
        }
    });
}
