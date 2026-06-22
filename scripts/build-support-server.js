// ============================================================
// scripts/build-support-server.js — Dựng/HOÀN THIỆN server cộng đồng hỗ trợ Waguri.
// ------------------------------------------------------------
// Triết lý AN TOÀN: ưu tiên TÁI DÙNG kênh có sẵn, chỉ đăng nội dung vào kênh TRỐNG,
// và mọi thao tác DỄ HỎNG (đổi quyền role, xoá kênh rác) đều phải BẬT cờ riêng (mặc định tắt).
//
// Mỗi "vai trò kênh": (1) dùng ID map sẵn -> (2) dò theo tên (alias) -> (3) tạo mới nếu được phép.
//
// CÁCH DÙNG:
//   1) Mời Waguri vào server + tạm cấp ADMINISTRATOR.
//   2) Chạy XEM TRƯỚC:  node scripts/build-support-server.js <SERVER_ID>   (DRY_RUN=true)
//   3) Ưng -> đặt DRY_RUN=false rồi chạy lại. Muốn dọn role/kênh rác thì bật HARDEN_ROLES / CLEANUP_CLUTTER.
// ============================================================
require('dotenv').config();
const {
    Client, GatewayIntentBits, ChannelType, EmbedBuilder, PermissionFlagsBits,
    GuildVerificationLevel, GuildExplicitContentFilter,
} = require('discord.js');
const config = require('../src/config');

// ====================== TUỲ CHỈNH ======================
const DRY_RUN = true;            // true = chỉ xem trước, không đổi gì. Đổi false để làm thật.
const CREATE_MISSING = true;     // tự tạo kênh cho vai trò thiếu (welcome/confession...).
const ENABLE_COMMUNITY = true;   // bật Community + verification Medium.
const SET_CONFIG = true;         // đặt system channel (welcome) + confession + verification.
const HARDEN_ROLES = false;      // ⚠️ gỡ quyền @everyone khỏi role thấp (Helper/Voter). Bật khi chắc chắn.
const CLEANUP_CLUTTER = false;   // ⚠️ XOÁ các kênh rác trong CLUTTER_NAMES. Bật khi chắc chắn.

// Tên kênh rác/trùng nên xoá (chỉ dùng khi CLEANUP_CLUTTER=true). Khớp CHÍNH XÁC theo tên.
const CLUTTER_NAMES = ['general', 'choco-test', 'mod-updates'];

// Dán ID kênh CÓ SẴN để ép dùng (để trống "" = tự dò theo tên).
const USE_EXISTING = {
    rules: '1517931374953238600', updates: '', guide: '1517931380405698621', links: '1517931382570221659', announce: '1517931376865710120',
    chat: '1517931385434935419', support: '1517931393878065283', bug: '1517931395958313044', suggest: '1517936322881523944', logs: '1517931401150730303',
    welcome: '', confession: '',
};
// =======================================================

const GUILD_ID = process.argv[2] || process.env.SUPPORT_GUILD_ID;
if (!GUILD_ID) { console.error('❌ Thiếu Server ID. Dùng: node scripts/build-support-server.js <SERVER_ID>'); process.exit(1); }
if (!process.env.DISCORD_TOKEN) { console.error('❌ Thiếu DISCORD_TOKEN trong .env'); process.exit(1); }

const PINK = config.COLORS.INFO;
const WEB = config.WEB_URL;

