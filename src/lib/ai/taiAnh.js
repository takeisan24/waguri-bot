// ============================================================
// taiAnh.js — tải một đính kèm ảnh của Discord về dạng model đọc được.
//
// SỐ ĐO (2026-08-23, gemini-3.5-flash-lite):
//   · Giá ảnh gần như PHẲNG ~1095 token bất kể kích thước — ảnh 2×2 và ảnh 1920×1080 tốn
//     như nhau. Nên KHÔNG có tầng thu nhỏ ảnh ở đây: resize không tiết kiệm được token nào,
//     chỉ tốn công và tốn CPU.
//   · Một lượt chat có ảnh = 1,67 lượt chữ. Hạn mức thật của khoá là RPM 15 / TPM 250K, và
//     RPM khoá trước TPM (15 lượt toàn ảnh = 40.680 token/phút = 16% TPM). Nên ảnh KHÔNG
//     cần trần riêng — nó không đẩy được hạn mức nào chạm trần.
//
// Vậy các rào dưới đây bảo vệ MÁY CHỦ và NGƯỜI DÙNG, không phải bảo vệ hạn mức:
//   · host trắng  -> chống SSRF: bot đi lấy URL người lạ gửi là mở cửa vào mạng nội bộ
//   · trần byte   -> chống một tệp khổng lồ ăn hết RAM tiến trình
//   · timeout     -> CDN chậm không được treo lượt chat
// ============================================================

const HOST_CHO_PHEP = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const MIME_CHO_PHEP = new Set(['image/png', 'image/jpeg', 'image/webp']);

const TRAN_BYTE = 5 * 1024 * 1024; // 5 MB
const TIMEOUT_MS = 5000;

/** Suy mimeType từ đuôi file khi Discord không khai (contentType CÓ THỂ null). */
function mimeTuDuoi(ten) {
    const m = String(ten || '').toLowerCase().match(/\.(png|jpe?g|webp)(?:\?|$)/);
    if (!m) return null;
    return m[1] === 'png' ? 'image/png' : m[1] === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * @param {object} attachment đính kèm của discord.js (cần .url, .contentType, .name)
 * @returns {Promise<{mimeType: string, data: string}|null>} null nghĩa là bỏ ảnh — mọi lý do
 *   đều không ném lỗi ra ngoài, vì hỏng ảnh không được phép làm hỏng cả lượt chat.
 */
async function taiAnh(attachment) {
    if (process.env.AI_ANH_BAT === '0') return null; // cờ tắt khẩn

    const url = attachment?.url;
    if (!url) return null;

    let u;
    try { u = new URL(url); } catch { return null; }

    // Chống SSRF. Chỉ nhận CDN của Discord, và chỉ https.
    if (u.protocol !== 'https:' || !HOST_CHO_PHEP.has(u.hostname)) {
        console.warn(`[AI ẢNH] Bỏ ảnh từ host lạ: ${u.hostname}`);
        return null;
    }

    // Discord ĐÃ khai kiểu thì tin nó, kể cả khi khai một kiểu ta không nhận.
    //
    // Bản đầu viết `MIME_CHO_PHEP.has(ct) ? ct : suyTuDuoi(...)` và một ảnh GIF lọt qua:
    // contentType 'image/gif' bị từ chối, mã liền đi ngửi đuôi URL, thấy '.png' rồi gửi lên
    // như PNG. Ngửi URL chỉ được phép làm CỬA LUI khi Discord không khai gì, không phải làm
    // đường vòng để nhận vào thứ vừa bị từ chối.
    const ctKhai = String(attachment.contentType || '').split(';')[0].trim();
    const mime = ctKhai
        ? (MIME_CHO_PHEP.has(ctKhai) ? ctKhai : null)
        : (mimeTuDuoi(attachment.name) || mimeTuDuoi(u.pathname));
    if (!mime) return null;

    // `attachment.size` là số Discord KHAI, không phải số byte thật nhận được — vẫn phải
    // cắt lúc tải. Nhưng nếu nó đã khai vượt trần thì khỏi tốn một lần gọi mạng.
    if (Number(attachment.size) > TRAN_BYTE) return null;

    const bo = new AbortController();
    const hen = setTimeout(() => bo.abort(), TIMEOUT_MS);
    try {
        // URL đính kèm nay kèm chữ ký ?ex=&is=&hm= và sẽ HẾT HẠN. Phải tải ngay trong lượt
        // này, tuyệt đối không lưu URL để dùng sau.
        const res = await fetch(url, { signal: bo.signal, redirect: 'error' });
        if (!res.ok) return null;

        const khai = Number(res.headers.get('content-length'));
        if (Number.isFinite(khai) && khai > TRAN_BYTE) return null;

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > TRAN_BYTE) return null; // chốt chặn cuối, theo byte THẬT
        if (!buf.length) return null;

        return { mimeType: mime, data: buf.toString('base64') };
    } catch (e) {
        // Timeout, CDN lỗi, chữ ký hết hạn... — bỏ ảnh, lượt chat vẫn chạy bằng chữ.
        console.warn('[AI ẢNH] Không tải được:', String(e?.message || e).slice(0, 120));
        return null;
    } finally {
        clearTimeout(hen);
    }
}

module.exports = { taiAnh, HOST_CHO_PHEP, MIME_CHO_PHEP, TRAN_BYTE, TIMEOUT_MS, mimeTuDuoi };
