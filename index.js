require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, REST, Routes } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

// ---------------------------------------------------------
// 0. CHỐNG CRASH TOÀN CỤC
// Bot KHÔNG được sập vì 1 promise lỗi hay 1 exception lẻ
// (vd: Supabase chập chờn). Ghi log để debug nhưng giữ tiến trình sống.
// ---------------------------------------------------------
process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});
process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
});

// Tạo Collection để lưu các lệnh (tên lệnh tương ứng với code thực thi)
client.commands = new Collection();

// ---------------------------------------------------------
// 1. COMMAND HANDLER VÀ TỰ ĐỘNG ĐĂNG KÝ
// ---------------------------------------------------------
const foldersPath = path.join(__dirname, 'src', 'commands');
if (!fs.existsSync(foldersPath)) {
    fs.mkdirSync(foldersPath, { recursive: true });
}

const commandFolders = fs.readdirSync(foldersPath);
const commandsAPI = []; // Chứa dữ liệu lệnh để gửi lên API
const commandTable = []; // Dùng để hiển thị trạng thái lệnh ra console

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    if (!fs.statSync(commandsPath).isDirectory()) continue;
    
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            commandsAPI.push(command.data.toJSON());
            commandTable.push({ Lệnh: `/${command.data.name}`, 'Trạng thái': '✅ Hoạt động' });
        } else {
            console.log(`[WARNING] Lệnh tại ${filePath} thiếu thuộc tính "data" hoặc "execute".`);
            commandTable.push({ Lệnh: file, 'Trạng thái': '❌ Lỗi/Thiếu Cấu Trúc' });
        }
    }
}

// In ra bảng danh sách lệnh đẹp mắt
console.log('\n--- DANH SÁCH LỆNH (COMMANDS) ---');
console.table(commandTable);

// Tự động Deploy Commands lên Discord
if (process.env.DISCORD_TOKEN) {
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    (async () => {
        try {
            console.log(`[SYSTEM] Bắt đầu tự động làm mới ${commandsAPI.length} lệnh (/) lên Discord API...`);
            let clientId = process.env.CLIENT_ID;
            
            // Nếu không có CLIENT_ID trong .env, tự động lấy qua token
            if (!clientId) {
                try {
                    clientId = Buffer.from(process.env.DISCORD_TOKEN.split('.')[0], 'base64').toString('utf-8');
                } catch (e) {
                    console.log("[LỖI] Không thể trích xuất App ID từ Token.");
                }
            }

            if (clientId) {
                await rest.put(
                    Routes.applicationCommands(clientId),
                    { body: commandsAPI },
                );
                console.log(`[SYSTEM] Đã tự động đăng ký lệnh xong! Sẵn sàng sử dụng. 🚀\n`);
            }
        } catch (error) {
            console.error('[SYSTEM LỖI] Lỗi đăng ký lệnh:', error);
        }
    })();
}

// ---------------------------------------------------------
// 2. EVENT HANDLER
// ---------------------------------------------------------
const eventsPath = path.join(__dirname, 'src', 'events');
if (!fs.existsSync(eventsPath)) {
    fs.mkdirSync(eventsPath, { recursive: true });
}

const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// ---------------------------------------------------------
// 3. SERVER HTTP (GIỮ BOT HOẠT ĐỘNG 24/7 TRÊN RENDER.COM)
// ---------------------------------------------------------
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Tín hiệu mạng bắt được thành công! Discord Bot (Choco) đã sẵn sàng hoạt động 24/7. 🚀');
});

app.listen(port, () => {
    console.log(`[HTTP SERVER] Web server đang chạy ở port ${port}`);
});

// ---------------------------------------------------------
// LOGIN
// ---------------------------------------------------------
// Chú ý: Sử dụng DISCORD_TOKEN từ file .env
client.login(process.env.DISCORD_TOKEN);