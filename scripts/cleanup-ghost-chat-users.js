require('../src/lib/envLoader');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function main() {
    const isExecute = process.argv.includes('--execute');
    console.log(`=======================================================`);
    console.log(`🧹 WAGURI GHOST CHAT USERS CLEANUP`);
    console.log(`Mode: ${isExecute ? '⚡ EXECUTE (APPLY CHANGES)' : '🔍 DRY-RUN (PREVIEW ONLY)'}`);
    console.log(`=======================================================\n`);

    const genuineSql = `
WITH genuine_users AS (
    SELECT DISTINCT user_id FROM (
        SELECT user_id FROM inventory
        UNION SELECT user_id FROM bakeries
        UNION SELECT user_id FROM user_pets
        UNION SELECT user_id FROM plants
        UNION SELECT user_id FROM pigs
        UNION SELECT user_id FROM quest_progress
        UNION SELECT user_id FROM user_discoveries
        UNION SELECT user_id FROM user_study_sessions
        UNION SELECT user_id FROM battle_pass_users
        UNION SELECT user_id FROM user_badges
        UNION SELECT user_id FROM user_collection_rewards
        UNION SELECT user_id FROM bakery_completed_orders
        UNION SELECT liker_id as user_id FROM bakery_likes
        UNION SELECT user_id FROM lottery_tickets
        UNION SELECT borrower_id as user_id FROM loans
        UNION SELECT lender_id as user_id FROM loans
        UNION SELECT user_id FROM redeem_claims
        UNION SELECT user_id FROM world_event_contributions
        UNION SELECT user_id FROM cooldowns
        UNION SELECT user_id FROM economy_ledger WHERE source != 'chat'
        UNION SELECT user_id FROM users WHERE
            bank > 0 OR
            daily_streak > 0 OR
            last_daily IS NOT NULL OR
            job_id IS NOT NULL OR
            partner_id IS NOT NULL OR
            affection > 0 OR
            ai_used > 0 OR
            love > 0 OR
            clan_id IS NOT NULL OR
            (badges IS NOT NULL AND badges::text != '[]' AND badges::text != '{}') OR
            prestige > 0 OR
            claimed_support_gift = true OR
            study_streak > 0 OR
            study_points > 0 OR
            total_study_minutes > 0 OR
            story_chapter > 1 OR
            story_node > 1 OR
            affection_points > 0 OR
            (ai_memory IS NOT NULL AND ai_memory::text != '{}' AND ai_memory::text != 'null')
    ) g
)
`;

    // 1. Thống kê tổng quan
    const statsQuery = `${genuineSql}
SELECT 
    (SELECT count(*) FROM users) as total_users,
    (SELECT count(*) FROM genuine_users) as genuine_count,
    (SELECT count(*) FROM users WHERE user_id NOT IN (SELECT user_id FROM genuine_users)) as ghost_count,
    (SELECT count(*) FROM users WHERE user_id NOT IN (SELECT user_id FROM genuine_users) AND (exp > 0 OR wallet > 0)) as active_ghost_count,
    (SELECT coalesce(sum(wallet), 0) FROM users WHERE user_id NOT IN (SELECT user_id FROM genuine_users)) as ghost_wallet_sum,
    (SELECT coalesce(sum(exp), 0) FROM users WHERE user_id NOT IN (SELECT user_id FROM genuine_users)) as ghost_exp_sum;
`;



    // Lấy danh sách ID genuine
    const { data: allUsers, error: userErr } = await supabase.from('users').select('user_id, exp, wallet, ai_used, last_daily, job_id, partner_id, affection, bank, love, clan_id, prestige, claimed_support_gift, study_streak, study_points, total_study_minutes, story_chapter, story_node, affection_points, badges, ai_memory');
    if (userErr) {
        console.error('❌ Lỗi đọc bảng users:', userErr);
        process.exit(1);
    }

    console.log(`📊 Đang phân tích ${allUsers.length} người chơi trong database...`);

    // Lấy danh sách genuine user IDs từ các bảng hoạt động
    const genuineSet = new Set();

    const checkTables = [
        { table: 'inventory', col: 'user_id' },
        { table: 'bakeries', col: 'user_id' },
        { table: 'user_pets', col: 'user_id' },
        { table: 'plants', col: 'user_id' },
        { table: 'pigs', col: 'user_id' },
        { table: 'quest_progress', col: 'user_id' },
        { table: 'user_discoveries', col: 'user_id' },
        { table: 'user_study_sessions', col: 'user_id' },
        { table: 'battle_pass_users', col: 'user_id' },
        { table: 'user_badges', col: 'user_id' },
        { table: 'user_collection_rewards', col: 'user_id' },
        { table: 'bakery_completed_orders', col: 'user_id' },
        { table: 'bakery_likes', col: 'liker_id' },
        { table: 'lottery_tickets', col: 'user_id' },
        { table: 'loans', col: 'borrower_id' },
        { table: 'loans', col: 'lender_id' },
        { table: 'redeem_claims', col: 'user_id' },
        { table: 'world_event_contributions', col: 'user_id' },
        { table: 'cooldowns', col: 'user_id' }
    ];

    for (const t of checkTables) {
        const { data, error } = await supabase.from(t.table).select(t.col);
        if (!error && data) {
            for (const row of data) {
                if (row[t.col]) genuineSet.add(String(row[t.col]));
            }
        }
    }

    // Kiểm tra economy_ledger (source != 'chat')
    const { data: nonChatLedger, error: ledgerErr } = await supabase
        .from('economy_ledger')
        .select('user_id')
        .neq('source', 'chat');
    if (!ledgerErr && nonChatLedger) {
        for (const row of nonChatLedger) {
            if (row.user_id) genuineSet.add(String(row.user_id));
        }
    }

    // Kiểm tra các cột cờ trong users
    for (const u of allUsers) {
        const uid = String(u.user_id);
        if (
            (Number(u.bank) || 0) > 0 ||
            u.last_daily != null ||
            u.job_id != null ||
            u.partner_id != null ||
            (Number(u.affection) || 0) > 0 ||
            (Number(u.ai_used) || 0) > 0 ||
            (Number(u.love) || 0) > 0 ||
            u.clan_id != null ||
            (Number(u.prestige) || 0) > 0 ||
            u.claimed_support_gift === true ||
            (Number(u.study_streak) || 0) > 0 ||
            (Number(u.study_points) || 0) > 0 ||
            (Number(u.total_study_minutes) || 0) > 0 ||
            (Number(u.story_chapter) || 0) > 1 ||
            (Number(u.story_node) || 0) > 1 ||
            (Number(u.affection_points) || 0) > 0 ||
            (u.badges && Array.isArray(u.badges) && u.badges.length > 0) ||
            (u.ai_memory && typeof u.ai_memory === 'object' && Object.keys(u.ai_memory).length > 0)
        ) {
            genuineSet.add(uid);
        }
    }

    const ghostUsers = allUsers.filter(u => !genuineSet.has(String(u.user_id)));
    const activeGhostUsers = ghostUsers.filter(u => (Number(u.exp) || 0) > 0 || (Number(u.wallet) || 0) > 0);

    const sumWallet = activeGhostUsers.reduce((s, u) => s + (Number(u.wallet) || 0), 0);
    const sumExp = activeGhostUsers.reduce((s, u) => s + (Number(u.exp) || 0), 0);

    console.log(`\n📋 KẾT QUẢ PHÂN TÍCH:`);
    console.log(`- Tổng số tài khoản:         ${allUsers.length}`);
    console.log(`- Tài khoản THẬT (BẢO VỆ):   ${genuineSet.size} (Đã dùng lệnh, chơi RPG, hoặc chat với AI Waguri)`);
    console.log(`- Tài khoản GHOST:           ${ghostUsers.length} (Chưa từng dùng lệnh bot, chỉ tăng EXP/tiền qua chat thường)`);
    console.log(`- Ghost có EXP/Ví > 0:       ${activeGhostUsers.length}`);
    console.log(`- Tổng Xu thu hồi:           ${sumWallet.toLocaleString('vi-VN')} xu`);
    console.log(`- Tổng EXP thu hồi:          ${sumExp.toLocaleString('vi-VN')} EXP`);

    // Top 10 ghost accounts có EXP cao nhất
    console.log(`\n🔝 TOP 10 GHOST ACCOUNTS LÊN CẤP THỤ ĐỘNG QUA CHAT:`);
    const sortedGhosts = [...activeGhostUsers].sort((a, b) => (Number(b.exp) || 0) - (Number(a.exp) || 0));
    for (const g of sortedGhosts.slice(0, 10)) {
        console.log(`  • ID: ${g.user_id.padEnd(20)} | EXP: ${String(g.exp || 0).padStart(7)} | Ví: ${String(g.wallet || 0).padStart(7)} xu`);
    }

    if (!isExecute) {
        console.log(`\n⚠️ Đây là chế độ DRY-RUN. Chưa có dữ liệu nào bị thay đổi.`);
        console.log(`👉 Để thực hiện thu hồi thật, hãy chạy: node scripts/cleanup-ghost-chat-users.js --execute\n`);
        return;
    }

    console.log(`\n🚀 BẮT ĐẦU THỰC HIỆN THU HỒI VÀ DỌN DẸP TRÊN SUPABASE...`);
    const ghostIds = activeGhostUsers.map(u => u.user_id);
    const batchSize = 100;
    let processed = 0;

    for (let i = 0; i < ghostIds.length; i += batchSize) {
        const batch = ghostIds.slice(i, i + batchSize);
        const { error: updErr } = await supabase
            .from('users')
            .update({ wallet: 0, exp: 0 })
            .in('user_id', batch);

        if (updErr) {
            console.error(`❌ Lỗi cập nhật batch ${i} - ${i + batch.length}:`, updErr);
        } else {
            processed += batch.length;
            process.stdout.write(`\r  Đã reset: ${processed}/${ghostIds.length} ghost users...`);
        }
    }

    console.log(`\n✅ Đã reset thành công ${processed} tài khoản ghost về EXP = 0, Ví = 0!`);

    // Dọn dẹp các bản ghi chat trong economy_ledger của các ghost users
    console.log(`🧹 Đang dọn dẹp các bản ghi 'chat' thừa trong economy_ledger...`);
    const { count, error: delErr } = await supabase
        .from('economy_ledger')
        .delete({ count: 'exact' })
        .eq('source', 'chat')
        .in('user_id', ghostIds);

    if (delErr) {
        console.error('⚠️ Lỗi khi xóa ledger chat của ghost:', delErr);
    } else {
        console.log(`✅ Đã xóa ${count || 0} bản ghi rác trong economy_ledger!`);
    }

    console.log(`\n✨ HOÀN TẤT DỌN DẸP DỮ LIỆU GHOST THÀNH CÔNG!`);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
