// lib/voteServer.js — HTTP server nhận webhook vote từ Top.gg (thưởng TỨC THÌ) + health check.
//
// Top.gg gọi: POST /topgg/vote  body JSON { bot, user, type, isWeekend, query }
//   kèm header  Authorization: <chuỗi bí mật bạn đặt trong Top.gg dashboard = TOPGG_WEBHOOK_AUTH>.
// GET /  -> 200 "Waguri OK" (dùng cho uptime ping / kiểm tra sống).
//
// Bind vào cổng panel cấp (Wispbyte): PORT hoặc SERVER_PORT -> public qua subdomain.
// No-op nếu thiếu TOPGG_WEBHOOK_AUTH hoặc PORT (an toàn khi dev/local).
const http = require('node:http');
const crypto = require('node:crypto');
const db = require('../database.js');
const config = require('../config');
const { logError } = require('./logger');
const { computeVoteReward } = require('./voteReward');
const { getProgress, getLevelFromExp } = require('./leveling');
const { tierOf } = require('./ai/persona');
const { extractPremiumCode } = require('./paymatch');

const fmt = n => Number(n).toLocaleString('vi-VN');

// Xác thực chữ ký webhook v1 của Top.gg.
// Header: x-topgg-signature: "t={unix},v1={hex}"; ký HMAC-SHA256("{t}.{rawBody}") bằng secret whs_...
function verifyV1Signature(rawBody, sigHeader, secret) {
    try {
        const parts = Object.fromEntries(String(sigHeader).split(',').map(kv => kv.split('=')));
        const t = parts.t, recv = parts.v1;
        if (!t || !recv) return false;
        const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
        const a = Buffer.from(expected), b = Buffer.from(recv);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

// So sánh chuỗi bí mật chống timing-attack (header webhook so với token cấu hình).
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

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

// --- Cache phản hồi API (giảm tải DB + Discord fetch) ---
const apiCache = new Map(); // key -> { exp, data }
function cacheGet(key) {
    const e = apiCache.get(key);
    if (e && e.exp > Date.now()) return e.data;
    if (e) apiCache.delete(key);
    return null;
}
function cacheSet(key, data, ttlMs = 60_000) {
    if (apiCache.size > 2000) apiCache.clear(); // chặn phình RAM
    apiCache.set(key, { exp: Date.now() + ttlMs, data });
}

// --- Throttle theo IP (chống lạm dụng endpoint công khai) ---
const ipHits = new Map();
function tooManyReq(ip) {
    const now = Date.now();
    const e = ipHits.get(ip);
    if (!e || e.reset < now) { ipHits.set(ip, { count: 1, reset: now + 10_000 }); return false; }
    return ++e.count > 60; // 60 req / 10s / IP
}
const JSONH = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

// Gộp dữ liệu hồ sơ công khai cho 1 user (DB + resolve tên/avatar qua Discord).
async function buildProfilePayload(client, id) {
    const prof = await db.getPublicProfile(id);
    if (!prof || !prof.exists) return null;
    if (!prof.public) return { id, hidden: true };

    let username = 'Người chơi', avatar = null;
    try { const u = await client.users.fetch(id); username = u.username; avatar = u.displayAvatarURL({ extension: 'png', size: 128 }); } catch { /* không fetch được */ }
    let partner = null;
    if (prof.partner_id) { try { partner = (await client.users.fetch(String(prof.partner_id))).username; } catch { /* bỏ qua */ } }

    const p = getProgress(Number(prof.exp || 0));
    const tier = tierOf(Number(prof.affection || 0));
    return {
        id, username, avatar, hidden: false,
        level: p.level, expInto: p.expIntoLevel, expForNext: p.expForNextLevel,
        wallet: Number(prof.wallet || 0), bank: Number(prof.bank || 0),
        netWorth: Number(prof.wallet || 0) + Number(prof.bank || 0),
        job: prof.job || null,
        affection: Number(prof.affection || 0), affectionTier: tier ? tier.name : null,
        partner, clan: prof.clan || null,
        title: prof.title || null,
        color: /^[0-9a-fA-F]{6}$/.test(prof.color || '') ? `#${prof.color}` : null,
        achievements: Number(prof.achievements || 0),
        rank: Number(prof.wealth_rank || 0),
    };
}

// Bảng xếp hạng (top theo tài sản hoặc cấp). guildId -> theo server, null -> toàn cầu.
async function buildLeaderboardPayload(client, type, limit, guildId = null) {
    const sort = type === 'level' ? 'level' : 'networth';
    const rows = guildId
        ? await db.getLeaderboardGuild(sort, limit, guildId)
        : await db.getLeaderboard(sort, limit);
    const out = [];
    for (const r of rows) {
        let username = 'Người chơi', avatar = null;
        try { const u = await client.users.fetch(String(r.user_id)); username = u.username; avatar = u.displayAvatarURL({ extension: 'png', size: 64 }); } catch { /* bỏ qua */ }
        out.push({
            id: r.user_id, username, avatar,
            value: sort === 'level' ? getLevelFromExp(Number(r.exp || 0)) : Number(r.networth || 0),
        });
    }
    return { type: sort === 'level' ? 'level' : 'wealth', rows: out };
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

// --- Casso webhook: tiền vào TK Vietcombank -> gia hạn Premium tức thì ---
// Casso POST /casso/webhook, header: secure-token: <CASSO_WEBHOOK_TOKEN>.
// Body Casso V2: { data: {...} } | legacy: { data: [ {...} ] }. Mỗi giao dịch có
// description (nội dung CK chứa mã WAGURI), amount, tid/reference. Idempotent ở tầng RPC.

// DM cảm ơn sau khi kích hoạt Premium (dùng chung mọi cổng thanh toán).
async function dmPremiumThanks(client, r) {
    try {
        const user = await client.users.fetch(String(r.user_id));
        const until = r.until ? Math.floor(new Date(r.until).getTime() / 1000) : null;
        await user.send(
            `🌸 Cảm ơn cậu đã nâng cấp **Waguri Premium** 💎!\n` +
            `Mình đã kích hoạt **+${r.months} tháng** cho cậu rồi nè~` +
            (until ? ` Hết hạn <t:${until}:R>.` : '') +
            `\nGõ \`/premium\` để xem quyền lợi nha 💕`
        );
    } catch { /* user tắt DM -> bỏ qua */ }
}

// Xử lý webhook Casso (đã xác thực token): khớp đơn theo MÃ trong nội dung CK.
async function grantCassoPremium(client, payload) {
    // Casso V2: payload.data là object; legacy: là mảng giao dịch.
    const list = Array.isArray(payload?.data) ? payload.data : (payload?.data ? [payload.data] : []);
    for (const tx of list) {
        const amount = Math.round(Number(tx?.amount || 0));
        if (amount <= 0) continue; // chỉ xử lý tiền VÀO
        const code = extractPremiumCode(tx?.description || tx?.content || '');
        if (!code) { console.log('[CASSO] Giao dịch không có mã đơn, bỏ qua.'); continue; }
        const ref = String(tx?.tid || tx?.reference || tx?.id || '');

        const r = await db.redeemPremiumOrderByCode(code, amount, ref);
        if (!r?.ok) { console.log(`[CASSO] Đơn ${code} không khớp:`, r?.reason); continue; }
        if (r.already) { console.log(`[CASSO] Đơn ${code} đã xử lý trước đó (idempotent).`); continue; }

        console.log(`[CASSO] ✅ Premium +${r.months} tháng cho ${r.user_id} (đơn ${code}).`);
        await dmPremiumThanks(client, r);
    }
}

function startVoteServer(client) {
    if (process.env.DISABLE_VOTE_SERVER === '1') return;

    const auth = process.env.TOPGG_WEBHOOK_AUTH;
    const cassoToken = process.env.CASSO_WEBHOOK_TOKEN; // Secure-Token cấu hình ở Casso
    const port = Number(process.env.PORT || process.env.SERVER_PORT || 0);
    if (!port) {
        console.log('[VOTE] Bỏ qua HTTP server (chưa có PORT/SERVER_PORT).');
        return;
    }
    // /stats + health chỉ cần PORT là chạy. Webhook chỉ kích hoạt khi có TOPGG_WEBHOOK_AUTH
    // (lấy sau khi bot được duyệt). Chưa có secret -> webhook trả 503, các route khác vẫn ổn.
    if (!auth) console.log('[VOTE] Chưa có TOPGG_WEBHOOK_AUTH -> webhook tạm tắt (/stats + health vẫn chạy).');
    if (!cassoToken) console.log('[CASSO] Chưa có CASSO_WEBHOOK_TOKEN -> webhook thanh toán tạm tắt.');
    else console.log('[CASSO] Webhook thanh toán Premium sẵn sàng ở /casso/webhook.');
    // Khi chạy sharding: chỉ shard 0 bind cổng (tránh nhiều process tranh cùng port).
    if (client.shard && !client.shard.ids.includes(0)) return;

    const server = http.createServer(async (req, res) => {
        if (req.method === 'GET') {
            // --- API công khai (chỉ đọc) cho web: hồ sơ & bảng xếp hạng ---
            if (req.url.startsWith('/api/')) {
                const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
                if (tooManyReq(ip)) { res.writeHead(429, JSONH); res.end('{"error":"rate_limited"}'); return; }

                if (req.url.startsWith('/api/profile/')) {
                    const id = decodeURIComponent(req.url.slice('/api/profile/'.length).split(/[?#]/)[0]).trim();
                    if (!/^\d{5,25}$/.test(id)) { res.writeHead(400, JSONH); res.end('{"error":"bad_id"}'); return; }
                    let data = cacheGet('p:' + id);
                    if (!data) { data = await buildProfilePayload(client, id); if (data) cacheSet('p:' + id, data); }
                    if (!data) { res.writeHead(404, JSONH); res.end('{"error":"not_found"}'); return; }
                    res.writeHead(200, JSONH); res.end(JSON.stringify(data));
                    return;
                }
                if (req.url.startsWith('/api/leaderboard')) {
                    const q = new URL(req.url, 'http://local');
                    const type = q.searchParams.get('type') === 'level' ? 'level' : 'wealth';
                    const limit = Math.min(Math.max(Number(q.searchParams.get('limit')) || 10, 1), 25);
                    const guildRaw = q.searchParams.get('guild');
                    const guild = guildRaw && /^\d{5,25}$/.test(guildRaw) ? guildRaw : null;
                    const key = `lb:${type}:${limit}:${guild || 'global'}`;
                    let data = cacheGet(key);
                    if (!data) { data = await buildLeaderboardPayload(client, type, limit, guild); cacheSet(key, data); }
                    res.writeHead(200, JSONH); res.end(JSON.stringify(data));
                    return;
                }
                if (req.url.startsWith('/api/guilds')) {
                    // ID các server bot đang ở (để web lọc "server chung" với user). Chỉ ID -> không lộ tên.
                    res.writeHead(200, JSONH); res.end(JSON.stringify({ ids: client.guilds.cache.map(g => g.id) }));
                    return;
                }
                res.writeHead(404, JSONH); res.end('{"error":"not_found"}');
                return;
            }

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
        const isVote = req.url.startsWith('/topgg/vote');
        const isCasso = req.url.startsWith('/casso/webhook');
        if (req.method !== 'POST' || (!isVote && !isCasso)) {
            res.writeHead(404); res.end(); return;
        }

        let body = '';
        let aborted = false;
        req.on('data', chunk => {
            body += chunk;
            if (body.length > 20_000) { aborted = true; req.destroy(); } // chặn payload bất thường
        });
        req.on('end', () => {
            if (aborted) return;

            // --- Casso webhook (thanh toán Premium) ---
            if (isCasso) {
                // Chưa cấu hình token -> không xác thực được -> từ chối (chống lỗ hổng).
                if (!cassoToken) { res.writeHead(503); res.end(); return; }
                if (!safeEqual(req.headers['secure-token'], cassoToken)) { res.writeHead(401); res.end(); return; }
                let payload;
                try { payload = JSON.parse(body || '{}'); } catch { res.writeHead(400); res.end(); return; }
                res.writeHead(200, JSONH); res.end('{"success":true}'); // Casso strict mode cần 200 + success
                grantCassoPremium(client, payload).catch(e => logError('casso premium', e));
                return;
            }

            // Chưa cấu hình secret -> không thể xác thực -> từ chối mọi webhook (chống lỗ hổng).
            if (!auth) { res.writeHead(503); res.end(); return; }

            const sig = req.headers['x-topgg-signature'];
            if (sig) {
                // --- Webhook v1: xác thực chữ ký HMAC (secret = whs_..., đặt ở TOPGG_WEBHOOK_AUTH) ---
                if (!verifyV1Signature(body, sig, auth)) { res.writeHead(401); res.end(); return; }
                res.writeHead(200); res.end(); // ACK trong 5s
                try {
                    const data = JSON.parse(body || '{}');
                    if (data.type === 'webhook.test') { console.log('[VOTE] Nhận test webhook v1 từ Top.gg ✅'); return; }
                    const uid = data?.data?.user?.platform_id;
                    if (data.type === 'vote.create' && uid) {
                        grantVoteReward(client, String(uid), Number(data?.data?.weight) === 2)
                            .catch(e => logError('vote reward', e));
                    }
                } catch (e) { logError('vote webhook v1 parse', e); }
                return;
            }

            // --- Webhook v0 (legacy): so khớp secret ở header Authorization (timing-safe) ---
            if (!safeEqual(req.headers.authorization, auth)) { res.writeHead(401); res.end(); return; }
            res.writeHead(200); res.end(); // ACK ngay cho Top.gg (tránh bị retry)
            try {
                const data = JSON.parse(body || '{}');
                if (data.type === 'test') { console.log('[VOTE] Nhận test webhook v0 từ Top.gg ✅'); return; }
                if (data.type === 'upvote' && data.user) {
                    grantVoteReward(client, String(data.user), Boolean(data.isWeekend))
                        .catch(e => logError('vote reward', e));
                }
            } catch (e) {
                logError('vote webhook v0 parse', e);
            }
        });
    });

    server.on('error', e => console.error('[VOTE] Lỗi HTTP server:', e?.message || e));
    server.listen(port, () => console.log(`[VOTE] Vote webhook + health check chạy ở cổng ${port}.`));
}

module.exports = { startVoteServer };
