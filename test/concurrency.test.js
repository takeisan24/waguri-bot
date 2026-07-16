// test/concurrency.test.js — Regression test ĐUA (race) cho các fix nguyên tử của audit 2026-07.
// Bắn N lời gọi SONG SONG (Promise.all -> N phiên Postgres đồng thời) và khẳng định chỉ 1 thành công.
// AN TOÀN: chỉ chạy trên DB TEST (TEST_SUPABASE_*); không có -> SKIP. Cần migration 0087/0088 đã apply.
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

const N = 8; // số lời gọi đồng thời

if (!hasTestDb) {
    test('Bỏ qua Concurrency Test — thiếu TEST_SUPABASE_* (tránh đụng prod)', () => {
        assert.ok(true);
    });
} else {
    const db = require('../src/database');
    const { supabase } = db;

    const U = 'discord_concurrency_test_user';
    const CLAN_NAME = 'concurrency_test_clan_zzz';
    const EV_MARK = 'concurrency_test_evt';

    async function cleanup() {
        await supabase.from('inventory').delete().eq('user_id', U);
        await supabase.from('user_badges').delete().eq('user_id', U);
        await supabase.from('quest_progress').delete().eq('user_id', U);
        await supabase.from('world_event_contributions').delete().eq('user_id', U);
        await supabase.from('world_events').delete().eq('target_type', EV_MARK);
        // Rời + xoá bang test (nếu có)
        const clan = await db.clanByName(CLAN_NAME);
        if (clan) {
            await supabase.from('clan_upgrades').delete().eq('clan_id', clan.id);
            await supabase.from('users').update({ clan_id: null }).eq('clan_id', clan.id);
            await supabase.from('clans').delete().eq('id', clan.id);
        }
        await supabase.from('users').delete().eq('user_id', U);
    }

    test.before(cleanup);
    test.after(cleanup);

    // H9 — sell_item: bán 1 vật phẩm qty=1 nhiều lần đồng thời -> chỉ 1 lần 'ok', cộng tiền ĐÚNG 1 lần.
    test('Race H9: sell_item không nhân đôi tiền khi bán đúp', async () => {
        await db.getUser(U);
        await supabase.from('users').update({ wallet: 0, bank: 0 }).eq('user_id', U);
        await supabase.from('inventory').delete().eq('user_id', U);
        await supabase.from('inventory').insert([{ user_id: U, item_id: 'banh_mi', quantity: 1 }]);

        const results = await Promise.all(Array.from({ length: N }, () => db.sellItem(U, 'banh_mi', 1)));
        const okCount = results.filter(r => r && r.status === 'ok').length;
        assert.strictEqual(okCount, 1, `Chỉ 1 lần bán thành công (thực tế ${okCount})`);

        const gain = Math.floor(150 * 0.5) * 1; // banh_mi giá 150 -> 75
        const u = await db.getUser(U);
        assert.strictEqual(Number(u.wallet), gain, `Ví chỉ được cộng 1 lần = ${gain} (thực tế ${u.wallet})`);

        const { data: inv } = await supabase.from('inventory').select('quantity').eq('user_id', U).eq('item_id', 'banh_mi');
        assert.ok(!inv || inv.length === 0 || Number(inv[0].quantity) === 0, 'Vật phẩm đã hết, không âm kho');
    });

    // H10 — quest_claim: nhận thưởng 1 nhiệm vụ nhiều lần đồng thời -> chỉ 1 lần 'ok'.
    test('Race H10: quest_claim không trả thưởng 2 lần', async () => {
        await db.getUser(U);
        await supabase.from('users').update({ wallet: 0 }).eq('user_id', U);
        await supabase.from('quest_progress').delete().eq('user_id', U);
        const quest = { id: 'race_q', key: 'race_key', required: 1, reward: 1000 };
        await db.questIncr(U, quest.key, 1); // hoàn thành điều kiện

        const results = await Promise.all(Array.from({ length: N }, () => db.questClaim(U, quest)));
        const okCount = results.filter(r => r === 'ok').length;
        assert.strictEqual(okCount, 1, `Chỉ 1 lần nhận thưởng (thực tế ${okCount})`);

        const u = await db.getUser(U);
        assert.strictEqual(Number(u.wallet), quest.reward, `Ví chỉ cộng 1 lần = ${quest.reward} (thực tế ${u.wallet})`);
    });

    // M1 — unlockBadge: mở khoá 1 huy hiệu nhiều lần đồng thời -> chỉ 1 lần trả TRUE (chống double-charge).
    test('Race M1: unlockBadge chỉ báo "mới" đúng 1 lần', async () => {
        await db.getUser(U);
        await supabase.from('user_badges').delete().eq('user_id', U);

        const results = await Promise.all(Array.from({ length: N }, () => db.unlockBadge(U, 'race_badge')));
        const trueCount = results.filter(r => r === true).length;
        assert.strictEqual(trueCount, 1, `Chỉ 1 lần chèn mới (thực tế ${trueCount})`);

        const { data: rows } = await supabase.from('user_badges').select('badge_id').eq('user_id', U).eq('badge_id', 'race_badge');
        assert.strictEqual(rows.length, 1, 'Chỉ tồn tại đúng 1 dòng huy hiệu');
    });

    // M2 — clan_deposit_resource: N lần nạp đồng thời -> tổng KHÔNG bị mất (lost update).
    test('Race M2: clan_deposit_resource cộng đủ, không mất contribution', async () => {
        await db.getUser(U);
        await supabase.from('users').update({ wallet: 1_000_000, clan_id: null }).eq('user_id', U);
        // Dọn bang cũ nếu còn
        const old = await db.clanByName(CLAN_NAME);
        if (old) { await supabase.from('users').update({ clan_id: null }).eq('clan_id', old.id); await supabase.from('clans').delete().eq('id', old.id); }
        await db.clanCreate(U, CLAN_NAME);
        const clan = await db.clanByName(CLAN_NAME);
        assert.ok(clan, 'Tạo bang test thành công');

        const PER = 10;
        await Promise.all(Array.from({ length: N }, () => db.clanDepositResource(clan.id, 'tam_go', PER)));

        const { data: fresh } = await supabase.from('clans').select('resources').eq('id', clan.id).single();
        const total = Number((fresh.resources || {}).tam_go || 0);
        assert.strictEqual(total, N * PER, `Tổng tài nguyên = ${N * PER} (thực tế ${total}) — không lost update`);
    });

    // H1 — claimWorldEventReward: nhận thưởng sự kiện nhiều lần đồng thời -> chỉ 1 lần 'ok'.
    test('Race H1: claimWorldEventReward không nhân bản phần thưởng', async () => {
        await db.getUser(U);
        await supabase.from('world_event_contributions').delete().eq('user_id', U);
        await supabase.from('world_events').delete().eq('target_type', EV_MARK);

        const { data: ev, error: evErr } = await supabase.from('world_events')
            .insert([{ target_type: EV_MARK, target_amount: 100, ends_at: new Date(Date.now() + 3600_000).toISOString(), completed: true }])
            .select().single();
        assert.ok(!evErr && ev, 'Tạo world_event completed');
        await supabase.from('world_event_contributions').insert([{ event_id: ev.id, user_id: U, amount: 100, claimed: false }]);

        const results = await Promise.all(Array.from({ length: N }, () => db.claimWorldEventReward(U, ev.id)));
        const okCount = results.filter(r => r === 'ok').length;
        assert.strictEqual(okCount, 1, `Chỉ 1 lần claim 'ok' (thực tế ${okCount})`);
    });
}
