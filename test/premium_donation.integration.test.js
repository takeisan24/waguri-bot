// ============================================================
// test/premium_donation.integration.test.js — luồng ủng hộ/Premium chạy THẬT qua DB.
//
// VÌ SAO CẦN: `test/premium_hub.test.js` chỉ kiểm phần dựng embed (mock DB). Phần dễ
// gây thiệt hại thật lại nằm ở tầng dưới — RPC 0131 và bộ định tuyến theo `kind` trong
// `approveAndThank`. Nếu định tuyến sai, người ủng hộ 10k bị cấp Premium, hoặc người mua
// Premium chỉ nhận huy hiệu; cả hai đều là chuyện tiền thật và không có gì đỏ lên.
//
// Cũng bắt luôn lớp lỗi "RPC đã đổi mà JS chưa đổi": các hàm ở đây gọi Postgres THẬT,
// không phải bản giả — đúng bài học từ market_prices (hạ tầng còn sống, không ai ghi vào).
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
    test('Bỏ qua Premium/Donation Integration — thiếu TEST_SUPABASE_* (tránh đụng prod)', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;
    const { approveAndThank } = require('../src/lib/premiumOrders');
    const config = require('../src/config');

    const U = 'zz_donate_it';
    const BADGE = config.PREMIUM.SUPPORTER_BADGE;

    // Client Discord giả: ghi lại DM thay vì gửi thật. `approveAndThank` phải gọi được
    // trên nó mà không ném — DM hỏng KHÔNG được phép chặn việc cấp hàng đã trả tiền.
    const dmDaGui = [];
    const clientGia = {
        users: {
            fetch: async id => ({
                username: 'NguoiUngHo',
                send: async noiDung => { dmDaGui.push({ id, noiDung }); },
            }),
        },
    };

    async function donDep() {
        await supabase.from('user_badges').delete().eq('user_id', U);
        await supabase.from('premium_orders').delete().eq('user_id', U);
        await supabase.from('users').delete().eq('user_id', U);
    }
    const layUser = async () => (await supabase.from('users').select('*').eq('user_id', U).maybeSingle()).data;
    const coHuyHieu = async () => !!(await supabase.from('user_badges')
        .select('badge_id').eq('user_id', U).eq('badge_id', BADGE).maybeSingle()).data;

    test.before(async () => { await donDep(); });
    test.after(async () => { await donDep(); });

    test('ủng hộ tuỳ tâm: cấp huy hiệu, TUYỆT ĐỐI không đụng premium_until', async () => {
        const don = await db.createDonationOrder(U, 0);
        assert.ok(don?.code?.startsWith('WAGURI'), 'không tạo được đơn ủng hộ');
        assert.strictEqual(don.kind, 'donate');
        assert.strictEqual(don.amount, 0, 'ủng hộ tuỳ tâm phải để số tiền = 0');

        dmDaGui.length = 0;
        const r = await approveAndThank(clientGia, don.code, 'test');
        assert.strictEqual(r.ok, true, `duyệt thất bại: ${r.reason}`);
        assert.strictEqual(r.kind, 'donate', 'định tuyến sai loại đơn');
        assert.strictEqual(r.dmSent, true, 'phải DM cảm ơn người ủng hộ');
        assert.strictEqual(dmDaGui.length, 1);
        assert.match(dmDaGui[0].noiDung, /💝/, 'DM phải nhắc tới huy hiệu ủng hộ');

        assert.ok(await coHuyHieu(), 'không cấp huy hiệu');
        const u = await layUser();
        assert.strictEqual(u.premium_until, null, 'ỦNG HỘ KHÔNG ĐƯỢC MUA ĐƯỢC PREMIUM');
    });

    test('duyệt lại đơn ủng hộ: idempotent, không DM lần hai', async () => {
        const don = (await supabase.from('premium_orders').select('code')
            .eq('user_id', U).eq('kind', 'donate').limit(1)).data[0];
        dmDaGui.length = 0;
        const r = await approveAndThank(clientGia, don.code, 'test');
        assert.strictEqual(r.already, true, 'không idempotent');
        assert.strictEqual(dmDaGui.length, 0, 'không được cảm ơn hai lần cho một lần ủng hộ');
    });

    test('CHỐT CHẶN: đơn ủng hộ không lọt qua đường Premium', async () => {
        const don = await db.createDonationOrder(U, 20000);
        const r = await db.approvePremiumOrder(don.code, 'test');
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'wrong_kind', 'đơn donate LỌT qua đường Premium!');
        const u = await layUser();
        assert.strictEqual(u.premium_until, null, 'premium_until bị ghi đè bởi đơn ủng hộ');
    });

    test('mua Premium: cộng hạn, DM cảm ơn, định tuyến đúng loại', async () => {
        const goi = config.PREMIUM.PLANS.m1;
        const don = await db.createPremiumOrder(U, 'm1', goi.months, goi.amount);
        assert.strictEqual(don.kind, 'premium');
        assert.strictEqual(don.amount, goi.amount, 'giá gói phải khớp config');

        dmDaGui.length = 0;
        const r = await approveAndThank(clientGia, don.code, 'test');
        assert.strictEqual(r.ok, true);
        assert.strictEqual(r.kind, 'premium', 'định tuyến sai loại đơn');
        assert.strictEqual(r.months, goi.months);
        assert.strictEqual(dmDaGui.length, 1, 'phải DM cảm ơn người mua');

        const u = await layUser();
        assert.ok(new Date(u.premium_until).getTime() > Date.now(), 'chưa cộng hạn Premium');
    });

    test('CHỐT CHẶN ngược: đơn Premium không lọt qua đường ủng hộ', async () => {
        const don = await db.createPremiumOrder(U, 'm3', 3, 60000);
        const r = await db.approveDonation(don.code, 'test', BADGE);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'wrong_kind', 'đơn Premium LỌT qua đường ủng hộ!');
    });

    test('báo "đã chuyển khoản" chỉ ăn MỘT LẦN và chỉ bởi chủ đơn', async () => {
        const don = await db.createDonationOrder(U, 0);

        // Người lạ báo hộ -> không được, nếu không thì ai cũng làm phiền owner được.
        assert.strictEqual(await db.claimOrderOnce(don.code, 'zz_ke_la'), null,
            'người KHÔNG phải chủ đơn vẫn báo được!');

        const lan1 = await db.claimOrderOnce(don.code, U);
        assert.ok(lan1, 'chủ đơn báo lần đầu phải thành công');
        assert.strictEqual(lan1.kind, 'donate');

        assert.strictEqual(await db.claimOrderOnce(don.code, U), null,
            'bấm lại vẫn báo được -> owner bị làm phiền nhiều lần cho một đơn');
    });

    test('bảng vinh danh gộp đúng theo người và chỉ đếm đơn ĐÃ duyệt', async () => {
        const ds = await db.getSupporters(10);
        const toi = ds.find(s => s.user_id === U);
        assert.ok(toi, 'người đã ủng hộ không xuất hiện trong bảng vinh danh');
        // Chỉ đơn ủng hộ ĐÃ duyệt mới tính: đơn 20.000đ ở trên bị wrong_kind nên vẫn
        // pending, và đơn Premium thì không phải ủng hộ -> tổng phải là 0 (đơn tuỳ tâm).
        assert.strictEqual(toi.total, 0, `đếm nhầm đơn chưa duyệt / đơn Premium (total=${toi.total})`);
    });
}
