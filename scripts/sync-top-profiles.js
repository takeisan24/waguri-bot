require('../src/lib/envLoader');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function syncTopProfiles() {
    console.log('🔄 Đang đồng bộ Discord Username & Avatar cho toàn bộ người chơi...');

    const { data: users, error } = await supabase
        .from('users')
        .select('user_id, username, avatar')
        .is('username', null)
        .limit(200);

    if (error) {
        console.error('❌ Lỗi lấy danh sách user từ DB:', error);
        return;
    }

    if (!users || users.length === 0) {
        console.log('✅ Tất cả người chơi trong DB đã có Tên & Avatar đầy đủ!');
        return;
    }

    console.log(`🔍 Tìm thấy ${users.length} người chơi cần nạp Tên & Avatar Discord...`);

    const token = process.env.DISCORD_TOKEN;

    for (const u of users) {
        try {
            const headers = token ? { Authorization: `Bot ${token}` } : {};
            const res = await fetch(`https://discord.com/api/v10/users/${u.user_id}`, { headers });

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
                console.warn(`⚠️ User ${u.user_id} (API ${res.status}): Đặt tên mặc định User #${u.user_id.slice(-4)}`);
                await supabase
                    .from('users')
                    .update({
                        username: `Người chơi #${u.user_id.slice(-4)}`,
                        avatar: `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.user_id) >> 22n) % 5n)}.png`
                    })
                    .eq('user_id', u.user_id);
            }
        } catch (e) {
            console.error(`❌ Lỗi đồng bộ user ${u.user_id}:`, e.message);
        }
    }

    console.log('🎉 Hoàn tất đồng bộ Discord Profile!');
}

syncTopProfiles();
