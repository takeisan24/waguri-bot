// Xoá sạch slash command đã đăng ký (cả global + guild nếu có GUILD_ID),
// để khắc phục tình trạng lệnh hiện 2 lần (do đăng ký cả 2 scope).
// Chạy 1 lần:  node clear-commands.js   (hoặc: npm run clear)
// Sau đó khởi động lại bot -> nó đăng ký lại đúng 1 scope.
require('dotenv').config();
const { REST, Routes } = require('discord.js');

(async () => {
    const token = process.env.DISCORD_TOKEN;
    if (!token) { console.error('Thiếu DISCORD_TOKEN'); process.exit(1); }

    let clientId = process.env.CLIENT_ID;
    if (!clientId) clientId = Buffer.from(token.split('.')[0], 'base64').toString('utf-8');

    const rest = new REST().setToken(token);
    try {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log('✅ Đã xoá toàn bộ lệnh GLOBAL.');
        if (process.env.GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands(clientId, process.env.GUILD_ID), { body: [] });
            console.log(`✅ Đã xoá lệnh ở GUILD ${process.env.GUILD_ID}.`);
        }
        console.log('Xong! Khởi động lại bot để đăng ký lại đúng 1 scope nhé.');
    } catch (e) {
        console.error('Lỗi khi xoá lệnh:', e);
    }
})();
