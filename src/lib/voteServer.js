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
// Vòng đời đơn Premium (duyệt + cảm ơn + báo owner) nằm ở một chỗ duy nhất.
const { dmPremiumThanks, notifyOwnersOfClaim } = require('./premiumOrders');
const { getInteractionLanguage, t } = require('./i18n');
// Danh tính bản dựng — để hỏi được từ xa "prod đang chạy mã nào, khởi động lúc nào".
const { banBuild } = require('./banBuild');

// Trước đây ghim cứng 'vi-VN' nên người dùng EN đọc "1.000.000" thay vì "1,000,000".
// Mặc định 'vi' để những nơi gọi chưa truyền locale giữ nguyên hành vi cũ.
const fmt = (n, locale = 'vi') => Number(n).toLocaleString(String(locale).startsWith('en') ? 'en-US' : 'vi-VN');

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
/**
 * Số người chơi THẬT của bot, đọc từ ảnh chụp telemetry hằng ngày.
 *
 * VÌ SAO KHÔNG ĐẾM TRỰC TIẾP: `/stats` là endpoint dịch vụ uptime gọi liên tục — một truy
 * vấn gộp mỗi lượt gọi là tự bắn vào chân. `economy_snapshots` đã tính sẵn mỗi ngày (xem
 * `runEconomySnapshot` ở index.js), nên đây chỉ là một lượt đọc có chỉ mục, lại còn cache
 * 5 phút.
 *
 * VÌ SAO KHÔNG DÙNG `users.last_seen`: cột đó RỖNG ở 434/470 người (đo 28-08). Dùng nó sẽ
 * báo 19 người hoạt động trong khi con số thật là 236. Ảnh chụp lấy từ `economy_ledger` nên
 * đúng. Bẫy này đã ghi trong sổ và từng làm tôi kết luận sai một lần rồi.
 */
async function layThongKeNguoiChoi() {
    const daCo = cacheGet('thong-ke-nguoi-choi');
    if (daCo) return daCo;
    try {
        const [snap] = await db.getEconomySnapshots(1);
        if (!snap) return null;
        const ra = {
            players: Number(snap.user_count || 0),
            activePlayers: Number(snap.active_7d || 0),
        };
        cacheSet('thong-ke-nguoi-choi', ra, 5 * 60_000);
        return ra;
    } catch {
        return null;   // thiếu số người chơi không được phép làm hỏng health check
    }
}

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

    const uObj = await db.getUser(id);
    const prestige = uObj ? (uObj.prestige || 0) : 0;
    const badges = await db.getUserBadges(id);

    const p = getProgress(Number(prof.exp || 0));
    const tier = tierOf(Number(prof.affection || 0));
    return {
        id, username, avatar, hidden: false,
        level: p.level, expInto: p.expIntoLevel, expForNext: p.expForNextLevel,
        wallet: Number(prof.wallet || 0), bank: Number(prof.bank || 0),
        netWorth: Number(prof.wallet || 0) + Number(prof.bank || 0),
        job: prof.job || null,
        job_id: uObj?.job_id || null,
        bio: uObj?.bio || null,
        affection: Number(prof.affection || 0), affectionTier: tier ? tier.name : null,
        partner, clan: prof.clan || null,
        title: prof.title || null,
        color: /^[0-9a-fA-F]{6}$/.test(prof.color || '') ? `#${prof.color}` : null,
        achievements: Number(prof.achievements || 0),
        rank: Number(prof.wealth_rank || 0),
        prestige,
        badges,
        language: uObj?.language || 'vi',
    };
}

async function buildBakeryPayload(client, id) {
    // Tôn trọng hồ sơ ẩn: user đặt profile_public=false -> không lộ tên/avatar/tiệm (khớp buildProfilePayload).
    const prof = await db.getPublicProfile(id);
    if (prof && prof.public === false) return { id, hidden: true };

    const bakery = await db.getBakeryWithLikes(id);
    if (!bakery) return null;

    let username = 'Chủ tiệm', avatar = null;
    try {
        const u = await client.users.fetch(id);
        username = u.username;
        avatar = u.displayAvatarURL({ extension: 'png', size: 128 });
    } catch { /* không fetch được */ }

    return {
        id,
        username,
        avatar,
        level: bakery.level,
        decor: bakery.decor || [],
        staff: bakery.staff || [],
        likes: bakery.likes || 0
    };
}

