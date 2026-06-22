// ============================================================
// scripts/build-support-server.js — Dựng/HOÀN THIỆN server cộng đồng hỗ trợ Waguri.
// ------------------------------------------------------------
// Chế độ: TÁI DÙNG kênh có sẵn (theo ID/tên) -> BỔ SUNG role/kênh/voice còn thiếu
//         -> XOÁ tin do Waguri đăng trong kênh nội dung rồi ĐĂNG LẠI bản mới (idempotent).
// An toàn: KHÔNG đụng tin của người dùng; thao tác dễ hỏng (xoá kênh/hạ quyền role) phải bật cờ riêng.
//
// CÁCH DÙNG:
//   1) Mời Waguri + tạm cấp ADMINISTRATOR, đặt role Waguri lên CAO.
//   2) Xem trước:  node scripts/build-support-server.js <SERVER_ID>           (mặc định: DRY RUN)
//   3) Ưng -> làm thật:  node scripts/build-support-server.js <SERVER_ID> --apply
//      Dọn role/kênh rác thì thêm cờ:  --harden  --cleanup
// ============================================================
require('dotenv').config();
const {
    Client, GatewayIntentBits, ChannelType, EmbedBuilder, PermissionFlagsBits,
    GuildVerificationLevel, GuildExplicitContentFilter,
} = require('discord.js');
const config = require('../src/config');

// ====================== TUỲ CHỈNH (điều khiển bằng CỜ dòng lệnh — không cần sửa file) ======================
// Mặc định AN TOÀN: chỉ XEM TRƯỚC. Thêm cờ để làm thật:
//   --apply        thực thi thật (tắt DRY_RUN)
//   --harden       ⚠️ gỡ @everyone của Helper/Voter
//   --cleanup      ⚠️ xoá kênh rác trong CLUTTER_NAMES
//   --no-content   bỏ qua việc ghi/đè nội dung kênh
//   --no-perms     bỏ qua đặt quyền category
//   --no-community bỏ qua bật Community/verification
// VD:  node scripts/build-support-server.js 123456789 --apply
const FLAGS = process.argv.slice(2).filter(a => a.startsWith('--'));
const has = f => FLAGS.includes(f);
const DRY_RUN = !has('--apply');        // true = chỉ xem trước. Thêm --apply để làm thật.
const CREATE_MISSING = true;            // tạo role/kênh/voice còn thiếu.
const REWRITE_CONTENT = !has('--no-content'); // xoá tin Waguri cũ trong kênh nội dung -> đăng lại bản mới.
const SET_PERMS = !has('--no-perms');   // đặt quyền category (THÔNG TIN đọc-only, STAFF riêng tư).
const ENABLE_COMMUNITY = !has('--no-community'); // bật Community + verification Medium + AFK + system channel.
const HARDEN_ROLES = has('--harden');   // ⚠️ gỡ @everyone khỏi Helper/Voter.
const CLEANUP_CLUTTER = has('--cleanup'); // ⚠️ XOÁ kênh trong CLUTTER_NAMES.
const CLUTTER_NAMES = ['general', 'waguri-test'];

// ID kênh CÓ SẴN (ép dùng). Để trống = tự dò theo tên alias.
const USE_EXISTING = {
    rules: '1517931374953238600', announce: '1517931376865710120', guide: '1517931380405698621',
    links: '1517931382570221659', chat: '1517931385434935419', support: '1517931393878065283',
    bug: '1517931395958313044', suggest: '1517936322881523944', logs: '1517931401150730303',
    changelog: '', welcome: '', faq: '', premium: '', confession: '', test: '', showoff: '', events: '',
    backup: '',
};
// =======================================================

const GUILD_ID = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.SUPPORT_GUILD_ID;
if (!GUILD_ID) { console.error('❌ Thiếu Server ID. Dùng: node scripts/build-support-server.js <SERVER_ID> [--apply]'); process.exit(1); }
if (!process.env.DISCORD_TOKEN) { console.error('❌ Thiếu DISCORD_TOKEN trong .env'); process.exit(1); }

const PINK = config.COLORS.INFO;
const WEB = config.WEB_URL;
const P = PermissionFlagsBits;

