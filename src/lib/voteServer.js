// lib/voteServer.js — HTTP server nhận webhook vote từ Top.gg (thưởng TỨC THÌ) + health check.
//
// Top.gg gọi: POST /topgg/vote  body JSON { bot, user, type, isWeekend, query }
//   kèm header  Authorization: <chuỗi bí mật bạn đặt trong Top.gg dashboard = TOPGG_WEBHOOK_AUTH>.
// GET /  -> 200 "Waguri OK" (dùng cho uptime ping / kiểm tra sống).
//
// Bind vào cổng panel cấp (Wispbyte): PORT hoặc SERVER_PORT -> public qua subdomain.
// No-op nếu thiếu TOPGG_WEBHOOK_AUTH hoặc PORT (an toàn khi dev/local).
const http = require('node:http');
const db = require('../database.js');
const config = require('../config');
const { logError } = require('./logger');
const { computeVoteReward } = require('./voteReward');

const fmt = n => Number(n).toLocaleString('vi-VN');

// Số server + thành viên toàn bot (gộp mọi shard nếu có) — cho widget công khai trên web.
async function getPublicStats(client) {
    if (client.shard) {
        try {
            const [servers, members] = await Promise.all([
                client.shard.fetchClientValues('guilds.cache.size'),
                client.shard.broadcastEval(c => c.guilds.cache.reduce((s, g) => s + (g.memberCount || 0), 0)),
            ]);
            return {
                servers: servers.reduce((s, n) => s + (n || 0), 0),
                users: members.reduce((s, n) => s + (n || 0), 0),
            };
        } catch { /* fallback xuống tính cục bộ */ }
    }
    return {
        servers: client.guilds.cache.size,
        users: client.guilds.cache.reduce((s, g) => s + (g.memberCount || 0), 0),
    };
}

// Cộng thưởng cho 1 lượt vote. Dùng CHUNG cooldown 'vote_reward' với lệnh /vote
// (claim nguyên tử) -> không bao giờ phát thưởng trùng dù user vừa bấm /vote.
async function grantVoteReward(client, userId, isWeekend) {
    const cd = await db.claimCooldown(userId, 'vote_reward', config.VOTE.COOLDOWN_HOURS * 3600);
    if (cd) return; // đã nhận trong chu kỳ 12h này -> bỏ qua

    // Tăng chuỗi vote (RPC tự tạo user nếu lần đầu) -> tính thưởng theo streak.
    const streak = await db.bumpVoteStreak(userId, config.VOTE.STREAK_GRACE_HOURS * 3600);
    const { coins, exp, bonus } = computeVoteReward(streak, isWeekend);
    await db.addMoney(userId, coins, 'wallet');
    await db.updateExp(userId, exp);

    // DM cảm ơn (im lặng nếu user tắt DM)
    try {
        const user = await client.users.fetch(userId);
        await user.send(
            `🌸 Cảm ơn cậu đã vote cho Waguri${isWeekend ? ' (cuối tuần x2)' : ''}! ` +
            `Mình tặng cậu **${fmt(coins)}** ${config.CURRENCY} + **${exp} EXP** nè 💝\n` +
            `🔥 Chuỗi vote: **${streak} ngày**${bonus > 0 ? ` (thưởng chuỗi +${fmt(bonus)} ${config.CURRENCY})` : ''}\n` +
            `Nhớ ghé vote tiếp sau 12 tiếng để giữ chuỗi nha~`
        );
    } catch { /* user tắt DM -> bỏ qua */ }
}

function startVoteServer(client) {
    if (process.env.DISABLE_VOTE_SERVER === '1') return;

    const auth = process.env.TOPGG_WEBHOOK_AUTH;
    const port = Number(process.env.PORT || process.env.SERVER_PORT || 0);
    if (!auth || !port) {
        console.log('[VOTE] Bỏ qua vote webhook (cần TOPGG_WEBHOOK_AUTH + PORT/SERVER_PORT).');
        return;
    }
    // Khi chạy sharding: chỉ shard 0 bind cổng (tránh nhiều process tranh cùng port).
    if (client.shard && !client.shard.ids.includes(0)) return;

    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET') {
            // Số liệu công khai cho widget trên web (CORS mở vì chỉ đọc, không nhạy cảm)
            if (req.url.startsWith('/stats')) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                try {
                    const { servers, users } = await getPublicStats(client);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ servers, users }));
                } catch {
                    res.writeHead(500); res.end();
                }
                return;
            }
            // Health check (uptime ping)
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Waguri OK 🌸');
            return;
        }
        if (req.method !== 'POST' || !req.url.startsWith('/topgg/vote')) {
            res.writeHead(404); res.end(); return;
        }
        if (req.headers.authorization !== auth) {
            res.writeHead(401); res.end(); return;
        }

        let body = '';
        let aborted = false;
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 10_000) { aborted = true; req.destroy(); } // chặn payload bất thường
        });
        req.on('end', () => {
            if (aborted) return;
            res.writeHead(200); res.end(); // ACK ngay cho Top.gg (tránh bị retry)
            try {
                const data = JSON.parse(body || '{}');
                if (data.type === 'test') {
                    console.log('[VOTE] Nhận test webhook từ Top.gg ✅');
                    return;
                }
                if (data.type === 'upvote' && data.user) {
                    grantVoteReward(client, String(data.user), Boolean(data.isWeekend))
                        .catch(e => logError('vote reward', e));
                }
            } catch (e) {
                logError('vote webhook parse', e);
            }
        });
    });

    server.on('error', e => console.error('[VOTE] Lỗi HTTP server:', e?.message || e));
    server.listen(port, () => console.log(`[VOTE] Vote webhook + health check chạy ở cổng ${port}.`));
}

module.exports = { startVoteServer };
