// lib/logger.js — Đẩy lỗi runtime về 1 kênh Discord qua webhook (env LOG_WEBHOOK_URL).
// No-op nếu chưa đặt env. Có throttle chống spam khi crash-loop. Dùng global fetch (Node >=18).
let sentTimes = [];

function throttled() {
    const now = Date.now();
    sentTimes = sentTimes.filter(t => now - t < 60_000);
    if (sentTimes.length >= 15) return true; // tối đa 15 log/phút
    sentTimes.push(now);
    return false;
}

/** Gửi lỗi về webhook log. title: tiêu đề ngắn; err: Error/chuỗi; meta: {command,user,guild}. */
async function logError(title, err, meta = {}) {
    const url = process.env.LOG_WEBHOOK_URL;
    if (!url || throttled()) return;
    try {
        const body = String(err?.stack || err?.message || err || 'unknown').slice(0, 1500);
        const desc = [
            meta.command ? `**Lệnh:** \`${meta.command}\`` : null,
            meta.user ? `**User:** ${meta.user}` : null,
            meta.guild ? `**Guild:** \`${meta.guild}\`` : null,
            '```\n' + body + '\n```',
        ].filter(Boolean).join('\n');
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [{ title: `🐛 ${title}`, description: desc, color: 0xFF8E9E }] }),
        });
    } catch { /* nuốt lỗi: log không bao giờ được làm sập bot */ }
}

/** Log chuẩn hoá khi bot bỏ qua/thoát sớm (im lặng). Chỉ console.warn, không gửi webhook. */
function skipLog(reason, ctx = {}) {
    const tag = ctx.source ? `[SKIP:${ctx.source}]` : '[SKIP]';
    const extra = Object.keys(ctx).filter(k => k !== 'source').map(k => `${k}=${ctx[k]}`).join(' ');
    console.warn(`${tag} ${reason}${extra ? ' — ' + extra : ''}`);
}

module.exports = { logError, skipLog };