// Bảng xếp hạng (top theo tài sản hoặc cấp). guildId -> theo server, null -> toàn cầu.
async function buildLeaderboardPayload(client, type, limit, guildId = null) {
    if (type === 'bakery') {
        const rows = await db.getBakeryLeaderboard(limit, 0);
        const out = [];
        for (const r of rows) {
            let username = 'Chủ tiệm', avatar = null;
            try { const u = await client.users.fetch(String(r.user_id)); username = u.username; avatar = u.displayAvatarURL({ extension: 'png', size: 64 }); } catch { /* bỏ qua */ }
            out.push({
                id: r.user_id, username, avatar,
                value: Number(r.bakery_score || 0),
                level: r.level,
                likes: r.likes_count
            });
        }
        return { type: 'bakery', rows: out };
    }

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
    // PHẢI tạo dòng users TRƯỚC khi claim cooldown. `cooldowns.user_id` có khoá ngoại tới
    // `users`, nên người vote mà CHƯA từng dùng bot sẽ làm insert cooldown vỡ khoá ngoại;
    // `claimCooldown` fail-open (database.js: DB lỗi -> trả false = cho qua) nên lượt đó
    // vẫn phát thưởng NHƯNG không ghi được cooldown. Lượt vote thứ hai trong cùng chu kỳ
    // lúc đó mới ghi được cooldown và LẠI phát thưởng lần nữa -> nhận đúp ở người mới.
    // (Đường Top.gg trước đây thoát nạn nhờ `bumpVoteStreak` tạo user, nhưng nó chạy SAU.)
    await db.getUser(userId);

    const cd = await db.claimCooldown(userId, 'vote_reward', config.VOTE.COOLDOWN_HOURS * 3600);
    if (cd) return; // đã nhận trong chu kỳ 12h này -> bỏ qua

    db.questIncr(userId, 'vote', 1); // nhiệm vụ: vote Top.gg (đếm 1 lần/chu kỳ nhờ guard cooldown ở trên)

    // Tăng chuỗi vote (RPC tự tạo user nếu lần đầu) -> tính thưởng theo streak.
    const streak = await db.bumpVoteStreak(userId, config.VOTE.STREAK_GRACE_HOURS * 3600);
    const { coins, exp, bonus } = computeVoteReward(streak, isWeekend);
    // Cùng lớp lỗi đã vá ở LỆNH `/vote` (`d23cc69`) — nhưng Top.gg gọi WEBHOOK chứ không gọi
    // lệnh, nên vá một đường là để lọt đường kia. `addMoney` với số dương chỉ hỏng theo kiểu
    // `null` (DB lỗi), và lúc đó DM bên dưới vẫn khoe "cậu nhận được N xu".
    //
    // KHÔNG thử trả lại: cooldown đã đặt ở trên chính là cổng chống nhận đúp (xem chú thích
    // dài ngay đầu hàm) — trả lần nữa là mở lại đúng cái race mà thứ tự đó sinh ra để chặn.
    const daTra = await db.addMoney(userId, coins, 'wallet');
    if (daTra !== true) console.error(`[PAYOUT FAIL] vote-topgg user=${userId} coins=${coins}`);
    // EXP cũng được KHOE trong DM ("{coins} xu + {exp} EXP"), nên nó phải được kiểm y
    // như tiền. Bản vá trước chỉ chạm nửa xu và để nguyên nửa EXP — đúng lỗi "vá một
    // đường, lọt đường kia" mà chính commit đó đang nói tới.
    const daExp = await db.updateExp(userId, exp);
    if (daExp === null) console.error(`[EXP FAIL] vote user=${userId} exp=${exp}`);

    // DM cảm ơn (im lặng nếu user tắt DM)
    try {
        const user = await client.users.fetch(userId);
        // DM không có guild, nên `getInteractionLanguage` bỏ qua bậc cấu hình server và rơi
        // thẳng xuống bậc 2 — đọc `users.locale` trong DB. Đúng thứ cần cho tin nhắn riêng.
        const locale = await getInteractionLanguage({ user: { id: userId } });
        await user.send(t(locale, 'lib.voteServer.dm_vote_thanks', {
            weekend: isWeekend ? t(locale, 'lib.voteServer.dm_vote_weekend') : '',
            coins: fmt(coins, locale),
            currency: config.CURRENCY,
            exp,
            streak,
            bonus: bonus > 0
                ? t(locale, 'lib.voteServer.dm_vote_streak_bonus', { amount: fmt(bonus, locale), currency: config.CURRENCY })
                : '',
        // Dùng lại đúng chuỗi của lệnh `/vote`: cùng một sự việc, và nó đã chỉ sẵn cách tự
        // kiểm (`/bank balance`) lẫn trấn an rằng LƯỢT VOTE không mất.
        }) + ((daTra !== true || daExp === null) ? t(locale, 'commands.vote.payout_unconfirmed') : ''));
    } catch { /* user tắt DM -> bỏ qua */ }
}

