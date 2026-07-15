require('../src/lib/envLoader');
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
    test('Bỏ qua Auction Integration Test — thiếu TEST_SUPABASE_* (không chạy để tránh đụng prod)', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;

    const seller = 'test_seller_auction_auto';
    const bidder1 = 'test_bidder_1_auction_auto';
    const bidder2 = 'test_bidder_2_auction_auto';

    async function cleanup() {
        await supabase.from('inventory').delete().in('user_id', [seller, bidder1, bidder2]);
        await supabase.from('auctions').delete().in('seller_id', [seller]);
        await supabase.from('users').delete().in('user_id', [seller, bidder1, bidder2]);
    }

    test.before(async () => {
        await cleanup();
    });

    test.after(async () => {
        await cleanup();
    });

    test('Integration: Đầy đủ vòng đời đấu giá & các chốt chặn an toàn', async () => {
        // 1. Tạo dữ liệu người dùng
        await supabase.from('users').insert([
            { user_id: seller, wallet: 10000 },
            { user_id: bidder1, wallet: 20000 },
            { user_id: bidder2, wallet: 30000 }
        ]);

        // 2. Cho seller 5 tấm gỗ (item 'go')
        await supabase.from('inventory').insert({
            id: '9f583e7b-cd78-4357-9dbd-c116c4961556',
            user_id: seller,
            item_id: 'go',
            quantity: 5
        });

        // 3. Tạo đấu giá bán 3 tấm gỗ
        const rCreate = await db.createAuction(seller, 'go', 3, 1000, 200, 24, 'guild_test', 'channel_test');
        assert.ok(rCreate);
        assert.strictEqual(rCreate.status, 'ok', 'Tạo đấu giá thành công');
        const auctionId = rCreate.id;

        // Xác nhận trừ đồ và thu phí đăng bài
        const { data: invSeller } = await supabase.from('inventory').select('*').eq('user_id', seller).single();
        assert.strictEqual(Number(invSeller.quantity), 2, 'Seller còn lại 2 gỗ');
        const { data: uSeller } = await supabase.from('users').select('wallet').eq('user_id', seller).single();
        assert.strictEqual(Number(uSeller.wallet), 9000, 'Seller bị trừ 1000 xu phí đăng tin');

        // 4. Kiểm tra các lỗi chặn đặt giá (Bidding validation)
        // Shill bidding (người bán tự nâng giá)
        const rShill = await db.placeBid(seller, auctionId, 1500);
        assert.strictEqual(rShill.status, 'own', 'Chặn người bán tự bid thành công');

        // Under bidding (bid thấp hơn starting_bid)
        const rLow = await db.placeBid(bidder1, auctionId, 500);
        assert.strictEqual(rLow.status, 'low_bid', 'Chặn bid dưới giá khởi điểm');

        // 5. Đặt giá hợp lệ: Bidder 1 bid 1200 xu
        const rBid1 = await db.placeBid(bidder1, auctionId, 1200);
        assert.strictEqual(rBid1.status, 'ok', 'Bidder 1 đặt giá thành công');

        // Kiểm tra tiền của Bidder 1 bị trừ (Escrow)
        const { data: uB1 } = await supabase.from('users').select('wallet').eq('user_id', bidder1).single();
        assert.strictEqual(Number(uB1.wallet), 18800, 'Ví Bidder 1 bị trừ tiền tạm giữ');

        // 6. Đặt giá đè (Outbid): Bidder 2 bid 1500 xu
        const rBid2 = await db.placeBid(bidder2, auctionId, 1500);
        assert.strictEqual(rBid2.status, 'ok', 'Bidder 2 outbid thành công');
        assert.strictEqual(rBid2.previous_bidder_id, bidder1, 'Trả về ID người bị outbid');
        assert.strictEqual(Number(rBid2.previous_bid_amount), 1200, 'Trả về số tiền cần hoàn cho người bị outbid');

        // Kiểm tra hoàn tiền Bidder 1 và trừ tiền Bidder 2
        const [resB1, resB2] = await Promise.all([
            supabase.from('users').select('wallet').eq('user_id', bidder1).single(),
            supabase.from('users').select('wallet').eq('user_id', bidder2).single()
        ]);
        assert.strictEqual(Number(resB1.data.wallet), 20000, 'Bidder 1 được hoàn tiền 100%');
        assert.strictEqual(Number(resB2.data.wallet), 28500, 'Bidder 2 bị trừ tiền tạm giữ mới');

        // 7. Thử huỷ phiên đấu giá khi đã có người đặt giá
        const rCancel = await db.cancelAuction(seller, auctionId);
        assert.strictEqual(rCancel.status, 'has_bids', 'Chặn huỷ phiên đấu giá khi đã có người đặt giá');

        // 8. Kiểm thử GDPR: Chặn xoá tài khoản khi có liên kết đấu giá hoạt động
        const delSeller = await supabase.rpc('delete_user_data', { p_user_id: seller });
        assert.strictEqual(delSeller.data || delSeller, 'blocked_active_auctions', 'Chặn xoá tài khoản seller đang đấu giá');

        const delBidder = await supabase.rpc('delete_user_data', { p_user_id: bidder2 });
        assert.strictEqual(delBidder.data || delBidder, 'blocked_active_bids', 'Chặn xoá tài khoản bidder đang dẫn đầu');

        // 9. Giả lập hết hạn và phân giải phiên đấu giá
        // Cập nhật ends_at về quá khứ
        await supabase.from('auctions').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', auctionId);

        // Chạy resolveExpiredAuctions
        const resolved = await db.resolveExpiredAuctions(0.05); // 5% thuế
        assert.strictEqual(resolved.length, 1, 'Phân giải thành công 1 phiên đấu giá');
        assert.strictEqual(resolved[0].outcome, 'sold', 'Phiên đấu giá được bán thành công');
        assert.strictEqual(Number(resolved[0].net_payout), 1425, 'Người bán nhận được 1425 xu (1500 - 5% thuế)');

        // Xác nhận người mua nhận được đồ và người bán nhận được tiền
        const [resSeller, resInvB2] = await Promise.all([
            supabase.from('users').select('wallet').eq('user_id', seller).single(),
            supabase.from('inventory').select('*').eq('user_id', bidder2).single()
        ]);
        assert.strictEqual(Number(resSeller.data.wallet), 10425, 'Ví seller nhận tiền sau thuế: 9000 + 1425 = 10425');
        assert.strictEqual(Number(resInvB2.data.quantity), 3, 'Người mua nhận được 3 gỗ trong kho');
    });
}
