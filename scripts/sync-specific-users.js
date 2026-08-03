require('../src/lib/envLoader');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function syncSpecificUsers() {
    console.log('🔄 Đang đồng bộ chính xác Discord Username & Avatar cho Top 10...');

    // Lấy tất cả user có username bắt đầu bằng "Người chơi #"
    const { data: users, error } = await supabase
        .from('users')
        .select('user_id, username, wallet, bank')
        .like('username', 'Người chơi #%')
        .order('wallet', { ascending: false })
        .limit(50);

    if (error || !users || users.length === 0) {
        console.log('✅ Không có user nào cần cập nhật lại!');
        return;
    }

    console.log(`🔍 Đang xử lý ${users.length} người chơi...`);
    const token = process.env.DISCORD_TOKEN;

    for (const u of users) {
        try {
            const headers = token ? { Authorization: `Bot ${token}` } : {};
            const res = await fetch(`https://discord.com/api/v10/users/${u.user_id}`, { headers });

            if (res.status === 429) {
                const retryAfter = Number(res.headers.get('retry-after') || 2) * 1000;
                console.warn(`⏳ Bị Discord API 429, tạm dừng ${retryAfter}ms...`);
                await new Promise(r => setTimeout(r, retryAfter + 500));
                continue;
            }

            if (res.ok) {
                const discUser = await res.json();
                const username = discUser.global_name || discUser.username || `User #${u.user_id.slice(-4)}`;
                const avatar = discUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${u.user_id}/${discUser.avatar}.png?size=128`
                    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.user_id) >> 22n) % 5n)}.png`;

                await supabase
                    .from('users')
                    .update({ username, avatar })
                    .eq('user_id', u.user_id);

                console.log(`✅ [UPDATED] ${u.user_id} ➔ ${username}`);
            } else {
                console.warn(`⚠️ Discord user ${u.user_id} status ${res.status}`);
            }

            // Tạm nghỉ 300ms giữa các request để chống 429 rate limit
            await new Promise(r => setTimeout(r, 300));
        } catch (e) {
            console.error(`❌ Lỗi user ${u.user_id}:`, e.message);
        }
    }

    console.log('🎉 Đã hoàn tất nạp Tên + Avatar chuẩn!');
}

syncSpecificUsers();