// --- discordbotlist.com: thưởng vote ---
//
// Payload của họ mỏng hơn Top.gg nhiều: { id, username, avatar, admin } — không có `type`
// (nên không phân biệt được cú test), không có cờ cuối tuần. Chỉ `id` là thứ ta cần.
//
// Cooldown để KHÓA RIÊNG (`vote_reward_dbl`), không dùng chung với Top.gg: vote hai nơi là
// hai lần bấm thật, chung khoá thì lần thứ hai im lặng không thưởng — người dùng sẽ tưởng hỏng.
// Bù lại mức thưởng phẳng và thấp hơn (xem chú thích VOTE.DBL trong config).
async function grantDblVoteReward(client, userId) {
    await db.getUser(userId); // tạo dòng users trước — xem chú thích ở grantVoteReward

    const cd = await db.claimCooldown(userId, 'vote_reward_dbl', config.VOTE.DBL.COOLDOWN_HOURS * 3600);
    if (cd) return; // đã nhận trong chu kỳ này -> bỏ qua

    db.questIncr(userId, 'vote', 1); // vote ở đâu cũng tính vào nhiệm vụ vote

    const { REWARD: coins, EXP: exp } = config.VOTE.DBL;
    // Cooldown đã set trước = cổng dedup. addMoney lỗi thì log để cứu tay, không grant-first.
    // Bản cũ CÓ kiểm và ghi log, nhưng DM bên dưới vẫn khoe vô điều kiện — tức người dùng
    // vẫn đọc "cậu nhận được N xu" khi tiền chưa vào. Giữ kết quả để DM nói thật.
    const daTra = await db.addMoney(userId, coins, 'wallet');
    if (daTra !== true) console.error(`[PAYOUT FAIL] vote-dbl user=${userId} coins=${coins}`);
    // EXP cũng được KHOE trong DM ("{coins} xu + {exp} EXP"), nên nó phải được kiểm y
    // như tiền. Bản vá trước chỉ chạm nửa xu và để nguyên nửa EXP — đúng lỗi "vá một
    // đường, lọt đường kia" mà chính commit đó đang nói tới.
    const daExp = await db.updateExp(userId, exp);
    if (daExp === null) console.error(`[EXP FAIL] vote user=${userId} exp=${exp}`);

    try {
        const user = await client.users.fetch(userId);
        const locale = await getInteractionLanguage({ user: { id: userId } });
        await user.send(t(locale, 'lib.voteServer.dm_vote_thanks_dbl', {
            coins: fmt(coins, locale),
            currency: config.CURRENCY,
            exp,
        }) + ((daTra !== true || daExp === null) ? t(locale, 'commands.vote.payout_unconfirmed') : ''));
    } catch { /* user tắt DM -> bỏ qua */ }
}

// --- Casso webhook: tiền vào TK Vietcombank -> gia hạn Premium tức thì ---
// Casso POST /casso/webhook, header: secure-token: <CASSO_WEBHOOK_TOKEN>.
// Body Casso V2: { data: {...} } | legacy: { data: [ {...} ] }. Mỗi giao dịch có
// description (nội dung CK chứa mã WAGURI), amount, tid/reference. Idempotent ở tầng RPC.

