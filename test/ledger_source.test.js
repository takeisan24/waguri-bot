// Sổ nhật ký phải phân biệt được NGUỒN tiền — điều kiện cần để chỉnh cân bằng kinh tế.
//
// Bối cảnh (đo 2026-08-15): `economy_ledger` có 730/730 dòng đều mang nhãn
// `increment_balance`, vì `db.addMoney()` là helper dùng chung cho thưởng chat, thưởng
// lệnh và admin cấp tiền. Không biết tiền từ đâu ra thì không có căn cứ để chỉnh số nào.
//
// Nguồn nay suy từ NGĂN XẾP LỜI GỌI JS (không phải tham số truyền tay ở 39 chỗ gọi), nên
// test phải gọi từ các file khác nhau mới kiểm được — dùng file phụ trong `test/helpers/`.

require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');

const hasTestDb = process.env.ENABLE_TEST_SUPABASE === 'true' &&
                  process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (!hasTestDb) {
    test('Bỏ qua test nguồn sổ nhật ký — thiếu TEST_SUPABASE_*', () => assert.ok(true));
} else {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;

    const db = require('../src/database');
    const { supabase } = db;
    const goiHo = require('./helpers/ledgerCaller');
    const NGUOI = 'zz_ledger_source_test';

    const nguonMoiNhat = async () => {
        const { data } = await supabase.from('economy_ledger')
            .select('source, delta').eq('user_id', NGUOI).order('at', { ascending: false }).limit(1);
        return data?.[0] || null;
    };
    const don = async () => {
        await supabase.from('economy_ledger').delete().eq('user_id', NGUOI);
        await supabase.from('users').delete().eq('user_id', NGUOI);
    };

    test('Sổ nhật ký — phân biệt nguồn tiền', async t => {
        await don();

        await t.test('gọi từ file test -> nhãn mang tên file gọi, KHÔNG phải increment_balance', async () => {
            const ok = await db.addMoney(NGUOI, 100, 'wallet');
            assert.strictEqual(ok, true, 'cộng tiền thành công');
            const r = await nguonMoiNhat();
            assert.strictEqual(Number(r.delta), 100);
            assert.notStrictEqual(r.source, 'increment_balance',
                'nhãn phải là nguồn thật, không phải tên helper dùng chung');
        });

        await t.test('gọi từ file KHÁC -> nhãn ĐỔI theo nơi gọi', async () => {
            const truoc = (await nguonMoiNhat()).source;
            await goiHo.congTien(db, NGUOI, 70);
            const sau = (await nguonMoiNhat()).source;
            assert.strictEqual(sau, 'ledgerCaller', 'nhãn phải theo file thật sự gọi');
            assert.notStrictEqual(sau, truoc, 'hai nơi gọi khác nhau phải ra hai nhãn khác nhau');
        });

        await t.test('KHÔNG rò nhãn giữa các lời gọi liên tiếp', async () => {
            // Từng sai: nếu chỉ đặt biến phiên KHI CÓ nguồn thì lời gọi sau thừa hưởng nhãn
            // của lời gọi trước. Nay luôn ghi đè nên mỗi lời gọi độc lập.
            await goiHo.congTien(db, NGUOI, 10);
            assert.strictEqual((await nguonMoiNhat()).source, 'ledgerCaller');
            await db.addMoney(NGUOI, 10, 'wallet');
            assert.notStrictEqual((await nguonMoiNhat()).source, 'ledgerCaller',
                'lời gọi sau KHÔNG được mang nhãn của lời gọi trước');
        });

        await t.test('trừ tiền cũng được ghi sổ (dòng âm)', async () => {
            await db.addMoney(NGUOI, -50, 'wallet');
            const r = await nguonMoiNhat();
            assert.strictEqual(Number(r.delta), -50, 'chi ra phải vào sổ với delta âm');
        });

        await don();
    });
}