// ---------- Nhóm (category) ----------
const CATS = {
    info: { name: '📋・THÔNG TIN', match: ['thông tin', 'thong tin', 'info', '📋', '📢'], access: 'readonly' },
    community: { name: '💬・CỘNG ĐỒNG', match: ['cộng đồng', 'cong dong', 'community', '💬'], access: 'public' },
    support: { name: '🛟・HỖ TRỢ', match: ['hỗ trợ', 'ho tro', 'support', '🛟'], access: 'public' },
    voice: { name: '🔊・KÊNH THOẠI', match: ['thoại', 'thoai', 'voice', '🔊'], access: 'public' },
    staff: { name: '🔒・STAFF', match: ['staff', '🔒'], access: 'staff' },
};

// ---------- Kênh (vai trò) ----------
// type: text | forum | voice ; create: tạo mới nếu thiếu ; pin: ghim nội dung.
const TARGETS = {
    welcome: { name: '👋・chào-mừng', aliases: ['chào-mừng', 'chao-mung', 'welcome'], cat: 'info', type: 'text', create: true, pin: true },
    rules: { name: '📜・nội-quy', aliases: ['luật', 'luat', 'rule', 'nội-quy', 'noi-quy'], cat: 'info', type: 'text', pin: true },
    announce: { name: '📢・thông-báo', aliases: ['thông-báo', 'thong-bao', 'announce'], cat: 'info', type: 'text' },
    changelog: { name: '🆕・cập-nhật', aliases: ['changelog', 'cập-nhật', 'cap-nhat', 'update'], cat: 'info', type: 'text', create: true },
    guide: { name: '🌸・hướng-dẫn', aliases: ['hướng-dẫn', 'huong-dan', 'guide'], cat: 'info', type: 'text', pin: true },
    faq: { name: '❓・faq', aliases: ['faq', 'câu-hỏi', 'cau-hoi'], cat: 'info', type: 'text', create: true, pin: true },
    links: { name: '🔗・liên-kết', aliases: ['liên-kết', 'lien-ket', 'link'], cat: 'info', type: 'text', pin: true },
    premium: { name: '💎・premium', aliases: ['premium', 'vip', 'ủng-hộ', 'ung-ho'], cat: 'info', type: 'text', create: true, pin: true },
    chat: { name: '🗨️・chat-chung', aliases: ['chat-chung', 'general', 'chung', 'sảnh'], cat: 'community', type: 'text' },
    test: { name: '🤖・thử-lệnh-bot', aliases: ['thử-lệnh', 'thu-lenh', 'spam-bot', 'bot-command', 'thử-bot'], cat: 'community', type: 'text', create: true },
    showoff: { name: '🖼️・khoe-đồ', aliases: ['khoe-đồ', 'khoe-do', 'showoff', 'flex'], cat: 'community', type: 'text', create: true },
    confession: { name: '💌・tâm-sự', aliases: ['confession', 'tâm-sự', 'tam-su'], cat: 'community', type: 'text', create: true, pin: true },
    events: { name: '🎉・sự-kiện', aliases: ['sự-kiện', 'su-kien', 'event', 'giveaway'], cat: 'community', type: 'text', create: true, pin: true },
    support: { name: '❓・hỗ-trợ', aliases: ['hỗ-trợ', 'ho-tro', 'support', 'help'], cat: 'support', type: 'text', pin: true },
    bug: { name: '🐛・báo-lỗi', aliases: ['báo-lỗi', 'bao-loi', 'bug', 'report'], cat: 'support', type: 'text', pin: true },
    suggest: { name: '💡・góp-ý', aliases: ['góp-ý', 'gop-y', 'suggest', 'feedback'], cat: 'support', type: 'forum' },
    logs: { name: '📋・logs', aliases: ['log', 'nhật-ký', 'nhat-ky'], cat: 'staff', type: 'text' },
    backup: { name: '💾・backup-db', aliases: ['backup', 'sao-lưu', 'sao-luu'], cat: 'staff', type: 'text' },
    v_chat: { name: '💬 Tám Chuyện', aliases: ['phòng chuyện', 'tám', 'chuyện trò', 'chat'], cat: 'voice', type: 'voice', create: true },
    v_game: { name: '🎮 Chơi Game', aliases: ['game', 'chơi game'], cat: 'voice', type: 'voice', create: true },
    v_music: { name: '🎵 Nghe Nhạc', aliases: ['nhạc', 'music'], cat: 'voice', type: 'voice', create: true },
    v_afk: { name: '💤 AFK', aliases: ['afk', 'nghỉ'], cat: 'voice', type: 'voice', create: true },
};

