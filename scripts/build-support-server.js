// ============================================================
// scripts/build-support-server.js — Tự động dựng cấu trúc SERVER HỖ TRỢ + bật Community.
// ------------------------------------------------------------
// Vì bot không tự tạo được server, bạn làm theo các bước:
//   1) Tự tạo 1 server Discord trống (nút "+").
//   2) Mời Waguri vào server đó. Để bật được Community, bot cần quyền cao:
//      tạm cấp ADMINISTRATOR cho role bot (gỡ sau khi chạy xong) — gọn nhất.
//      (Tối thiểu: Manage Channels + Manage Roles + Manage Server.)
//   3) Bật Developer Mode (Discord Settings → Advanced) → chuột phải server → Copy Server ID.
//   4) Chạy:  node scripts/build-support-server.js <SERVER_ID>
//      (hoặc đặt env SUPPORT_GUILD_ID rồi chạy không cần tham số)
//
// Idempotent: chạy lại sẽ BỎ QUA category/kênh/role đã có (theo tên) và Community đã bật.
// ============================================================
require('dotenv').config();
const {
    Client, GatewayIntentBits, ChannelType, PermissionsBitField,
    GuildVerificationLevel, GuildExplicitContentFilter,
} = require('discord.js');

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

const ROLES = [
    { name: 'Developer', color: 0xFF9EAA, hoist: true },
    { name: 'Admin',     color: 0xF04747, hoist: true },
    { name: 'Mod',       color: 0x5865F2, hoist: true },
    { name: 'Helper',    color: 0x57F287, hoist: true },
    { name: 'Voter',     color: 0xFEE75C, hoist: false },
];

// Tên kênh dùng cho Community: rules = 'luật-lệ', community-updates = 'mod-updates'.
const STRUCTURE = [
    { cat: '📢・THÔNG TIN', readonly: true, channels: ['luật-lệ', 'thông-báo', 'changelog', 'hướng-dẫn', 'liên-kết'] },
    { cat: '💬・CỘNG ĐỒNG', channels: ['chat-chung', 'thử-lệnh-bot', 'góp-ý', 'khoe-đồ'] },
    { cat: '🛟・HỖ TRỢ', channels: ['hỗ-trợ', 'báo-lỗi'] },
    { cat: '🔒・STAFF', staff: true, channels: ['staff-chat', 'logs', 'mod-updates'] },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`Đăng nhập: ${client.user.tag}`);
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
        const chMap = {}; // tên kênh -> channel (để tham chiếu khi bật Community)
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
                    verificationLevel: GuildVerificationLevel.Medium,        // chuẩn tối thiểu cho Community
                    explicitContentFilter: GuildExplicitContentFilter.AllMembers, // chuẩn tối thiểu cho Community
                    description: 'Server hỗ trợ chính thức của Waguri 🌸',
                    reason: 'Enable Community for Waguri support server',
                });
                console.log('\n✅ Đã BẬT Community (rules=#luật-lệ, updates=#mod-updates, verify=Medium, filter=All).');

                // Đổi #thông-báo thành kênh Announcement (chỉ làm được sau khi Community bật)
                try {
                    await chMap['thông-báo'].edit({ type: ChannelType.GuildAnnouncement });
                    console.log('   + #thông-báo -> kênh Announcement.');
                } catch (e) {
                    console.warn('   ! Không đổi được #thông-báo sang Announcement (đổi tay sau cũng được):', e.message);
                }
            } catch (e) {
                console.warn('\n! Không bật được Community tự động (cần quyền Manage Server / Administrator):', e.message);
                console.warn('  → Bật tay: Server Settings → Enable Community, chọn rules=#luật-lệ, updates=#mod-updates.');
            }
        }

        console.log('\n✅ Xong! Việc còn lại (làm tay):');
        console.log('   • Tạo invite VĨNH VIỄN (Never expire, no limit) → dán Top.gg + env SUPPORT_INVITE.');
        console.log('   • Điền nội dung #luật-lệ, #hướng-dẫn, #liên-kết.');
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
