#!/usr/bin/env node
/**
 * Kiểm tra & đẩy stats lên các bot-list ĐANG cấu hình token.
 *
 * Vì sao có file này: đường thật (`src/events/ready.js`) chỉ chạy khi bot khởi động,
 * nên muốn biết token mới dán có đúng không thì phải Restart rồi mò log. Script này
 * gọi CÙNG endpoint với cùng payload, in thẳng HTTP status ra — 5 giây là biết.
 *
 *   node scripts/check-botlist-stats.js          # đếm server thật rồi POST
 *   node scripts/check-botlist-stats.js --dry    # chỉ in payload, KHÔNG gửi đi
 *
 * Số server đếm qua REST `/users/@me/guilds` (không cần mở gateway).
 */
require('dotenv').config();

const DRY = process.argv.includes('--dry');
const API = 'https://discord.com/api/v10';

async function countGuilds(token) {
    let after = null, guilds = 0, members = 0;
    for (;;) {
        const url = `${API}/users/@me/guilds?limit=200&with_counts=true${after ? `&after=${after}` : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
        if (!res.ok) throw new Error(`Discord API ${res.status}: ${(await res.text()).slice(0, 160)}`);
        const page = await res.json();
        if (!page.length) break;
        guilds += page.length;
        members += page.reduce((s, g) => s + (g.approximate_member_count || 0), 0);
        if (page.length < 200) break;
        after = page[page.length - 1].id;
    }
    return { guilds, members };
}

async function main() {
    const discordToken = process.env.DISCORD_TOKEN;
    if (!discordToken) { console.error('✖ Thiếu DISCORD_TOKEN trong .env'); process.exit(1); }

    // Lấy ID TỪ TOKEN, không lấy từ CLIENT_ID: token là nguồn sự thật, còn CLIENT_ID
    // là thứ gõ tay nên có thể lệch (đã từng lệch thật). Đăng stats sai ID thì trang list
    // im lặng không cập nhật mà chẳng báo lỗi gì.
    const botId = Buffer.from(discordToken.split('.')[0], 'base64').toString('utf-8');
    if (process.env.CLIENT_ID && process.env.CLIENT_ID !== botId) {
        console.warn(`\n⚠ CLIENT_ID trong .env (${process.env.CLIENT_ID}) KHÁC app id của DISCORD_TOKEN (${botId}).`);
        console.warn('  Script này dùng id từ token. Nhưng index.js:110 lại tin CLIENT_ID -> đăng ký slash command sẽ hỏng. Sửa hoặc xoá CLIENT_ID.');
    }

    // In rõ ĐANG LÀ BOT NÀO. Máy dev thường cầm token bot test; đăng nhầm số server của bot
    // test lên trang list của bot thật là lỗi im lặng, nhìn log không ra.
    const me = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bot ${discordToken}` } })
        .then(r => r.ok ? r.json() : null).catch(() => null);

    const { guilds, members } = await countGuilds(discordToken);
    console.log(`\nĐang dùng DISCORD_TOKEN của: ${me ? `${me.username} (${me.id})` : botId}`);
    console.log(`→ ${guilds} server · ~${members.toLocaleString('vi-VN')} thành viên`);
    console.log('  (Nếu đây KHÔNG phải bot production, đừng chạy bản POST — sẽ đăng sai số lên trang list.)\n');

    const targets = [
        {
            name: 'Top.gg', token: process.env.TOPGG_TOKEN,
            env: 'TOPGG_TOKEN',
            url: `https://top.gg/api/bots/${botId}/stats`,
            payload: { server_count: guilds },
        },
        {
            name: 'DiscordBotList', token: process.env.DBL_TOKEN,
            env: 'DBL_TOKEN',
            url: `https://discordbotlist.com/api/v1/bots/${botId}/stats`,
            payload: { guilds, users: members, voice_connections: 0 },
        },
        {
            name: 'Discord.Bots.gg', token: process.env.DBGG_TOKEN,
            env: 'DBGG_TOKEN',
            url: `https://discord.bots.gg/api/v1/bots/${botId}/stats`,
            payload: { guildCount: guilds },
        },
    ];

    let sent = 0;
    for (const t of targets) {
        if (!t.token) { console.log(`⊘ ${t.name.padEnd(16)} chưa có ${t.env} -> bỏ qua`); continue; }
        if (DRY) { console.log(`· ${t.name.padEnd(16)} POST ${t.url}\n    ${JSON.stringify(t.payload)}`); sent++; continue; }

        const send = auth => fetch(t.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(t.payload),
        });
        try {
            let res = await send(t.token);
            let note = '';
            if ((res.status === 401 || res.status === 403) && !/^Bot /.test(t.token)) {
                res = await send(`Bot ${t.token}`);
                if (res.ok) note = ' (token cần tiền tố "Bot ")';
            }
            if (res.ok) { console.log(`✔ ${t.name.padEnd(16)} HTTP ${res.status}${note}`); sent++; }
            else console.log(`✖ ${t.name.padEnd(16)} HTTP ${res.status} — ${(await res.text().catch(() => '')).slice(0, 120)}`);
        } catch (e) {
            console.log(`✖ ${t.name.padEnd(16)} không kết nối được: ${e.message}`);
        }
    }
    console.log(`\n${DRY ? 'Dry-run' : 'Đã gửi'}: ${sent}/${targets.length} nền tảng.\n`);
}

main().catch(e => { console.error('✖', e.message); process.exit(1); });
