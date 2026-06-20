require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');

const client = new Client({
    // Slash command + prefix command (đọc nội dung tin nhắn).
    // ⚠️ MessageContent là privileged intent -> phải BẬT trong Developer Portal
    //    (Bot -> Privileged Gateway Intents -> MESSAGE CONTENT INTENT).
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// ---------------------------------------------------------
// 0. CHỐNG CRASH TOÀN CỤC
// Bot KHÔNG được sập vì 1 promise lỗi hay 1 exception lẻ (vd Supabase chập chờn).
// ---------------------------------------------------------
process.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));
process.on('uncaughtException', (error) => console.error('[UNCAUGHT EXCEPTION]', error));

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
            commandsAPI.push(command.data.toJSON());
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

client.login(process.env.DISCORD_TOKEN);
