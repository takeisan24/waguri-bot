// ============================================================
// shard.js — ĐIỂM CHẠY KHI ĐÃ SHARDING (để dành, CHƯA dùng).
// ------------------------------------------------------------
// KHI NÀO DÙNG: Discord BẮT BUỘC sharding khi bot ~2.500 guild. Khi gần ngưỡng,
// đổi startup từ `node index.js` -> `node shard.js` (Wispbyte: Startup Command).
// Hiện tại (vài chục/trăm guild) KHÔNG cần — cứ chạy index.js bình thường.
//
// CÁCH HOẠT ĐỘNG:
//  1) Đăng ký slash command GLOBAL đúng 1 LẦN ở tiến trình quản lý này
//     (nếu mỗi shard tự đăng ký sẽ bị Discord rate-limit).
//  2) Đặt SKIP_DEPLOY=1 cho mọi shard -> index.js (chạy trong shard) bỏ qua đăng ký.
//  3) ShardingManager tự spawn số shard phù hợp ('auto').
//
// ⚠️ LƯU Ý khi đã sharding:
//  - Top.gg autopost + /stats (ready.js, voteServer.js) ĐÃ shard-safe: cộng gộp qua
//    fetchClientValues/broadcastEval và chỉ shard 0 post/bind cổng. Không cần chỉnh thêm.
//  - State in-memory (loto/bingo, ngữ cảnh AI, cooldown) là theo-shard; an toàn vì mỗi
//    guild nằm trọn 1 shard. Dữ liệu game/kinh tế nằm ở Supabase nên dùng chung bình thường.
// ============================================================
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { ShardingManager, REST, Routes } = require('discord.js');

(async () => {
    // --- 1) Gom command data từ src/commands/<nhóm>/*.js ---
    const foldersPath = path.join(__dirname, 'src', 'commands');
    const commandsAPI = [];
    for (const folder of fs.readdirSync(foldersPath)) {
        const dir = path.join(foldersPath, folder);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
            const command = require(path.join(dir, file));
            if ('data' in command && 'execute' in command) commandsAPI.push(command.data.toJSON());
        }
    }

    // --- 2) Đăng ký GLOBAL một lần (trừ khi SKIP_DEPLOY=1) ---
    if (process.env.SKIP_DEPLOY !== '1' && process.env.DISCORD_TOKEN) {
        try {
            const rest = new REST().setToken(process.env.DISCORD_TOKEN);
            let clientId = process.env.CLIENT_ID;
            if (!clientId) clientId = Buffer.from(process.env.DISCORD_TOKEN.split('.')[0], 'base64').toString('utf-8');
            console.log(`[SHARD] Đăng ký ${commandsAPI.length} lệnh global (1 lần)...`);
            await rest.put(Routes.applicationCommands(clientId), { body: commandsAPI });
            console.log('[SHARD] Đăng ký lệnh xong! 🚀');
        } catch (e) {
            console.error('[SHARD] Lỗi đăng ký lệnh:', e?.message || e);
        }
    }

    // --- 3) Các shard KHÔNG tự đăng ký lại ---
    process.env.SKIP_DEPLOY = '1';

    const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
        token: process.env.DISCORD_TOKEN,
        totalShards: 'auto',
    });
    manager.on('shardCreate', shard => console.log(`[SHARD] Đã khởi chạy shard #${shard.id}`));
    await manager.spawn();
})();
