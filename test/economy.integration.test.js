require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');

// Chỉ chạy integration test thực tế nếu có biến môi trường Supabase đầy đủ
const hasDb = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY;

if (!hasDb) {
    test('Bỏ qua Integration Test vì thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_KEY', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;

    const testUser1 = 'discord_test_user_1';
    const testUser2 = 'discord_test_user_2';

    // Helper dọn dẹp data test
    async function cleanup() {
        // Xóa inventory, user và bakery test trước/sau khi chạy
        await supabase.from('inventory').delete().in('user_id', [testUser1, testUser2]);
        await supabase.from('bakeries').delete().in('user_id', [testUser1, testUser2]);
        await supabase.from('users').delete().in('user_id', [testUser1, testUser2]);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Integration: getUser - tự động tạo user mới với ví 0 đồng', async () => {
        const u = await db.getUser(testUser1);
        assert.ok(u, 'Tạo user thành công');
        assert.strictEqual(u.user_id, testUser1, 'Đúng ID user');
        assert.strictEqual(Number(u.wallet), 0, 'Ví mặc định 0đ');
        assert.strictEqual(Number(u.bank), 0, 'Ngân hàng mặc định 0đ');
    });

    test('Integration: addMoney - cộng trừ tiền ví/ngân hàng và chặn số dư âm', async () => {
        // Cộng 5000 vào ví
        let ok = await db.addMoney(testUser1, 5000, 'wallet');
        assert.strictEqual(ok, true, 'Cộng tiền ví thành công');
        
        let u = await db.getUser(testUser1);
        assert.strictEqual(Number(u.wallet), 5000, 'Số dư ví tăng lên 5000');

        // Trừ 2000 từ ví
        ok = await db.addMoney(testUser1, -2000, 'wallet');
        assert.strictEqual(ok, true, 'Trừ tiền ví thành công');
        
        u = await db.getUser(testUser1);
        assert.strictEqual(Number(u.wallet), 3000, 'Số dư ví còn lại 3000');

        // Thử trừ 4000 (vượt quá 3000) -> phải trả về false và không đổi số dư
        ok = await db.addMoney(testUser1, -4000, 'wallet');
        assert.strictEqual(ok, false, 'DB chặn thành công số dư ví âm');

        u = await db.getUser(testUser1);
        assert.strictEqual(Number(u.wallet), 3000, 'Số dư ví vẫn là 3000');
    });

    test('Integration: transferMoney - chuyển khoản nguyên tử giữa hai tài khoản', async () => {
        // Khởi tạo user 2
        await db.getUser(testUser2);
        
        // Reset ví
        await supabase.from('users').update({ wallet: 1000 }).eq('user_id', testUser1);
        await supabase.from('users').update({ wallet: 0 }).eq('user_id', testUser2);

        // Chuyển 400đ từ user 1 sang user 2
        let ok = await db.transferMoney(testUser1, testUser2, 400);
        assert.strictEqual(ok, true, 'Chuyển tiền thành công');

        const [u1, u2] = await Promise.all([db.getUser(testUser1), db.getUser(testUser2)]);
        assert.strictEqual(Number(u1.wallet), 600, 'User 1 còn lại 600đ');
        assert.strictEqual(Number(u2.wallet), 400, 'User 2 nhận được 400đ');

        // Thử chuyển vượt hạn mức (chuyển 1000đ khi chỉ còn 600đ)
        ok = await db.transferMoney(testUser1, testUser2, 1000);
        assert.strictEqual(ok, false, 'DB chặn chuyển khoản khi không đủ số dư');
    });

    test('Integration: transferMoneyWithTax - chuyển khoản có đánh thuế', async () => {
        // Reset ví: User 1 có 1000, User 2 có 0
        await supabase.from('users').update({ wallet: 1000 }).eq('user_id', testUser1);
        await supabase.from('users').update({ wallet: 0 }).eq('user_id', testUser2);

        // Chuyển 500đ, thuế 10% (50đ). Số tiền trừ ở User 1 là 500, User 2 nhận 450
        let ok = await db.transferMoneyWithTax(testUser1, testUser2, 500, 0.1);
        assert.strictEqual(ok, true, 'Chuyển tiền kèm thuế thành công');

        const [u1, u2] = await Promise.all([db.getUser(testUser1), db.getUser(testUser2)]);
        assert.strictEqual(Number(u1.wallet), 500, 'User 1 bị trừ đúng 500đ');
        assert.strictEqual(Number(u2.wallet), 450, 'User 2 nhận được 450đ (đã trừ 10% thuế)');
    });

    test('Integration: transferBank - gửi và rút tiền ngân hàng', async () => {
        // Reset ví = 1000, bank = 0
        await supabase.from('users').update({ wallet: 1000, bank: 0 }).eq('user_id', testUser1);

        // Gửi 800đ vào ngân hàng
        let ok = await db.transferBank(testUser1, 800, true);
        assert.strictEqual(ok, true, 'Gửi tiền vào bank thành công');

        let u = await db.getUser(testUser1);
        assert.strictEqual(Number(u.wallet), 200, 'Ví còn 200đ');
        assert.strictEqual(Number(u.bank), 800, 'Bank có 800đ');

        // Rút 300đ từ ngân hàng về ví
        ok = await db.transferBank(testUser1, 300, false);
        assert.strictEqual(ok, true, 'Rút tiền từ bank thành công');

        u = await db.getUser(testUser1);
        assert.strictEqual(Number(u.wallet), 500, 'Ví nhận lại thành 500đ');
        assert.strictEqual(Number(u.bank), 500, 'Bank còn lại 500đ');
    });

    test('Integration: buyItem - mua vật phẩm nguyên tử cập nhật wallet & inventory', async () => {
        // Reset ví = 5000, dọn sạch inventory của user 1
        await supabase.from('users').update({ wallet: 5000 }).eq('user_id', testUser1);
        await supabase.from('inventory').delete().eq('user_id', testUser1);

        // Mua 1 'banh_mi' (giá 150đ)
        let result = await db.buyItem(testUser1, 'banh_mi', 1);
        assert.strictEqual(result, 'ok', 'Mua thành công');

        // Check ví giảm
        let u = await db.getUser(testUser1);
        assert.strictEqual(Number(u.wallet), 4850, 'Ví giảm đi 150đ');

        // Check inventory có bánh mì
        let inv = await db.getInventory(testUser1);
        assert.strictEqual(inv.length, 1, 'Inventory có đúng 1 loại vật phẩm');
        assert.strictEqual(inv[0].item_id, 'banh_mi', 'Đúng vật phẩm banh_mi');
        assert.strictEqual(inv[0].quantity, 1, 'Số lượng là 1');

        // Thử mua vượt số tiền trong ví (mua 100 cái bánh mì = 15000đ khi ví có 4850đ)
        result = await db.buyItem(testUser1, 'banh_mi', 100);
        assert.strictEqual(result, 'insufficient_funds', 'Không đủ tiền mua');
    });

    test('Integration: Gekka Bakery - quy trình mở tiệm, thuê nv, trang trí và thu hoạch v2', async () => {
        // 1. Dọn sạch tiệm cũ của testUser1 và đặt ví = 100k
        await supabase.from('bakeries').delete().eq('user_id', testUser1);
        await db.getUser(testUser1);
        await supabase.from('users').update({ wallet: 100000 }).eq('user_id', testUser1);
        // Đưa 'bo_lam_banh' vào kho để mở tiệm (được map làm TOOL trong config)
        await supabase.from('inventory').insert([{ user_id: testUser1, item_id: 'bo_lam_banh', quantity: 1 }]);

        // 2. Mở tiệm bánh
        let res = await db.bakeryOpen(testUser1, 50000, 'bo_lam_banh');
        assert.strictEqual(res, 'ok', 'Khai trương tiệm bánh thành công');

        // Check DB có bakery chưa
        let bk = await db.getBakery(testUser1);
        assert.ok(bk, 'Tìm thấy tiệm bánh trong DB');
        assert.strictEqual(bk.level, 1, 'Cấp tiệm mặc định là 1');

        // 3. Thuê nhân viên Usami (15k)
        res = await db.bakeryHire(testUser1, 'usami', 15000, 1); // Cấp 1 tối đa 1 người
        assert.strictEqual(res, 'ok', 'Thuê Usami thành công');

        bk = await db.getBakery(testUser1);
        assert.deepStrictEqual(bk.staff, ['usami'], 'Đúng nhân viên usami trong mảng staff');

        // Thử thuê thêm Rintaro khi đã đầy slot (cấp 1 max 1 người) -> limit_reached
        res = await db.bakeryHire(testUser1, 'rintaro', 30000, 1);
        assert.strictEqual(res, 'limit_reached', 'Chặn tuyển quá số lượng cho phép');

        // 4. Trang trí tiệm bánh bằng noi_that
        // Tặng 1 noi_that vào kho đồ trước
        await supabase.from('inventory').insert([{ user_id: testUser1, item_id: 'noi_that', quantity: 1 }]);
        
        res = await db.bakeryDecorate(testUser1, 'noi_that');
        assert.strictEqual(res, 'ok', 'Trang trí tiệm bánh thành công');

        bk = await db.getBakery(testUser1);
        assert.deepStrictEqual(bk.decor, ['noi_that'], 'Nội thất gỗ đã được lưu vào mảng decor');

        // Check kho đồ xem đã bị trừ nội thất chưa
        let hasNoiThat = await db.hasItem(testUser1, 'noi_that');
        assert.strictEqual(hasNoiThat, false, 'Bộ nội thất gỗ đã được chuyển từ kho đồ vào tiệm');

        // 5. Nạp nguyên liệu và nướng nợ (collect v2)
        // Reset stock của tiệm về 10000, đặt last_collect_at về 60 phút trước
        const past = new Date(Date.now() - 60 * 60 * 1000);
        await supabase.from('bakeries').update({
            stock: 10000,
            last_collect_at: past.toISOString()
        }).eq('user_id', testUser1);

        // Thu hoạch: rate 20, cap 12000, cakeEvery 15000, wage 4% (0.04 - của Usami)
        // Với 60 phút trôi qua và rate 20, gross revenue = 60 * 20 = 1200.
        // Lương usami: 1200 * 0.04 = 48. Net = 1200 - 48 = 1152.
        const collectRes = await db.bakeryCollectV2(testUser1, 20, 12000, 15000, 0.04);
        assert.strictEqual(collectRes.result, 'ok', 'Thu hoạch v2 thành công');
        assert.strictEqual(Number(collectRes.revenue), 1152, 'Doanh thu ròng sau thuế chính xác');
        assert.strictEqual(Number(collectRes.wage_deducted), 48, 'Thuế/lương khấu trừ chính xác');

        // 6. Sa thái nhân viên
        res = await db.bakeryFire(testUser1, 'usami');
        assert.strictEqual(res, 'ok', 'Sa thải Usami thành công');

        bk = await db.getBakery(testUser1);
        assert.deepStrictEqual(bk.staff, [], 'Mảng nhân viên đã trống');
    });
}
