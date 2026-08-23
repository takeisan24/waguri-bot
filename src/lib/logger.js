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

// GỘP TRÙNG — vì sao cần: throttle ở trên chặn theo TỔNG (15 log/phút), nên một lệnh
// hỏng mà 50 người gõ sẽ ngốn sạch hạn mức và che mất mọi lỗi khác. Ở đây gộp theo
// (tiêu đề + dòng đầu của lỗi): lần đầu báo ngay, các lần sau im trong GOP_MS rồi báo
// kèm số lần đã dồn. Kết quả: kênh log cho biết lỗi nào ĐANG lặp, thay vì trôi mất.
const GOP_MS = 10 * 60_000;
// Cửa sổ gộp cho SKIP dài hơn lỗi: một lần bỏ qua thường phản ánh TRẠNG THÁI cấu hình đứng yên
// hàng giờ, không phải sự kiện. Server có người ra/vào liên tục từng đẩy ra hàng trăm dòng y hệt
// nhau trong ít phút, làm trôi mất mọi dòng log khác.
const SKIP_GOP_MS = 30 * 60_000;
const goiTrung = new Map(); // khoá -> { dồn: số lần chưa báo, mocGui: lần gửi gần nhất }

function khoaCua(title, err) {
    const dong1 = String(err?.message || err || '').split('\n')[0].slice(0, 120);
    return `${title}|${dong1}`;
}

/** @returns {number|null} số lần đã dồn nếu ĐƯỢC gửi, hoặc null nếu phải im vì trùng. */
function chotGop(khoa, now = Date.now(), cuaSo = GOP_MS) {
    const cu = goiTrung.get(khoa);
    if (cu && now - cu.mocGui < cuaSo) { cu.don++; return null; }
    const don = cu ? cu.don : 0;
    goiTrung.set(khoa, { don: 0, mocGui: now });
    if (goiTrung.size > 300) {
        // Dọn theo cửa sổ DÀI NHẤT đang dùng — dọn theo GOP_MS sẽ xoá nhầm khoá SKIP còn hạn,
        // làm mất số lần đã dồn và khiến nó báo lại như mới.
        const gia = Math.max(GOP_MS, SKIP_GOP_MS) * 2;
        for (const [k, v] of goiTrung) if (now - v.mocGui > gia) goiTrung.delete(k);
    }
    return don;
}

/** Gửi lỗi về webhook log. title: tiêu đề ngắn; err: Error/chuỗi; meta: {command,user,guild}. */
async function logError(title, err, meta = {}) {
    const url = process.env.LOG_WEBHOOK_URL;
    if (!url) return;
    const don = chotGop(khoaCua(title, err));
    if (don === null) return;          // trùng — đã cộng dồn, báo ở lần sau
    if (throttled()) return;
    try {
        const body = String(err?.stack || err?.message || err || 'unknown').slice(0, 1500);
        const desc = [
            don > 0 ? `⚠️ **Đã lặp thêm ${don} lần** trong ${GOP_MS / 60000} phút qua.` : null,
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
    // Gộp theo (tag + lý do + ngữ cảnh): mỗi guild/kênh vẫn có tiếng nói riêng, nhưng cùng một
    // tình huống lặp lại thì im tới hết cửa sổ rồi báo kèm số lần đã dồn.
    const don = chotGop(`${tag}|${reason}|${extra}`, Date.now(), SKIP_GOP_MS);
    if (don === null) return;
    const lap = don > 0 ? ` (đã lặp thêm ${don} lần trong ${SKIP_GOP_MS / 60000} phút qua)` : '';
    console.warn(`${tag} ${reason}${extra ? ' — ' + extra : ''}${lap}`);
}

module.exports = {
    logError, skipLog,
    // Lộ ra cho test: logic gộp trùng là phần dễ hỏng thầm lặng nhất ở đây
    // (gộp quá tay -> mất lỗi thật; gộp hụt -> kênh log bị nhấn chìm).
    _gop: { khoaCua, chotGop, GOP_MS, SKIP_GOP_MS, xoaHet: () => goiTrung.clear() },
};