// ---------- Role bổ sung (tạo nếu thiếu — reuse theo tên) ----------
const ROLE_DEFS = [
    { name: 'Premium', color: 0xF1C40F, perms: [], mentionable: false, hoist: true },
    { name: 'Voter', color: 0xFEE75C, perms: [], mentionable: false, hoist: false },
    { name: '📢 Thông báo', color: 0x5865F2, perms: [], mentionable: true, hoist: false },
    { name: '🎉 Sự kiện', color: 0xEB459E, perms: [], mentionable: true, hoist: false },
];

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`Đăng nhập: ${client.user.tag}`);
    const botId = client.user.id;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=1099512007760&scope=bot+applications.commands`;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;
    const topggUrl = `https://top.gg/bot/${botId}`;

    // ---------- Nội dung từng kênh ----------
    const E = (title, lines) => new EmbedBuilder().setColor(PINK).setTitle(title).setDescription(Array.isArray(lines) ? lines.join('\n') : lines);
    const CONTENT = {
        welcome: E('🌸・Chào mừng tới nhà của Waguri!', [
            'Rất vui được gặp cậu~ Đây là server hỗ trợ chính thức của **Waguri Kaoruko** 🍰 — nơi cập nhật tính năng, nhận trợ giúp và giao lưu cùng mọi người chơi.', '',
            '**Bắt đầu nhé:**',
            '1️⃣ Đọc **#nội-quy** & đồng ý để mở khoá server.',
            '2️⃣ Ghé **#hướng-dẫn** để biết cách chơi trong 1 phút.',
            '3️⃣ Chọn vai trò ở phần *Onboarding* để nhận thông báo cậu thích.',
            '4️⃣ Thắc mắc gì cứ hỏi ở **#hỗ-trợ** nha.', '', 'Chúc cậu chơi thật vui! 💕',
        ]),
        rules: E('📜・Nội quy — Waguri Bot Support', [
            'Vài điều nhỏ để mọi người đều thoải mái nhé~ 🌸', '',
            '**1.** Tôn trọng nhau — không công kích, phân biệt, quấy rối hay gây drama.',
            '**2.** Không spam/flood, quảng cáo hay mời server khác khi chưa được phép.',
            '**3.** Không nội dung 18+, bạo lực, phản cảm hay chính trị nhạy cảm.',
            '**4.** Đăng đúng kênh: thử lệnh ở **#thử-lệnh-bot**, hỏi ở **#hỗ-trợ**, lỗi ở **#báo-lỗi**.',
            '**5.** Không lợi dụng lỗi để trục lợi — hãy báo ở **#báo-lỗi** (báo lỗi hợp lệ được thưởng 💝).',
            '**6.** Không mạo danh staff/người khác; giữ tên & avatar lịch sự.',
            '**7.** Nghe hướng dẫn của Mod/Admin — quyết định của staff là cuối cùng.', '',
            '_Vi phạm: nhắc nhở → cảnh cáo → mute → kick/ban tuỳ mức độ._',
            '_Áp dụng kèm [Điều khoản Discord](https://discord.com/terms) & [Hướng dẫn cộng đồng](https://discord.com/guidelines)._',
        ]),
        announce: E('🎉・Waguri đã chính thức có mặt!', [
            'Cảm ơn cậu đã ghé thăm 🍰 Mọi cập nhật lớn, sự kiện và lịch bảo trì sẽ được đăng tại đây.',
            'Bật vai trò **📢 Thông báo** để không bỏ lỡ nhé!',
        ]),
        changelog: E('🆕・Changelog', [
            'Nơi ghi lại mọi thay đổi của Waguri 🌸', '', '**Mới nhất:**',
            '• 🍜 Thêm 14 đặc sản vùng miền + đồ mùa lễ (bánh chưng/trung thu)',
            '• 💎 Mở bán **Premium** (quét VietQR)',
            '• 🎴 Đồ giới hạn theo mùa lễ + bật/tắt trò may rủi theo server',
            '• 🗓️ Lệnh `/amlich` — lịch âm, can chi, giờ hoàng đạo',
        ]),
        guide: E('🌸・Bắt đầu với Waguri', [
            '**💰 Kiếm tiền & nuôi nhân vật**',
            '`/start` tạo nhân vật · `/daily` điểm danh mỗi ngày',
            '`/work` `/fish` `/mine` `/chop` kiếm tiền (tốn năng lượng)',
            '`/eat` hồi năng lượng/sức khoẻ · `/shop` `/buy` `/sell` mua bán', '',
            '**👤 Hồ sơ & cộng đồng**',
            '`/profile` · `/leaderboard` · `/marry` · `/clan` · `/market`', '',
            '**🎲 Giải trí**',
            '`/taixiu` `/bacay` `/baucua` `/blackjack` `/masoi`… minigame nhiều người',
            '`/dovui` đố vui · `/boi` xem bói · `/amlich` lịch âm', '',
            '**💬 Trò chuyện AI**: tag **@Waguri** hoặc `/ask`',
            '**🎁 Thưởng**: `/vote` mỗi 12h 💝 · `/premium` xem Premium 💎', '',
            `📖 Tất cả lệnh: \`/help\` hoặc **${WEB}/commands**`,
        ]),
        faq: E('❓・Câu hỏi thường gặp', [
            '**Waguri là gì?** Bot economy/nhập vai + trò chuyện AI tiếng Việt 🌸',
            '**Bắt đầu sao?** Gõ `/start` rồi `/daily` để nhận vốn.',
            '**Mời bot về server mình?** Bấm link ở **#liên-kết**.',
            '**Kiếm tiền nhanh?** `/daily` mỗi ngày, `/work`, và `/vote` (thưởng lớn).',
            '**Tiền có chung giữa các server không?** Ví tiền **dùng chung** mọi server; BXH có cả toàn cầu lẫn theo server.',
            '**Premium là gì, mua sao?** Xem **#premium** 💎.',
            '**Lỡ gặp lỗi/mất tiền?** Báo ở **#báo-lỗi** kèm ảnh.',
            '**Bot không phản hồi?** Kiểm tra bot có quyền đọc/gửi tin ở kênh đó, thử lại; vẫn lỗi thì hỏi **#hỗ-trợ**.',
        ]),
        links: E('🔗・Liên kết hữu ích', [
            `➕ **[Mời Waguri](${inviteUrl})**`,
            `🗳️ **[Vote Top.gg](${voteUrl})** (thưởng in-game) · ⭐ **[Trang Top.gg](${topggUrl})**`,
            `🌐 **[Trang chủ](${WEB})** · 📖 **[Danh sách lệnh](${WEB}/commands)** · 🏆 **[BXH](${WEB}/leaderboard)**`,
            `💎 **[Nâng cấp Premium](${WEB}/dashboard/premium)**`,
        ]),
        premium: E('💎・Waguri Premium', [
            '**Quyền lợi:**',
            '• 150 lượt chat AI/ngày (gấp 10 lần)',
            '• +10% thu nhập mọi lệnh kiếm tiền',
            '• Huy hiệu 💎 trong hồ sơ',
            '• Ưu tiên trải nghiệm tính năng mới', '',
            '**Bảng giá:** 1 tháng **25.000đ** · 3 tháng **60.000đ** · 6 tháng **99.000đ**', '',
            `**Cách mua:** Vào **[trang Premium](${WEB}/dashboard/premium)**, chọn gói → **quét VietQR** chuyển khoản → kích hoạt sau khi xác nhận. Cảm ơn cậu đã ủng hộ Waguri nhiều lắm~ 🍰`,
        ]),
        chat: E('🗨️・Sảnh chung', 'Cứ thoải mái trò chuyện, kết bạn, khoe thành tích nhé~ Cần giúp thì ghé **#hỗ-trợ** 💕'),
        test: E('🤖・Thử lệnh bot', 'Spam thử lệnh Waguri thoải mái ở đây để khỏi làm phiền kênh khác nha~ 🌸'),
        showoff: E('🖼️・Khoe đồ', 'Khoe hồ sơ, vật phẩm hiếm, thành tích hay ảnh chụp đẹp của cậu tại đây! ✨'),
        confession: E('💌・Tâm sự (ẩn danh)', [
            'Có điều muốn chia sẻ mà ngại lộ danh tính? Dùng `/confession` — Waguri sẽ đăng giúp **ẩn danh** vào đây 🌸',
            '_Vẫn áp dụng nội quy: không công kích, không nội dung độc hại nhé._',
        ]),
        events: E('🎉・Sự kiện & Giveaway', [
            'Nơi thông báo sự kiện nhân thu nhập/EXP, minigame thưởng lớn và giveaway.',
            'Bật vai trò **🎉 Sự kiện** để không bỏ lỡ!',
        ]),
        support: E('🛟・Cần giúp đỡ?', 'Mô tả vấn đề **rõ ràng** (kèm ảnh chụp nếu có) — Mod & cộng đồng sẽ hỗ trợ sớm nhất. Lỗi kỹ thuật thì sang **#báo-lỗi** nhé 🌸'),
        bug: E('🐛・Báo lỗi', ['Lỗi hợp lệ có thể được thưởng 💝. Dùng mẫu:', '```', 'Lệnh bị lỗi: /...', 'Mình đã làm gì: ...', 'Mong đợi vs thực tế: ...', 'Ảnh/log: ...', '```']),
    };

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.channels.fetch();
        await guild.roles.fetch();
        const me = guild.members.me;
        console.log(`\n🏗️  ${guild.name}  ${DRY_RUN ? '【XEM TRƯỚC — không đổi gì】' : '【LÀM THẬT】'}\n`);

        const norm = s => s.toLowerCase();
        const typeOf = t => t === 'voice' ? ChannelType.GuildVoice : t === 'forum' ? ChannelType.GuildForum : ChannelType.GuildText;
        const findCat = key => guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && CATS[key].match.some(m => norm(c.name).includes(m))) || null;
        const findChan = def => {
            const id = USE_EXISTING[Object.keys(TARGETS).find(k => TARGETS[k] === def)];
            if (id) { const c = guild.channels.cache.get(id); if (c) return c; }
            return guild.channels.cache.find(c => c.type === typeOf(def.type) && def.aliases.some(a => norm(c.name).includes(a))) || null;
        };

        // ===== 1) ROLES =====
        console.log('🎭 ROLES:');
        const staffRoleIds = [];
        for (const r of guild.roles.cache.values()) {
            if (/owner|admin|mod|helper|developer|kaoruko/i.test(r.name) && !r.managed && r.id !== guild.id) staffRoleIds.push(r.id);
        }
        for (const rd of ROLE_DEFS) {
            const exist = guild.roles.cache.find(r => norm(r.name) === norm(rd.name));
            if (exist) { console.log(`  ✓ role ${rd.name} (đã có)`); continue; }
            if (!CREATE_MISSING) { console.log(`  – role ${rd.name} (thiếu, bỏ qua)`); continue; }
            if (DRY_RUN) { console.log(`  + role ${rd.name} (sẽ TẠO)`); continue; }
            try {
                await guild.roles.create({ name: rd.name, color: rd.color, permissions: rd.perms, mentionable: rd.mentionable, hoist: rd.hoist, reason: 'Waguri setup' });
                console.log(`  + Đã tạo role ${rd.name}`);
            } catch (e) { console.warn(`  ! không tạo được role ${rd.name}: ${e.message}`); }
        }

        // ===== 2) CATEGORIES + CHANNELS =====
        console.log('\n📚 KÊNH:');
        const resolved = {};
        const ensureCat = async key => {
            let cat = findCat(key);
            if (cat || DRY_RUN || !CREATE_MISSING) return cat;
            cat = await guild.channels.create({ name: CATS[key].name, type: ChannelType.GuildCategory, reason: 'Waguri setup' });
            console.log(`  + Tạo nhóm ${cat.name}`);
            return cat;
        };
        for (const [key, def] of Object.entries(TARGETS)) {
            let ch = findChan(def);
            if (ch) { resolved[key] = ch; console.log(`  ✓ ${key.padEnd(11)} -> #${ch.name}`); continue; }
            if (!def.create || !CREATE_MISSING) { console.log(`  – ${key.padEnd(11)} -> (thiếu, bỏ qua)`); continue; }
            if (DRY_RUN) { console.log(`  + ${key.padEnd(11)} -> (sẽ TẠO #${def.name})`); continue; }
            try {
                const parent = (await ensureCat(def.cat))?.id || null;
                ch = await guild.channels.create({ name: def.name, type: typeOf(def.type), parent, reason: 'Waguri setup' });
                resolved[key] = ch;
                console.log(`  + Đã tạo #${ch.name}`);
            } catch (e) { console.warn(`  ! không tạo được ${key}: ${e.message}`); }
        }

        // Cảnh báo thao tác dễ hỏng
        const clutter = CLUTTER_NAMES.map(n => guild.channels.cache.find(c => c.name === n)).filter(Boolean);
        const loosen = guild.roles.cache.filter(r => /helper|voter/i.test(r.name) && r.permissions.has(P.MentionEveryone));
        if (clutter.length) console.log(`\n🧹 Kênh rác: ${clutter.map(c => '#' + c.name).join(', ')} -> ${CLEANUP_CLUTTER ? 'SẼ XOÁ' : 'giữ (bật CLEANUP_CLUTTER)'}`);
        if (loosen.size) console.log(`🔐 Role @everyone thừa: ${loosen.map(r => r.name).join(', ')} -> ${HARDEN_ROLES ? 'SẼ GỠ' : 'giữ (bật HARDEN_ROLES)'}`);

        if (DRY_RUN) { console.log(`\n👀 XEM TRƯỚC xong. Ổn thì chạy lại kèm --apply:\n   node scripts/build-support-server.js ${GUILD_ID} --apply`); return; }

        // ===== 3) QUYỀN CATEGORY =====
        if (SET_PERMS) {
            console.log('\n🔑 Quyền category:');
            for (const key of Object.keys(CATS)) {
                const cat = findCat(key);
                if (!cat) continue;
                try {
                    if (CATS[key].access === 'readonly') {
                        await cat.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, AddReactions: true, ViewChannel: true });
                        for (const id of staffRoleIds) await cat.permissionOverwrites.edit(id, { SendMessages: true });
                        console.log(`  = ${cat.name}: đọc-only`);
                    } else if (CATS[key].access === 'staff') {
                        await cat.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
                        for (const id of staffRoleIds) await cat.permissionOverwrites.edit(id, { ViewChannel: true });
                        if (me) await cat.permissionOverwrites.edit(me.id, { ViewChannel: true });
                        console.log(`  = ${cat.name}: riêng tư staff`);
                    }
                } catch (e) { console.warn(`  ! quyền ${cat.name}: ${e.message}`); }
            }
        }

        // ===== 3b) QUYỀN KÊNH ĐẶC BIỆT — chỉ-đọc theo từng kênh =====
        // Kênh #sự-kiện nằm trong category CỘNG ĐỒNG (public) nhưng là kênh thông báo:
        // @everyone KHÔNG gửi được; chỉ staff mới gửi. Tương tự #cập-nhật nếu chưa readonly qua category.
        if (SET_PERMS) {
            const announcementOnlyChannels = ['events', 'changelog'].map(k => resolved[k]).filter(Boolean);
            for (const ch of announcementOnlyChannels) {
                try {
                    await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, AddReactions: true, ViewChannel: true });
                    for (const id of staffRoleIds) await ch.permissionOverwrites.edit(id, { SendMessages: true });
                    console.log(`  = #${ch.name}: chỉ-đọc (override riêng kênh)`);
                } catch (e) { console.warn(`  ! quyền kênh #${ch.name}: ${e.message}`); }
            }
        }

        // ===== 4) COMMUNITY + CONFIG =====
        if (ENABLE_COMMUNITY) {
            const patch = {};
            if (!guild.features.includes('COMMUNITY') && resolved.rules && resolved.changelog) {
                patch.features = [...guild.features, 'COMMUNITY'];
                patch.rulesChannel = resolved.rules.id; patch.publicUpdatesChannel = resolved.changelog.id;
                patch.explicitContentFilter = GuildExplicitContentFilter.AllMembers;
                patch.description = 'Server hỗ trợ chính thức của Waguri 🌸';
            }
            if (guild.verificationLevel < GuildVerificationLevel.Medium) patch.verificationLevel = GuildVerificationLevel.Medium;
            if (resolved.welcome) patch.systemChannel = resolved.welcome.id;
            if (resolved.v_afk) { patch.afkChannel = resolved.v_afk.id; patch.afkTimeout = 300; }
            if (Object.keys(patch).length) {
                try { await guild.edit({ ...patch, reason: 'Waguri setup' }); console.log('\n⚙️ Đã cấu hình Community/verification/system/AFK.'); }
                catch (e) { console.warn('\n! cấu hình server:', e.message); }
            }
            if (resolved.confession) {
                try { require('../src/database.js').setGuildSetting(guild.id, 'confession_channel', resolved.confession.id); console.log(`= confession -> #${resolved.confession.name}`); }
                catch (e) { console.warn('! confession setting:', e.message); }
            }
        }

        // ===== 5) NỘI DUNG (xoá tin Waguri cũ -> đăng lại) =====
        console.log('\n📝 Nội dung:');
        for (const [key, embed] of Object.entries(CONTENT)) {
            const ch = resolved[key];
            if (!ch || ch.type !== ChannelType.GuildText) continue;
            try {
                if (REWRITE_CONTENT) {
                    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
                    const mine = msgs ? [...msgs.values()].filter(m => m.author.id === botId) : [];
                    for (const m of mine) await m.delete().catch(() => {});
                } else {
                    const recent = await ch.messages.fetch({ limit: 1 });
                    if (recent.size > 0) { console.log(`  = #${ch.name} có tin -> giữ`); continue; }
                }
                const msg = await ch.send({ embeds: [embed] });
                if (TARGETS[key]?.pin) await msg.pin().catch(() => {});
                console.log(`  ✎ #${ch.name}`);
            } catch (e) { console.warn(`  ! #${ch.name}: ${e.message}`); }
        }

        // ===== 6) Dọn role/kênh (opt-in) =====
        if (HARDEN_ROLES) for (const role of loosen.values()) {
            try { await role.setPermissions(role.permissions.remove(P.MentionEveryone), 'Hạ quyền @everyone'); console.log(`  🔐 gỡ @everyone: ${role.name}`); }
            catch (e) { console.warn(`  ! role ${role.name}: ${e.message}`); }
        }
        if (CLEANUP_CLUTTER) for (const ch of clutter) {
            try { await ch.delete('Dọn kênh rác'); console.log(`  🧹 xoá #${ch.name}`); }
            catch (e) { console.warn(`  ! #${ch.name}: ${e.message}`); }
        }

        console.log('\n✅ Xong! Việc làm tay còn lại (Discord API hạn chế):');
        console.log('   • Server Settings → Onboarding: kênh mặc định = chào-mừng, hướng-dẫn, chat-chung, hỗ-trợ; câu hỏi "Nhận thông báo nào?" -> 📢 Thông báo / 🎉 Sự kiện');
        console.log('   • Server Settings → Membership Screening (Rules): bật + dán 5 điều rút gọn');
        console.log('   • #góp-ý (forum): đặt Post Guidelines trong Edit Channel');
        console.log('   • Tạo invite VĨNH VIỄN -> Top.gg + env SUPPORT_INVITE; webhook #logs -> LOG_WEBHOOK_URL');
        console.log('   • Soát bot bên thứ ba có ADMIN; gỡ Administrator tạm của Waguri sau khi xong');
        if (!HARDEN_ROLES && loosen.size) console.log('   • (Tuỳ chọn) bật HARDEN_ROLES gỡ @everyone của Helper/Voter');
        if (!CLEANUP_CLUTTER && clutter.length) console.log(`   • (Tuỳ chọn) bật CLEANUP_CLUTTER xoá: ${clutter.map(c => '#' + c.name).join(', ')}`);
    } catch (e) {
        console.error('❌ Lỗi:', e?.message || e);
    } finally {
        client.destroy();
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
