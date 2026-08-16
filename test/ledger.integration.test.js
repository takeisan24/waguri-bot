// ============================================================
// test/ledger.integration.test.js — Nhật ký giao dịch (migration 0104/0105)
//
// VÌ SAO CẦN: ledger được ghi bằng TRIGGER, không phải bằng code JS. Nghĩa là nó
// vô hình với mọi test thuần JS — chỉ cần ai đó DROP nhầm trigger hoặc một
// migration sau ghi đè `log_money_change()` là toàn bộ khả năng truy vết biến mất
// mà KHÔNG có gì đỏ lên. Đây đúng lớp lỗi đã xảy ra với `market_prices`: hạ tầng
// còn sống nhưng không ai ghi vào, và không có gì phát hiện.
//
// AN TOÀN: chỉ chạy trên DB TEST (TEST_SUPABASE_*), tự SKIP nếu thiếu biến.
// ============================================================
require('../src/lib/envLoader');
const test = require('node:test');
const assert = require('node:assert');

const hasTestDb = process.env.ENABLE_TEST_SUPABASE === 'true' &&
                  process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (hasTestDb) {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
}

if (!hasTestDb) {
    test('Bỏ qua Ledger Integration Test — thiếu TEST_SUPABASE_* (tránh đụng prod)', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const U = 'zz_ledger_it';

    async function cleanup() {
        await supabase.from('inventory').delete().eq('user_id', U);
        await supabase.from('users').delete().eq('user_id', U);
        await supabase.from('economy_ledger').delete().eq('user_id', U);
    }
    const ledgerRows = async () => (await supabase
        .from('economy_ledger').select('*').eq('user_id', U).order('id')).data || [];

    test.before(async () => {
        await cleanup();
        await supabase.from('users').insert({ user_id: U, wallet: 0, username: 'LedgerIT' });
    });
    test.after(cleanup);

    test('Ledger: đổi ví SINH dòng nhật ký đúng delta & số dư sau', async () => {
        await supabase.from('economy_ledger').delete().eq('user_id', U);
        assert.strictEqual(await db.addMoney(U, 5000, 'wallet'), true);

        const rows = await ledgerRows();
        assert.strictEqual(rows.length, 1, 'phải có đúng 1 dòng');
        assert.strictEqual(rows[0].kind, 'wallet');
        assert.strictEqual(Number(rows[0].delta), 5000);
        assert.strictEqual(Number(rows[0].balance_after), 5000);
        // Hợp đồng ĐỔI ở đợt 5 (migration 0117): trước đây nhãn là 'increment_balance' —
        // tên helper DÙNG CHUNG, khiến 730/730 dòng sổ đều một nhãn và không chỉnh cân bằng
        // kinh tế được. Nay `addMoney` suy nguồn từ ngăn xếp lời gọi JS nên nhãn là NƠI GỌI.
        assert.notStrictEqual(rows[0].source, 'users',
            'không được bắt nhầm tên BẢNG');
        assert.notStrictEqual(rows[0].source, 'increment_balance',
            'không được dừng ở tên helper dùng chung — phải truy ra nơi gọi thật');
        assert.strictEqual(rows[0].source, 'ledger.integration.test',
            'nhãn phải là file đã gọi addMoney');
    });

    test('Ledger: đổi NĂNG LƯỢNG / ĐỘ BỀN thì KHÔNG ghi (chống phình vô ích)', async () => {
        await supabase.from('economy_ledger').delete().eq('user_id', U);

        await supabase.from('users').update({ energy: 42 }).eq('user_id', U);
        await supabase.from('inventory').upsert(
            { user_id: U, item_id: 'go', quantity: 5 }, { onConflict: 'user_id,item_id' });
        await supabase.from('economy_ledger').delete().eq('user_id', U); // bỏ dòng do upsert kho sinh ra
        await supabase.from('inventory').update({ durability: 55 }).eq('user_id', U).eq('item_id', 'go');

        assert.deepStrictEqual(await ledgerRows(), [],
            'chỉ đổi năng lượng/độ bền mà vẫn ghi log = ledger sẽ phình vô nghĩa');
    });

    test('Ledger: bán vật phẩm ghi ĐỦ CẢ HAI vế (trừ kho + cộng ví)', async () => {
        await supabase.from('inventory').upsert(
            { user_id: U, item_id: 'go', quantity: 10 }, { onConflict: 'user_id,item_id' });
        await supabase.from('economy_ledger').delete().eq('user_id', U);

        const res = await db.sellItemMarket(U, 'go', 4);
        assert.ok(res && res.success, 'bán phải thành công');

        const rows = await ledgerRows();
        const item = rows.find(r => r.kind === 'item');
        const money = rows.find(r => r.kind === 'wallet');
        assert.ok(item, 'thiếu dòng trừ kho');
        assert.ok(money, 'thiếu dòng cộng ví');
        assert.strictEqual(Number(item.delta), -4);
        assert.strictEqual(item.item_id, 'go');
        assert.strictEqual(Number(money.delta), Number(res.earned),
            'số tiền ghi trong ledger phải khớp số tiền RPC báo trả');
        assert.strictEqual(money.source, 'sell_item_market');
    });

    test('Ledger: ledger_user trả về mới -> cũ', async () => {
        const rows = await db.getLedgerUser(U, 10);
        assert.ok(Array.isArray(rows) && rows.length >= 2);
        for (let i = 1; i < rows.length; i++) {
            assert.ok(new Date(rows[i - 1].at) >= new Date(rows[i].at), 'sai thứ tự thời gian');
        }
    });

    test('Ledger: GDPR — delete_user_data xoá SẠCH nhật ký (kể cả dòng do chính nó sinh ra)', async () => {
        // delete_user_data có `DELETE FROM inventory`, câu đó kích hoạt trigger và
        // ghi THÊM dòng ledger cho đúng người đang xin xoá -> trigger purge phải
        // chạy SAU cùng mới dọn hết.
        await supabase.from('inventory').upsert(
            { user_id: U, item_id: 'go', quantity: 3 }, { onConflict: 'user_id,item_id' });
        assert.ok((await ledgerRows()).length > 0, 'cần có dữ liệu trước khi xoá');

        const { data: status } = await supabase.rpc('delete_user_data', { p_user_id: U });
        assert.strictEqual(status, 'ok', 'RPC phải trả chuỗi "ok" (RETURNS TEXT, không phải jsonb)');

        assert.deepStrictEqual(await ledgerRows(), [],
            'xoá dữ liệu theo GDPR mà còn sót nhật ký giao dịch = vi phạm quyền được xoá');

        // dựng lại user cho các lần chạy sau
        await supabase.from('users').insert({ user_id: U, wallet: 0, username: 'LedgerIT' });
    });
}
