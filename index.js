// Ép ưu tiên IPv4: tránh treo bắt tay WebSocket do IPv6 hỏng/định tuyến sai trên host (gây "Opening handshake has timed out").
require('node:dns').setDefaultResultOrder('ipv4first');
require('./src/lib/envLoader');
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');
const { logError } = require('./src/lib/logger');

const client = new Client({
    // Slash command + prefix command (đọc nội dung tin nhắn).
    // ⚠️ MessageContent là privileged intent -> phải BẬT trong Developer Portal
    //    (Bot -> Privileged Gateway Intents -> MESSAGE CONTENT INTENT).
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // cần cho event guildMemberAdd (privileged intent — phải bật trong Developer Portal)
    ],
});

// ---------------------------------------------------------
// 0. CHỐNG CRASH TOÀN CỤC
// Bot KHÔNG được sập vì 1 promise lỗi hay 1 exception lẻ (vd Supabase chập chờn).
// ---------------------------------------------------------
process.on('unhandledRejection', (reason) => { console.error('[UNHANDLED REJECTION]', reason); logError('Unhandled Rejection', reason); });
process.on('uncaughtException', (error) => { console.error('[UNCAUGHT EXCEPTION]', error); logError('Uncaught Exception', error); });

// Tắt mượt: đóng kết nối Discord gọn gàng khi nhận tín hiệu dừng (Wispbyte/PM2/Ctrl+C restart)
let shuttingDown = false;
function gracefulShutdown(sig) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[SYSTEM] Nhận ${sig} — đang tắt gọn gàng...`);
    try { client.destroy(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 1000);
}
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Collection lưu các lệnh (tên lệnh -> code thực thi)
client.commands = new Collection();

// ---------------------------------------------------------
// 1. NẠP COMMAND TỪ src/commands/<nhóm>/*.js
// ---------------------------------------------------------
const foldersPath = path.join(__dirname, 'src', 'commands');
const commandsAPI = [];   // dữ liệu lệnh gửi lên Discord API
const commandTable = [];  // hiển thị trạng thái ra console

for (const folder of fs.readdirSync(foldersPath)) {
    const commandsPath = path.join(foldersPath, folder);
    if (!fs.statSync(commandsPath).isDirectory()) continue;

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            const cmdJSON = command.data.toJSON();
            try {
                const { localizeCommandJSON } = require('./src/lib/commandLocalizer');
                localizeCommandJSON(cmdJSON);
            } catch (e) {
                console.error(`[SYSTEM] Không thể địa phương hóa lệnh ${command.data.name}:`, e);
            }
            commandsAPI.push(cmdJSON);
            commandTable.push({ 'Lệnh': `/${command.data.name}`, 'Trạng thái': '✅ Hoạt động' });
        } else {
            console.log(`[WARNING] Lệnh tại ${file} thiếu "data" hoặc "execute".`);
            commandTable.push({ 'Lệnh': file, 'Trạng thái': '❌ Thiếu cấu trúc' });
        }
    }
}

console.log('\n--- DANH SÁCH LỆNH (COMMANDS) ---');
console.table(commandTable);

// ---------------------------------------------------------
// 2. TỰ ĐỘNG ĐĂNG KÝ SLASH COMMAND LÊN DISCORD
//    - Có GUILD_ID (môi trường DEV): đăng ký theo server -> cập nhật TỨC THÌ.
//    - Không có GUILD_ID (PROD): đăng ký global (~1 tiếng Discord mới cache xong).
// ---------------------------------------------------------
if (process.env.SKIP_DEPLOY === '1') {
    console.log('[SYSTEM] SKIP_DEPLOY=1 -> bỏ qua đăng ký lệnh (commands không đổi).');
} else if (process.env.DISCORD_TOKEN) {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    (async () => {
        try {
            let clientId = process.env.CLIENT_ID;
            if (!clientId) {
                // Tự trích App ID từ token nếu thiếu CLIENT_ID
                clientId = Buffer.from(process.env.DISCORD_TOKEN.split('.')[0], 'base64').toString('utf-8');
            }

            const guildId = process.env.GUILD_ID;
            const route = guildId
                ? Routes.applicationGuildCommands(clientId, guildId)
                : Routes.applicationCommands(clientId);

            console.log(`[SYSTEM] Đăng ký ${commandsAPI.length} lệnh (${guildId ? `guild ${guildId} - tức thì` : 'global'})...`);
            await rest.put(route, { body: commandsAPI });

            // Dùng GUILD_ID (dev) thì DỌN lệnh global để tránh hiện 2 dòng trong menu.
            // Chiều ngược lại (PROD global -> dọn lệnh guild thừa) xử lý ở src/events/ready.js,
            // vì lúc này chưa biết bot đang ở những guild nào (cần client đã ready).
            if (guildId) {
                await rest.put(Routes.applicationCommands(clientId), { body: [] });
                console.log('[SYSTEM] Đã dọn lệnh global (tránh trùng).');
            }
            console.log('[SYSTEM] Đăng ký lệnh xong! 🚀\n');
        } catch (error) {
            console.error('[SYSTEM LỖI] Lỗi đăng ký lệnh:', error);
        }
    })();
}

// ---------------------------------------------------------
// 3. NẠP EVENT TỪ src/events/*.js
// ---------------------------------------------------------
const eventsPath = path.join(__dirname, 'src', 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// ---------------------------------------------------------
// 4. NẠP DANH SÁCH BAN (RAM) + ĐĂNG NHẬP
// ---------------------------------------------------------
require('./src/lib/bans').loadBans()
    .then(n => console.log(`[SYSTEM] Đã nạp ${n} user bị ban.`))
    .catch(() => {});
require('./src/lib/event').loadEvent()
    .then(e => console.log(`[SYSTEM] Sự kiện: ${e.until && Date.now() < e.until ? `x${e.mult} (${e.name || 'không tên'})` : 'không có'}.`))
    .catch(() => {});

// ---------------------------------------------------------
// 5. VÒNG ĐỜI GATEWAY + ĐĂNG NHẬP CÓ RETRY
//    Chịu được mạng host chập chờn / "Opening handshake has timed out".
// ---------------------------------------------------------
let lastReady = Date.now();
client.on('clientReady', () => { lastReady = Date.now(); });
client.on('shardReady', () => { lastReady = Date.now(); });
client.on('error', (e) => logError('client_error', e));
client.on('shardError', (e, id) => logError('shard_error', e, { shard: id }));
client.on('shardDisconnect', (ev, id) => console.warn(`[GATEWAY] Shard ${id} ngắt (code ${ev?.code}) — sẽ tự kết nối lại...`));
client.on('shardReconnecting', (id) => console.log(`[GATEWAY] Shard ${id} đang kết nối lại...`));
client.on('invalidated', () => {
    logError('session_invalidated', new Error('Session invalidated'));
    console.error('[GATEWAY] Session bị vô hiệu hoá — thoát để panel khởi động lại.');
    process.exit(1); // Wispbyte/Pterodactyl auto-restart
});

// Watchdog: gateway không Ready quá 5 phút -> thoát để panel restart sạch (chống trạng thái "zombie").
setInterval(() => {
    if (shuttingDown) return;
    const ready = client.ws?.status === 0; // 0 = Ready
    if (!ready && Date.now() - lastReady > 5 * 60_000) {
        console.error('[WATCHDOG] Gateway không Ready > 5 phút — thoát để restart.');
        process.exit(1);
    }
}, 60_000).unref();

// Telemetry kinh tế: chụp tổng cung tiền/phân bố định kỳ (upsert 1 dòng/ngày) để theo dõi lạm phát/exploit.
const db = require('./src/database.js');
async function runEconomySnapshot() {
    try {
        const snap = await db.snapshotEconomy();
        if (snap) console.log(`[TELEMETRY] Kinh tế ${snap.taken_on}: cung tiền ${snap.total_supply}, ${snap.user_count} user (${snap.active_7d} hoạt động 7d).`);
    } catch (e) { logError('economy_snapshot', e); }
}
setTimeout(runEconomySnapshot, 30_000).unref();            // chụp lần đầu sau khi khởi động ổn định
setInterval(runEconomySnapshot, 12 * 60 * 60_000).unref(); // rồi mỗi 12h

// Trình phân giải các phiên đấu giá đã kết thúc tự động mỗi phút
async function runAuctionResolution() {
    try {
        const resolved = await db.resolveExpiredAuctions();
        if (!resolved || resolved.length === 0) return;

        console.log(`[AUCTION] Đã kết thúc ${resolved.length} phiên đấu giá.`);
        const items = await db.getItems();

        for (const r of resolved) {
            const item = items.find(i => i.id === r.item_id);
            const itemName = item ? item.name : r.item_id;

            // 1. Gửi tin nhắn về channel gốc của máy chủ
            try {
                const channel = await client.channels.fetch(r.channel_id).catch(() => null);
                if (channel && channel.isTextBased()) {
                    if (r.outcome === 'sold') {
                        await channel.send(`🎉 **[ĐẤU GIÁ KẾT THÚC]** Chúc mừng <@${r.highest_bidder_id}> đã thắng phiên đấu giá **#${r.id}** của <@${r.seller_id}>! Đã nhận được **${r.qty}** ${itemName} với giá **${Number(r.current_bid).toLocaleString('vi-VN')} xu**!`);
                    } else {
                        await channel.send(`🔨 **[ĐẤU GIÁ KẾT THÚC]** Phiên đấu giá **#${r.id}** của <@${r.seller_id}> (bán **${r.qty}** ${itemName}) đã kết thúc mà không có ai đặt giá. Vật phẩm đã được hoàn lại về kho người bán.`);
                    }
                }
            } catch (e) {
                console.error(`[AUCTION ERROR] Không thể gửi thông báo về channel ${r.channel_id}:`, e.message);
            }

            // 2. Gửi DM cho người thắng và người bán
            if (r.outcome === 'sold') {
                // Gửi DM cho người thắng
                try {
                    const winner = await client.users.fetch(r.highest_bidder_id).catch(() => null);
                    if (winner) {
                        await winner.send(`🎉 Chúc mừng cậu đã thắng phiên đấu giá **#${r.id}**! Cậu đã nhận được **${r.qty}** ${itemName} với giá **${Number(r.current_bid).toLocaleString('vi-VN')} xu**.`);
                    }
                } catch (e) {
                    console.log(`[DM WARN] Không thể gửi DM cho người thắng ${r.highest_bidder_id}: ${e.message}`);
                }

                // Gửi DM cho người bán
                try {
                    const sellerUser = await client.users.fetch(r.seller_id).catch(() => null);
                    if (sellerUser) {
                        await sellerUser.send(`💰 Phiên đấu giá **#${r.id}** của cậu đã kết thúc thành công! Cậu nhận được **${Number(r.net_payout).toLocaleString('vi-VN')} xu** (sau khi trừ 5% thuế sàn).`);
                    }
                } catch (e) {
                    console.log(`[DM WARN] Không thể gửi DM cho người bán ${r.seller_id}: ${e.message}`);
                }
            }
        }
    } catch (e) {
        console.error('[AUCTION ERROR] runAuctionResolution():', e);
    }
}
setInterval(runAuctionResolution, 60_000).unref();

// Đăng nhập có retry/backoff (5s, 10s, ... tối đa 60s) — không bỏ cuộc khi bắt tay timeout lúc khởi động.
(async function startBot() {
    let attempt = 0;
    for (;;) {
        try {
            await client.login(process.env.DISCORD_TOKEN);
            return; // thành công — discord.js tự lo reconnect về sau
        } catch (err) {
            attempt++;
            const wait = Math.min(5000 * 2 ** (attempt - 1), 60000);
            logError('login_retry', err, { attempt });
            console.error(`[GATEWAY] Login lỗi (lần ${attempt}): ${err?.message}. Thử lại sau ${wait / 1000}s...`);
            await new Promise(r => setTimeout(r, wait));
        }
    }
})();