// Cảnh báo owner về một giao dịch KHÔNG tự xử lý được.
//
// VÌ SAO PHẢI CÓ: mọi nhánh hỏng dưới đây đều là "tiền đã VÀO tài khoản nhưng Premium
// KHÔNG được kích hoạt". Trước đây tất cả chỉ `console.log` — tức là im lặng với cả hai
// bên: người mua ngồi chờ, owner không biết gì. Người vừa trả tiền là người dễ mất niềm
// tin nhất, nên đây là loại lỗi đắt nhất trong cả luồng.
//
// Dùng lại LOG_WEBHOOK_URL (kênh log nhà phát triển) — logError đã có throttle + gộp trùng.
async function canhBaoTienLe(tieuDe, chiTiet) {
    console.warn(`[THANH TOÁN] ${tieuDe} — ${chiTiet}`);
    await logError(`💸 ${tieuDe}`, chiTiet, {});
}

// Xử lý webhook cổng thanh toán (đã xác thực token): khớp đơn theo MÃ trong nội dung CK.
async function grantCassoPremium(client, payload) {
    // Casso V2: payload.data là object; legacy: là mảng giao dịch.
    const list = Array.isArray(payload?.data) ? payload.data : (payload?.data ? [payload.data] : []);
    for (const tx of list) {
        const amount = Math.round(Number(tx?.amount || 0));
        if (amount <= 0) continue; // chỉ xử lý tiền VÀO
        const noiDung = String(tx?.description || tx?.content || '');
        const ref = String(tx?.tid || tx?.reference || tx?.id || '');
        const code = extractPremiumCode(noiDung);

        // Không có mã trong nội dung CK — trường hợp THƯỜNG GẶP NHẤT: người chuyển tự sửa
        // nội dung, hoặc app ngân hàng cắt bớt. Tiền đã vào, phải đối soát bằng tay.
        if (!code) {
            await canhBaoTienLe('Tiền vào KHÔNG có mã đơn — cần đối soát tay', [
                `Số tiền: ${amount.toLocaleString('vi-VN')}đ`,
                `Nội dung CK: "${noiDung}"`,
                `Ref: ${ref}`,
                'Tìm đơn tương ứng bằng `/premium-admin cho` rồi duyệt bằng `/premium-admin duyet`.',
            ].join('\n'));
            continue;
        }

        const r = await db.redeemPremiumOrderByCode(code, amount, ref);
        if (r?.already) { console.log(`[THANH TOÁN] Đơn ${code} đã xử lý trước đó (idempotent).`); continue; }

        if (!r?.ok) {
            // `amount` = chuyển thiếu tiền; `not_found` = mã đúng định dạng nhưng không có đơn.
            const vi = r?.reason === 'amount'
                ? `Chuyển THIẾU tiền: cần ${Number(r.need).toLocaleString('vi-VN')}đ, nhận ${Number(r.got).toLocaleString('vi-VN')}đ.`
                : `Không khớp đơn nào (lý do: ${r?.reason}).`;
            await canhBaoTienLe('Tiền vào nhưng KHÔNG kích hoạt được', [
                `Đơn: ${code}`,
                vi,
                `Nội dung CK: "${noiDung}"`,
                `Ref: ${ref}`,
                'Quyết định bằng tay: duyệt (`/premium-admin duyet`) hoặc hoàn tiền.',
            ].join('\n'));
            continue;
        }

        console.log(`[THANH TOÁN] ✅ Premium +${r.months} tháng cho ${r.user_id} (đơn ${code}).`);
        await dmPremiumThanks(client, r);
    }
}