// Vai trò kênh: alias dò tên + nhóm (category) + có tạo mới khi thiếu không.
const TARGETS = {
    rules: { aliases: ['luật', 'luat', 'rule', 'nội-quy', 'noi-quy', 'quy-định', 'quy-dinh'], cat: 'info' },
    announce: { aliases: ['thông-báo', 'thong-bao', 'announce', 'tin-tức', 'tin-tuc'], cat: 'info' },
    updates: { aliases: ['mod-update', 'community-update', 'cập-nhật', 'mod-log'], cat: 'info', forceCreateForCommunity: true },
    guide: { aliases: ['hướng-dẫn', 'huong-dan', 'guide', 'how-to', 'huongdan'], cat: 'info' },
    links: { aliases: ['liên-kết', 'lien-ket', 'link'], cat: 'info' },
    welcome: { aliases: ['chào-mừng', 'chao-mung', 'welcome', 'cổng-chào'], cat: 'info', create: true },
    chat: { aliases: ['chat-chung', 'general', 'chung', 'tổng', 'sảnh', 'main'], cat: 'community' },
    confession: { aliases: ['confession', 'tâm-sự', 'tam-su', 'tâm-tình'], cat: 'community', create: true },
    support: { aliases: ['hỗ-trợ', 'ho-tro', 'support', 'help', 'giúp-đỡ'], cat: 'support' },
    bug: { aliases: ['báo-lỗi', 'bao-loi', 'bug', 'report', 'lỗi'], cat: 'support' },
    suggest: { aliases: ['góp-ý', 'gop-y', 'suggest', 'feedback', 'đề-xuất'], cat: 'support' },
    logs: { aliases: ['log', 'nhật-ký', 'nhat-ky'], cat: 'staff' },
};
// Nhóm (category) — dò theo từ khoá trong tên, tạo mới nếu thiếu.
const CATS = {
    info: { name: '📢・THÔNG TIN', match: ['thông tin', 'thong tin', 'info'] },
    community: { name: '💬・CỘNG ĐỒNG', match: ['cộng đồng', 'cong dong', 'community'] },
    support: { name: '🛟・HỖ TRỢ', match: ['hỗ trợ', 'ho tro', 'support'] },
    staff: { name: '🔒・STAFF', match: ['staff', '🔒'] },
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
    console.log(`Đăng nhập: ${client.user.tag}`);
    const botId = client.user.id;
    const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${botId}&permissions=1099512007760&scope=bot+applications.commands`;
    const voteUrl = `https://top.gg/bot/${botId}/vote`;
    const topggUrl = `https://top.gg/bot/${botId}`;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.channels.fetch();
        await guild.roles.fetch();
        console.log(`\n🏗️  Server: ${guild.name}  ${DRY_RUN ? '【XEM TRƯỚC — không đổi gì】' : '【LÀM THẬT】'}\n`);

        const isText = c => c && (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement);
        const findCat = key => guild.channels.cache.find(c =>
            c.type === ChannelType.GuildCategory && CATS[key].match.some(m => c.name.toLowerCase().includes(m))) || null;

        // --- Phân giải kênh cho từng vai trò ---
        const resolved = {};
        const toCreate = [];
        for (const [key, def] of Object.entries(TARGETS)) {
            let ch = null;
            const id = USE_EXISTING[key];
            if (id) ch = guild.channels.cache.get(id) || null;
            if (!ch) ch = guild.channels.cache.find(c => isText(c) && def.aliases.some(a => c.name.toLowerCase().includes(a))) || null;

            if (ch) { resolved[key] = ch; console.log(`  ✓ ${key.padEnd(10)} -> #${ch.name}`); continue; }
            const need = (ENABLE_COMMUNITY && def.forceCreateForCommunity) || (CREATE_MISSING && def.create);
            if (CREATE_MISSING || need) { toCreate.push(key); console.log(`  + ${key.padEnd(10)} -> (sẽ TẠO MỚI)`); }
            else console.log(`  – ${key.padEnd(10)} -> (không thấy, bỏ qua)`);
        }

        // --- Báo trước các thao tác dễ hỏng ---
        const clutter = CLUTTER_NAMES.map(n => guild.channels.cache.find(c => c.name === n)).filter(Boolean);
        if (clutter.length) console.log(`\n🧹 Kênh rác sẽ ${CLEANUP_CLUTTER ? 'XOÁ' : 'GIỮ (bật CLEANUP_CLUTTER để xoá)'}: ${clutter.map(c => '#' + c.name).join(', ')}`);
        const loosen = guild.roles.cache.filter(r => /helper|voter/i.test(r.name) && r.permissions.has(PermissionFlagsBits.MentionEveryone));
        if (loosen.size) console.log(`🔐 Role thừa quyền @everyone sẽ ${HARDEN_ROLES ? 'GỠ' : 'GIỮ (bật HARDEN_ROLES để gỡ)'}: ${loosen.map(r => r.name).join(', ')}`);

        if (DRY_RUN) {
            console.log('\n👀 XEM TRƯỚC xong. Ổn thì đặt DRY_RUN=false (và HARDEN_ROLES/CLEANUP_CLUTTER nếu muốn) rồi chạy lại.');
            return;
        }

        // --- Tạo kênh thiếu, đặt vào đúng category ---
        const ensureCat = async key => {
            let cat = findCat(key);
            if (!cat) cat = await guild.channels.create({ name: CATS[key].name, type: ChannelType.GuildCategory }).then(c => (console.log(`  + Tạo nhóm ${c.name}`), c));
            return cat;
        };
        for (const key of toCreate) {
            const def = TARGETS[key];
            const name = key === 'updates' ? 'mod-updates' : key === 'welcome' ? 'chào-mừng' : key === 'confession' ? 'tâm-sự' : key;
            const parent = def.cat ? (await ensureCat(def.cat))?.id : null;
            const ch = await guild.channels.create({ name, type: ChannelType.GuildText, parent });
            resolved[key] = ch;
            console.log(`  + Đã tạo #${ch.name}`);
        }

        // --- Community + cấu hình server ---
        if (ENABLE_COMMUNITY && !guild.features.includes('COMMUNITY') && resolved.rules && resolved.updates) {
            try {
                await guild.edit({
                    features: [...guild.features, 'COMMUNITY'],
                    rulesChannel: resolved.rules.id, publicUpdatesChannel: resolved.updates.id,
                    verificationLevel: GuildVerificationLevel.Medium, explicitContentFilter: GuildExplicitContentFilter.AllMembers,
                    description: 'Server hỗ trợ chính thức của Waguri 🌸', reason: 'Enable Community',
                });
                console.log('\n✅ Đã bật Community.');
            } catch (e) { console.warn('! Không bật được Community:', e.message); }
        } else if (guild.features.includes('COMMUNITY')) console.log('\n= Community đã bật sẵn.');

        if (SET_CONFIG) {
            try {
                const patch = {};
                if (resolved.welcome) patch.systemChannel = resolved.welcome.id;       // lời chào khi vào
                if (guild.verificationLevel < GuildVerificationLevel.Medium) patch.verificationLevel = GuildVerificationLevel.Medium;
                if (Object.keys(patch).length) { await guild.edit({ ...patch, reason: 'Waguri setup' }); console.log('= Đã đặt system channel / verification.'); }
            } catch (e) { console.warn('! Không đặt được system/verification:', e.message); }
            if (resolved.confession) {
                try { require('../src/database.js').setGuildSetting(guild.id, 'confession_channel', resolved.confession.id); console.log(`= Đặt kênh confession -> #${resolved.confession.name}`); }
                catch (e) { console.warn('! Không đặt được confession:', e.message); }
            }
        }

        // --- Nội dung mẫu (CHỈ đăng vào kênh đang TRỐNG) ---
        const E = (title, desc) => new EmbedBuilder().setColor(PINK).setTitle(title).setDescription(desc);
        const CONTENT = {
            rules: { pin: true, embed: E('📜・Nội quy Waguri Bot Support', [
                'Chào mừng cậu tới nhà của **Waguri Kaoruko** 🌸 Đọc qua vài điều nhỏ để mọi người vui vẻ nhé~',
                '', '**1.** Tôn trọng nhau — không công kích, phân biệt, quấy rối.',
                '**2.** Không spam, quảng cáo, link độc hại hay nội dung 18+.',
                '**3.** Đăng đúng kênh: hỏi ở <#0>, báo lỗi ở kênh báo-lỗi, góp ý ở góp-ý.',
                '**4.** Không lạm dụng/abuse bot hay lợi dụng lỗi (báo lỗi sẽ được thưởng 💝).',
                '**5.** Nghe theo hướng dẫn của Mod/Admin.',
                '', '_Vi phạm có thể bị nhắc nhở → mute → ban. Tuân thủ [Điều khoản Discord](https://discord.com/terms) & [Hướng dẫn cộng đồng](https://discord.com/guidelines)._',
            ].join('\n')) },
            announce: { embed: E('🎉・Waguri đã có mặt!', [
                'Đây là **server hỗ trợ chính thức** của Waguri 🍰 — nơi cập nhật tính năng, nhận trợ giúp và giao lưu cùng cộng đồng.',
                '', `➕ **[Mời Waguri về server của cậu](${inviteUrl})**`,
                `🗳️ **[Vote ủng hộ trên Top.gg](${voteUrl})** (nhận thưởng trong game!)`,
                `🌐 **[Trang chủ & hồ sơ](${WEB})**`,
            ].join('\n')) },
            guide: { pin: true, embed: E('🌸・Bắt đầu với Waguri', [
                '**Kiếm tiền & nuôi nhân vật**',
                '• `/start` tạo nhân vật · `/daily` điểm danh mỗi ngày',
                '• `/work` `/fish` `/mine` `/chop` kiếm tiền (tốn năng lượng)',
                '• `/eat` ăn hồi năng lượng/sức khoẻ · `/shop` `/buy` mua đồ',
                '', '**Cộng đồng & giải trí**',
                '• `/leaderboard` bảng xếp hạng · `/profile` hồ sơ',
                '• `/taixiu` `/bacay` `/masoi`… minigame nhiều người',
                '• `@Waguri` hoặc `/ask` để trò chuyện AI 💬',
                '', '**Thưởng & Premium**',
                '• `/vote` nhận thưởng mỗi 12h 💝 · `/premium` xem gói Premium 💎',
                '', `📖 Xem **tất cả lệnh**: \`/help\` hoặc [trang lệnh](${WEB}/commands).`,
            ].join('\n')) },
            links: { pin: true, embed: E('🔗・Liên kết hữu ích', [
                `➕ **[Mời Waguri](${inviteUrl})**`,
                `🗳️ **[Vote Top.gg](${voteUrl})** · ⭐ **[Trang Top.gg](${topggUrl})**`,
                `🌐 **[Trang chủ](${WEB})** · 📖 **[Danh sách lệnh](${WEB}/commands)** · 🏆 **[BXH](${WEB}/leaderboard)**`,
                `💎 **[Nâng cấp Premium](${WEB}/dashboard/premium)**`,
            ].join('\n')) },
            welcome: { pin: true, embed: E('🌸・Chào mừng tới nhà Waguri!', [
                'Rất vui được gặp cậu~ 💕 Trước khi vào chơi, ghé xem:',
                '• 📜 **Nội quy** — để mọi người đều vui',
                '• 🌸 **Hướng dẫn** — bắt đầu chơi Waguri trong 1 phút',
                '• 🔗 **Liên kết** — mời bot, vote, trang chủ',
                '', 'Có gì thắc mắc cứ hỏi ở kênh **hỗ trợ** nhé. Chúc cậu chơi vui! 🍰',
            ].join('\n')) },
            chat: { embed: E('🌸・Sảnh chung', 'Cứ thoải mái trò chuyện, khoe đồ, kết bạn nhé~ Cần giúp thì ghé kênh hỗ trợ 💕') },
            confession: { pin: true, embed: E('💌・Tâm sự (ẩn danh)', [
                'Có điều muốn chia sẻ mà ngại lộ danh tính? Dùng `/confession` để gửi **ẩn danh** — Waguri sẽ đăng giúp cậu vào đây 🌸',
                '', '_Vẫn áp dụng nội quy: không công kích, không nội dung độc hại nhé~_',
            ].join('\n')) },
            support: { embed: E('🛟・Cần giúp đỡ?', 'Mô tả vấn đề **rõ ràng** (kèm ảnh chụp nếu có) — Mod & cộng đồng sẽ hỗ trợ cậu sớm nhất 🌸') },
            bug: { embed: E('🐛・Báo lỗi', ['Gặp lỗi giúp Waguri tốt hơn nhé (báo lỗi hợp lệ có thể được thưởng 💝). Mẫu:', '```', 'Lệnh bị lỗi: /...', 'Mình đã làm gì: ...', 'Mong đợi vs thực tế: ...', 'Ảnh/log: ...', '```'].join('\n')) },
            suggest: { embed: E('💡・Góp ý & đề xuất', 'Muốn Waguri có thêm tính năng gì? Chia sẻ ở đây — mình trân trọng mọi ý tưởng của cậu! ✨') },
        };
        // Sửa mention nội quy -> trỏ đúng kênh hỗ trợ nếu có
        if (resolved.support) CONTENT.rules.embed.setDescription(CONTENT.rules.embed.data.description.replace('<#0>', `<#${resolved.support.id}>`));

        for (const [key, c] of Object.entries(CONTENT)) {
            const ch = resolved[key];
            if (!ch) continue;
            try {
                const recent = await ch.messages.fetch({ limit: 1 });
                if (recent.size > 0) { console.log(`    = #${ch.name} đã có tin -> giữ nguyên.`); continue; }
                const msg = await ch.send({ embeds: [c.embed] });
                if (c.pin) await msg.pin().catch(() => {});
                console.log(`    ✎ đăng vào #${ch.name}`);
            } catch (e) { console.warn(`    ! không đăng được vào #${ch.name}: ${e.message}`); }
        }

        // --- Dọn role thừa quyền (opt-in) ---
        if (HARDEN_ROLES) {
            for (const role of loosen.values()) {
                try { await role.setPermissions(role.permissions.remove(PermissionFlagsBits.MentionEveryone), 'Hạ quyền @everyone (Waguri setup)'); console.log(`  🔐 Đã gỡ @everyone khỏi role ${role.name}`); }
                catch (e) { console.warn(`  ! không gỡ được quyền role ${role.name}: ${e.message}`); }
            }
        }

        // --- Dọn kênh rác (opt-in) ---
        if (CLEANUP_CLUTTER) {
            for (const ch of clutter) {
                try { await ch.delete('Dọn kênh rác/trùng (Waguri setup)'); console.log(`  🧹 Đã xoá #${ch.name}`); }
                catch (e) { console.warn(`  ! không xoá được #${ch.name}: ${e.message}`); }
            }
        }

        console.log('\n✅ Xong! Việc làm tay còn lại:');
        console.log('   • Tạo invite VĨNH VIỄN -> gắn Top.gg + env SUPPORT_INVITE');
        console.log('   • Webhook #logs -> env LOG_WEBHOOK_URL');
        console.log('   • Soát role bot bên thứ ba có ADMIN; gỡ Administrator tạm của Waguri sau khi xong');
        if (!HARDEN_ROLES && loosen.size) console.log('   • (Tuỳ chọn) Bật HARDEN_ROLES để gỡ quyền @everyone của Helper/Voter');
        if (!CLEANUP_CLUTTER && clutter.length) console.log(`   • (Tuỳ chọn) Bật CLEANUP_CLUTTER để xoá: ${clutter.map(c => '#' + c.name).join(', ')}`);
    } catch (e) {
        console.error('❌ Lỗi:', e?.message || e);
    } finally {
        client.destroy();
        process.exit(0);
    }
});

client.login(process.env.DISCORD_TOKEN);
