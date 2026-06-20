// ============================================================
// scripts/build-support-server.js — Dựng cấu trúc SERVER HỖ TRỢ + bật Community + đăng nội dung mẫu.
// ------------------------------------------------------------
// Vì bot không tự tạo được server, bạn làm theo các bước:
//   1) Tự tạo 1 server Discord trống (nút "+").
//   2) Mời Waguri vào server đó. Để bật Community + đăng bài vào kênh read-only,
//      tạm cấp ADMINISTRATOR cho role bot (gỡ sau khi chạy xong) — gọn nhất.
//   3) Bật Developer Mode (Discord Settings → Advanced) → chuột phải server → Copy Server ID.
//   4) Chạy:  node scripts/build-support-server.js <SERVER_ID>
//
// Idempotent: chạy lại sẽ BỎ QUA category/kênh/role đã có; chỉ ĐĂNG NỘI DUNG vào kênh MỚI tạo.
// ============================================================
require('dotenv').config();
const {
    Client, GatewayIntentBits, ChannelType, PermissionsBitField, EmbedBuilder,
    GuildVerificationLevel, GuildExplicitContentFilter,
} = require('discord.js');
const config = require('../src/config');

const GUILD_ID = process.argv[2] || process.env.SUPPORT_GUILD_ID;
if (!GUILD_ID) {
    console.error('❌ Thiếu Server ID. Dùng: node scripts/build-support-server.js <SERVER_ID>');
    process.exit(1);
}
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ Thiếu DISCORD_TOKEN trong .env');
    process.exit(1);
}

const P = PermissionsBitField.Flags;
const PINK = config.COLORS.INFO;
const PERM_INT = '1099512007760'; // bộ quyền least-privilege của Waguri (để dựng link mời)

const ROLES = [
    { name: 'Developer', color: 0xFF9EAA, hoist: true },
    { name: 'Admin',     color: 0xF04747, hoist: true },
    { name: 'Mod',       color: 0x5865F2, hoist: true },
    { name: 'Helper',    color: 0x57F287, hoist: true },
    { name: 'Voter',     color: 0xFEE75C, hoist: false },
];