function startVoteServer(client) {
    if (process.env.DISABLE_VOTE_SERVER === '1') return;

    const auth = process.env.TOPGG_WEBHOOK_AUTH;
    const dblAuth = process.env.DBL_WEBHOOK_AUTH; // secret tự đặt ở discordbotlist.com -> Edit -> Webhook
    const cassoToken = process.env.CASSO_WEBHOOK_TOKEN; // Secure-Token cấu hình ở Casso
    const notifySecret = process.env.BOT_NOTIFY_SECRET; // chuỗi bí mật dùng chung với web
    const port = Number(process.env.PORT || process.env.SERVER_PORT || 0);
    if (!port) {
        console.log('[VOTE] Bỏ qua HTTP server (chưa có PORT/SERVER_PORT).');
        return;
    }
    // Trên panel kiểu Pterodactyl (Wispbyte), SERVER_PORT là cổng panel TỰ TIÊM và cũng là
    // cổng mà subdomain public map vào. PORT đặt tay sẽ thắng nó ở dòng trên — bind sai cổng
    // thì log vẫn báo "chạy ở cổng N" bình thường, chỉ có domain ngoài trả 502/504. Lỗi này
    // im lặng hoàn toàn nếu không đối chiếu hai biến, nên phải nói to ra đây.
    const panelPort = Number(process.env.SERVER_PORT || 0);
    if (panelPort && Number(process.env.PORT || 0) && panelPort !== port) {
        console.warn(`[VOTE] ⚠ PORT=${port} ĐANG ĐÈ SERVER_PORT=${panelPort} do panel cấp.`);
        console.warn('[VOTE]   Subdomain public thường map vào SERVER_PORT -> ngoài Internet sẽ 502/504.');
        console.warn('[VOTE]   Cách sửa: XOÁ biến PORT trên panel để dùng SERVER_PORT, hoặc đặt PORT = ' + panelPort);
    }
    // /stats + health chỉ cần PORT là chạy. Webhook chỉ kích hoạt khi có TOPGG_WEBHOOK_AUTH
    // (lấy sau khi bot được duyệt). Chưa có secret -> webhook trả 503, các route khác vẫn ổn.
    if (!auth) console.log('[VOTE] Chưa có TOPGG_WEBHOOK_AUTH -> webhook tạm tắt (/stats + health vẫn chạy).');
    if (!dblAuth) console.log('[VOTE] Chưa có DBL_WEBHOOK_AUTH -> webhook discordbotlist tạm tắt.');
    else console.log('[VOTE] Webhook discordbotlist sẵn sàng ở /dbl/vote.');
    if (!cassoToken) console.log('[CASSO] Chưa có CASSO_WEBHOOK_TOKEN -> webhook thanh toán tạm tắt.');
    else console.log('[CASSO] Webhook thanh toán Premium sẵn sàng ở /casso/webhook.');
    if (!notifySecret) console.log('[PREMIUM] Chưa có BOT_NOTIFY_SECRET -> web không báo được đơn mới (owner phải tự gõ /premium-admin cho).');
    else console.log('[PREMIUM] Sẵn sàng nhận báo đơn ở /premium/notify -> DM owner kèm nút duyệt.');
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
                if (req.url.startsWith('/api/bakery/')) {
                    const id = decodeURIComponent(req.url.slice('/api/bakery/'.length).split(/[?#]/)[0]).trim();
                    if (!/^\d{5,25}$/.test(id)) { res.writeHead(400, JSONH); res.end('{"error":"bad_id"}'); return; }
                    let data = cacheGet('b:' + id);
                    if (!data) { data = await buildBakeryPayload(client, id); if (data) cacheSet('b:' + id, data); }
                    if (!data) { res.writeHead(404, JSONH); res.end('{"error":"not_found"}'); return; }
                    res.writeHead(200, JSONH); res.end(JSON.stringify(data));
                    return;
                }
                if (req.url.startsWith('/api/leaderboard')) {
                    const q = new URL(req.url, 'http://local');
                    const typeRaw = q.searchParams.get('type');
                    const type = typeRaw === 'level' ? 'level' : (typeRaw === 'bakery' ? 'bakery' : 'wealth');
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
                if (req.url.startsWith('/api/event')) {
                    // Sự kiện toàn cục đang chạy (để web hiện banner "x2 thu nhập"...).
                    const { getEventInfo } = require('./event');
                    const e = getEventInfo();
                    res.writeHead(200, JSONH);
                    res.end(JSON.stringify({ active: e.active, mult: e.mult, name: e.name, until: e.until }));
                    return;
                }
                res.writeHead(404, JSONH); res.end('{"error":"not_found"}');
                return;
            }

            // Số liệu công khai cho widget trên web (CORS mở vì chỉ đọc, không nhạy cảm)
            if (req.url.startsWith('/stats')) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                try {
                    // Hai lời gọi độc lập -> song song. `layThongKeNguoiChoi` đọc cache 5
                    // phút nên hầu hết lượt gọi không chạm DB.
                    const [{ servers, users }, nguoiChoi] = await Promise.all([
                        getPublicStats(client),
                        layThongKeNguoiChoi(),
                    ]);
                    const gatewayPing = client.ws ? (client.ws.ping !== -1 ? client.ws.ping : null) : null;
                    const bn = process.memoryUsage();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    // `servers` + `users` GIỮ NGUYÊN TÊN: web đang đọc chúng
                    // (`web/src/components/LiveStats.tsx`, `web/src/app/status/page.tsx`).
                    // Chỉ THÊM trường, không đổi tên — đổi là phá trang đang chạy.
                    //
                    // Phân biệt hai con số dễ lẫn:
                    //   `users`   = tổng thành viên của 23 server (một người ở nhiều server
                    //               bị đếm nhiều lần, và có cả bot) — đây là TẦM VỚI.
                    //   `players` = người THẬT đã dùng bot, đếm trong DB.
                    //
                    // `heapUsedMb`/`heapLimitMb` để truy vụ bot chết: bot chạy với
                    // `--max-old-space-size=384`, mà discord.js mặc định KHÔNG quét cache
                    // user/member. Có số này thì lần sau nhìn được nó bò lên hay không, thay
                    // vì đoán như hôm nay.
                    res.end(JSON.stringify({
                        servers,
                        users,
                        ...(nguoiChoi || {}),
                        gatewayPing,
                        ...banBuild(),
                        heapUsedMb: Math.round(bn.heapUsed / 1048576),
                        rssMb: Math.round(bn.rss / 1048576),
                        heapLimitMb: Math.round(require('node:v8').getHeapStatistics().heap_size_limit / 1048576),
                    }));
                } catch {
                    res.writeHead(500); res.end();
                }
                return;
            }
            // Health check (uptime ping)
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Waguri OK 🌸');
            return;
        }
        const isVote = req.url.startsWith('/topgg/vote');
        const isDblVote = req.url.startsWith('/dbl/vote');
        const isCasso = req.url.startsWith('/casso/webhook');
        // Web (Vercel) báo sang: có người vừa bấm "Tôi đã chuyển khoản".
        // Phải đi qua BOT chứ không phải webhook Discord thuần, vì webhook thuần KHÔNG gắn
        // được nút bấm — chỉ ứng dụng mới gắn được. Mà nút chính là điểm mấu chốt: nó là
        // khác biệt giữa "owner duyệt được từ điện thoại trong 2 chạm" và "phải mở máy gõ lệnh".
        const isClaim = req.url.startsWith('/premium/notify');
        if (req.method !== 'POST' || (!isVote && !isDblVote && !isCasso && !isClaim)) {
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

            // --- Web báo có người đã chuyển khoản -> DM owner kèm nút duyệt ---
            if (isClaim) {
                if (!notifySecret) { res.writeHead(503); res.end(); return; }
                if (!safeEqual(req.headers['x-waguri-secret'], notifySecret)) { res.writeHead(401); res.end(); return; }
                let payload;
                try { payload = JSON.parse(body || '{}'); } catch { res.writeHead(400); res.end(); return; }
                // Chỉ nhận MÃ ĐƠN. Số tiền/tháng luôn đọc lại từ DB — không tin dữ liệu gửi tới.
                const code = extractPremiumCode(payload?.code || '');
                if (!code) { res.writeHead(400, JSONH); res.end('{"error":"bad_code"}'); return; }
                res.writeHead(200, JSONH); res.end('{"ok":true}');
                notifyOwnersOfClaim(client, code).catch(e => logError('premium claim notify', e));
                return;
            }

            // --- discordbotlist.com vote webhook ---
            // Họ gửi secret THÔ ở header Authorization (không HMAC, không có kiểu "test").
            if (isDblVote) {
                if (!dblAuth) { res.writeHead(503); res.end(); return; }
                if (!safeEqual(req.headers.authorization, dblAuth)) { res.writeHead(401); res.end(); return; }
                res.writeHead(200); res.end(); // docs yêu cầu 200, body rỗng
                try {
                    const data = JSON.parse(body || '{}');
                    const uid = data?.id;
                    // Chặn ID rác trước khi đụng DB — payload này không có chữ ký nên chỉ
                    // secret ở header là lớp bảo vệ; đừng để chuỗi tuỳ ý đi thẳng vào RPC.
                    if (!/^\d{5,25}$/.test(String(uid || ''))) {
                        console.log('[VOTE] Webhook discordbotlist không có user id hợp lệ (có thể là cú test) ✅');
                        return;
                    }
                    grantDblVoteReward(client, String(uid)).catch(e => logError('vote reward dbl', e));
                } catch (e) { logError('dbl vote webhook parse', e); }
                return;
            }

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
