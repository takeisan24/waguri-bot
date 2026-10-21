// Cột `users.locale` — test TÍCH HỢP trên DB thật (waguri-test).
//
// Vì sao cần chạy trên DB thật chứ không giả lập: lỗi gốc là **cột không tồn tại**.
// Mọi test dùng hàm giả đều xanh trong khi tính năng chết ngoài đời — đúng cái bẫy mà
// WORKFLOW §4.8 đã cảnh báo ("npm test từng xanh 105/105 trong khi tồn tại máy in tiền").
// Chỉ có ghi thật vào DB thật mới chứng minh được migration 0110 đã ăn.
//
// Đồng thời khoá luôn phép chuẩn hoá: Discord gửi mã kèm vùng (`en-US`), phép so
// `locale === 'en'` cũ đẩy MỌI người dùng tiếng Anh xuống 'vi' — ghi sai vĩnh viễn.

require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert');

const hasTestDb = process.env.ENABLE_TEST_SUPABASE === 'true' &&
                  process.env.TEST_SUPABASE_URL &&
                  process.env.TEST_SUPABASE_SERVICE_KEY &&
                  !process.env.TEST_SUPABASE_URL.includes('dummy');

if (!hasTestDb) {
    test('Bỏ qua test cột users.locale — thiếu TEST_SUPABASE_*', () => assert.ok(true));
} else {
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;

    const db = require('../src/database');
    const { supabase } = db;
    const nguoiTest = 'zz_locale_integration_test';

    const doc = async () => {
        const { data } = await supabase.from('users').select('locale').eq('user_id', nguoiTest).single();
        return data?.locale ?? null;
    };
    const don = () => supabase.from('users').delete().eq('user_id', nguoiTest);

    test('users.locale — cột có thật và ghi đúng', async t => {
        await don();
        await supabase.from('users').insert({ user_id: nguoiTest });

        await t.test('người mới chưa có ngôn ngữ -> NULL, KHÔNG bị điền sẵn', async () => {
            // Nếu ai đó áp nhầm 0080 (NOT NULL DEFAULT 'vi'), ô này sẽ là 'vi' và tầng i18n
            // sẽ khoá cứng mọi người vào tiếng Việt. NULL = "chưa biết" mới đúng.
            assert.strictEqual(await doc(), null, 'phải là NULL, không được có giá trị mặc định');
        });

        await t.test("mã có vùng 'en-US' phải lưu thành 'en'", async () => {
            const ok = await db.updateUserLocale(nguoiTest, 'en-US');
            assert.strictEqual(ok, true, 'ghi phải THÀNH CÔNG — cột tồn tại');
            assert.strictEqual(await doc(), 'en', "'en-US' phải thành 'en', KHÔNG phải 'vi'");
        });

        await t.test("'vi-VN' -> 'vi'", async () => {
            await db.updateUserLocale(nguoiTest, 'vi-VN');
            assert.strictEqual(await doc(), 'vi');
        });

        await t.test('ngôn ngữ không hỗ trợ -> rơi về vi, không ghi rác vào DB', async () => {
            await db.updateUserLocale(nguoiTest, 'fr-FR');
            assert.strictEqual(await doc(), 'vi', 'phải chuẩn hoá, không được ghi thẳng fr-FR');
        });

        await t.test('CHECK ở tầng DB chặn giá trị ngoài danh sách', async () => {
            const { error } = await supabase.from('users')
                .update({ locale: 'xx_rac' }).eq('user_id', nguoiTest);
            assert.ok(error, 'DB phải từ chối giá trị không nằm trong (vi, en)');
            assert.strictEqual(await doc(), 'vi', 'giá trị cũ giữ nguyên');
        });

        await don();
    });

    // 0156: ngôn ngữ TỰ CHỌN qua /language không được bị tầng học (app Discord) ghi đè.
    test('users.locale_chosen — lựa chọn của người dùng thắng ngôn ngữ học được', async t => {
        const docCo = async () => {
            const { data } = await supabase.from('users').select('locale, locale_chosen').eq('user_id', nguoiTest).single();
            return data;
        };
        await don();

        await t.test('người mới: locale_chosen = false (chưa ai chọn)', async () => {
            await supabase.from('users').insert({ user_id: nguoiTest });
            assert.strictEqual((await docCo()).locale_chosen, false);
        });

        await t.test("/language vi -> locale 'vi', chosen = true", async () => {
            assert.strictEqual(await db.setUserLocaleChoice(nguoiTest, 'vi'), true);
            assert.deepStrictEqual(await docCo(), { locale: 'vi', locale_chosen: true });
        });

        await t.test('app Discord tiếng Anh KHÔNG ghi đè lựa chọn', async () => {
            await db.updateUserLocale(nguoiTest, 'en-US');
            assert.deepStrictEqual(await docCo(), { locale: 'vi', locale_chosen: true });
        });

        await t.test('/language auto -> bỏ chọn, tầng học được ghi lại', async () => {
            assert.strictEqual(await db.setUserLocaleChoice(nguoiTest, 'auto'), true);
            assert.strictEqual((await docCo()).locale_chosen, false);
            await db.updateUserLocale(nguoiTest, 'en-US');
            assert.deepStrictEqual(await docCo(), { locale: 'en', locale_chosen: false });
        });

        await t.test('người chưa có hàng: /language tự tạo hàng chứ không "thành công" suông', async () => {
            await don();
            assert.strictEqual(await db.setUserLocaleChoice(nguoiTest, 'en'), true);
            assert.deepStrictEqual(await docCo(), { locale: 'en', locale_chosen: true });
        });

        await don();
    });
}