const STRUCTURE = [
    { cat: '📢・THÔNG TIN', readonly: true, channels: ['luật-lệ', 'thông-báo', 'changelog', 'hướng-dẫn', 'liên-kết'] },
    { cat: '💬・CỘNG ĐỒNG', channels: ['chat-chung', 'thử-lệnh-bot', 'góp-ý', 'khoe-đồ'] },
    { cat: '🛟・HỖ TRỢ', channels: ['hỗ-trợ', 'báo-lỗi'] },
    { cat: '🔒・STAFF', staff: true, channels: ['staff-chat', 'logs', 'mod-updates'] },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`Đăng nhập: ${client.user.tag}`);
    const botId = client.user.id;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=${PERM_INT}&scope=bot+applications.commands`;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;
    const topggUrl = `https://top.gg/bot/${botId}`;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.roles.fetch();
        await guild.channels.fetch();
        console.log(`🏗️  Dựng cấu trúc cho server: ${guild.name}\n`);

        // --- 1) Roles ---
        const roleMap = {};
        for (const r of ROLES) {
            let role = guild.roles.cache.find(x => x.name === r.name);
            if (!role) {
                try {
                    role = await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, reason: 'Waguri support setup' });
                    console.log(`  + Role: ${r.name}`);
                } catch (e) {
                    console.warn(`  ! Bỏ qua role "${r.name}" (cần Manage Roles): ${e.message}`);
                }
            } else {
                console.log(`  = Role đã có: ${r.name}`);
            }
            if (role) roleMap[r.name] = role.id;
        }
        const staffRoleIds = ['Developer', 'Admin', 'Mod'].map(n => roleMap[n]).filter(Boolean);
        const everyone = guild.roles.everyone.id;

        // --- 2) Categories + channels ---
        const chMap = {};       // tên kênh -> channel
        const created = new Set(); // tên kênh MỚI tạo lần này (để chỉ đăng nội dung 1 lần)
        for (const block of STRUCTURE) {
            const overwrites = [];
            if (block.staff) {
                overwrites.push({ id: everyone, deny: [P.ViewChannel] });
                for (const id of staffRoleIds) overwrites.push({ id, allow: [P.ViewChannel] });
            } else if (block.readonly) {
                overwrites.push({ id: everyone, deny: [P.SendMessages] });
                for (const id of staffRoleIds) overwrites.push({ id, allow: [P.SendMessages] });
            }

            let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === block.cat);
            if (!cat) {
                cat = await guild.channels.create({ name: block.cat, type: ChannelType.GuildCategory, permissionOverwrites: overwrites });
                console.log(`\n+ Category: ${block.cat}`);
            } else {
                console.log(`\n= Category đã có: ${block.cat}`);
            }

            for (const ch of block.channels) {
                const slug = ch.toLowerCase();
                let channel = guild.channels.cache.find(c => c.parentId === cat.id && (c.name === slug || c.name === ch));
                if (channel) {
                    console.log(`    = kênh đã có: ${ch}`);
                } else {
                    channel = await guild.channels.create({ name: ch, type: ChannelType.GuildText, parent: cat.id });
                    created.add(ch);
                    console.log(`    + kênh: ${ch}`);
                }
                chMap[ch] = channel;
            }
        }

        // --- 3) Bật Community (cần Manage Server) ---
        if (guild.features.includes('COMMUNITY')) {
            console.log('\n= Community đã bật sẵn.');
        } else if (chMap['luật-lệ'] && chMap['mod-updates']) {
            try {
                await guild.edit({
                    features: [...guild.features, 'COMMUNITY'],
                    rulesChannel: chMap['luật-lệ'].id,
                    publicUpdatesChannel: chMap['mod-updates'].id,
                    verificationLevel: GuildVerificationLevel.Medium,
                    explicitContentFilter: GuildExplicitContentFilter.AllMembers,
                    description: 'Server hỗ trợ chính thức của Waguri 🌸',
                    reason: 'Enable Community for Waguri support server',
                });
                console.log('\n✅ Đã BẬT Community (rules=#luật-lệ, updates=#mod-updates, verify=Medium, filter=All).');
                try {
                    await chMap['thông-báo'].edit({ type: ChannelType.GuildAnnouncement });
                    console.log('   + #thông-báo -> kênh Announcement.');
                } catch (e) {
                    console.warn('   ! Không đổi được #thông-báo sang Announcement:', e.message);
                }
            } catch (e) {
                console.warn('\n! Không bật được Community tự động (cần Manage Server / Administrator):', e.message);
            }
        }

        // --- 4) Đăng nội dung mẫu (chỉ vào kênh MỚI tạo) ---
        const post = async (name, embed, pin = false) => {
            if (!created.has(name) || !chMap[name]) return; // đã có từ trước -> không đăng lại
            try {
                const msg = await chMap[name].send({ embeds: [embed] });
                if (pin) await msg.pin().catch(() => {});
                console.log(`    ✎ đã đăng vào #${name}`);
            } catch (e) {
                console.warn(`    ! không đăng được vào #${name}: ${e.message}`);
            }
        };
        const E = (title, desc) => new EmbedBuilder().setColor(PINK).setTitle(title).setDescription(desc);

        await post('luật-lệ', E('📜・Nội quy server', [
            '1️⃣ Tôn trọng mọi người — không công kích, phân biệt, quấy rối.',
            '2️⃣ Không spam, quảng cáo, gửi link độc hại.',
            '3️⃣ Đăng đúng kênh (hỏi ở `#hỗ-trợ`, báo lỗi ở `#báo-lỗi`).',
            '4️⃣ Nội dung trong sạch, lành mạnh, hợp mọi lứa tuổi.',
            '5️⃣ Nghe theo hướng dẫn của Mod/Admin.',
            '',
            'Tuân thủ Điều khoản & Hướng dẫn cộng đồng của Discord nha~ 🌸',
        ].join('\n')), true);

        await post('hướng-dẫn', E('🌸・Bắt đầu với Waguri', [
            'Chào cậu! Vài bước để bắt đầu nè:',
            '• `/help` — xem tất cả lệnh',
            '• `/daily` — điểm danh mỗi ngày · `/work` — đi làm kiếm tiền',
            '• `/shop` `/buy` — mua sắm · `/leaderboard` — bảng xếp hạng',
            '• `/taixiu` `/baucua` `/masoi`… — minigame cùng bạn bè',
            '• `@Waguri` hoặc `/ask` — trò chuyện với mình 💬',
            '• `/vote` — vote ủng hộ nhận thưởng 💝',
            '',
            `*Dùng được cả prefix \`${config.PREFIX}\` (vd \`${config.PREFIX}help\`).*`,
        ].join('\n')), true);

        await post('liên-kết', E('🔗・Liên kết', [
            `➕ **[Mời Waguri về server](${inviteUrl})**`,
            `🗳️ **[Vote trên Top.gg](${voteUrl})**`,
            `⭐ **[Trang Top.gg của Waguri](${topggUrl})**`,
            '',
            '*(Chèn thêm link Privacy Policy / Terms khi web đã deploy nhé.)*',
        ].join('\n')));

        await post('thông-báo', E('🎉・Waguri đã có mặt!', [
            'Chào mừng đến với ngôi nhà của **Waguri Kaoruko** 🍰',
            'Đây là server hỗ trợ chính thức — nơi cập nhật tính năng, nhận trợ giúp và giao lưu.',
            '',
            `➕ [Mời bot](${inviteUrl}) · 🗳️ [Vote](${voteUrl})`,
            'Cảm ơn cậu đã đồng hành cùng mình nha~ 🌸',
        ].join('\n')));

        await post('chat-chung', E('🌸・Chào mừng!', 'Cứ thoải mái trò chuyện, khoe đồ ở `#khoe-đồ`, thử lệnh ở `#thử-lệnh-bot` nhé~ Có gì cần giúp thì ghé `#hỗ-trợ`! 💕'));
        await post('hỗ-trợ', E('🛟・Cần giúp đỡ?', 'Mô tả vấn đề **rõ ràng** (kèm ảnh chụp màn hình nếu có) — Mod & cộng đồng sẽ hỗ trợ cậu sớm nhất 🌸'));
        await post('báo-lỗi', E('🐛・Báo lỗi', ['Mẫu báo lỗi cho gọn nha:', '```', 'Lệnh bị lỗi: /...', 'Mình đã làm gì: ...', 'Kết quả mong đợi vs thực tế: ...', 'Ảnh/log (nếu có): ...', '```'].join('\n')));
        await post('góp-ý', E('💡・Góp ý', 'Cậu muốn Waguri có thêm tính năng gì? Cứ mạnh dạn chia sẻ ở đây nhé — mình rất trân trọng mọi ý tưởng! ✨'));

        console.log('\n✅ Xong! Việc còn lại (làm tay):');
        console.log('   • Tạo invite VĨNH VIỄN (Never expire, no limit) → dán Top.gg + env SUPPORT_INVITE.');
        console.log('   • Onboarding/Welcome Screen: cấu hình trong Server Settings (tuỳ chọn).');
        console.log('   • Tạo webhook ở #logs → env LOG_WEBHOOK_URL (cho error-log).');
        console.log('   • Gỡ bớt quyền Administrator của bot nếu lúc nãy cấp tạm.');
    } catch (e) {
        console.error('❌ Lỗi dựng server:', e?.message || e);
    } finally {
        client.destroy();
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
