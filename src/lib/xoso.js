const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const config = require('../config');

const VN_OFFSET = 7 * 3600000; // UTC+7
const vnNow = () => new Date(Date.now() + VN_OFFSET);
const vnDateStr = (d = vnNow()) => d.toISOString().slice(0, 10);
function pastDrawTime(d = vnNow()) {
    const h = d.getUTCHours(), m = d.getUTCMinutes();
    return h > config.XOSO.DRAW_HOUR || (h === config.XOSO.DRAW_HOUR && m >= config.XOSO.DRAW_MIN);
}
/** Ngày quay mà cược mới thuộc về (trước 18h30 -> hôm nay; sau -> mai). */
function targetDrawDate() {
    const v = vnNow();
    if (pastDrawTime(v)) v.setUTCDate(v.getUTCDate() + 1);
    return vnDateStr(v);
}

// Nguồn #1 (JSON): repo cộng đồng tự cập nhật KQ XSMB hằng ngày (free, không key).
const DEFAULT_XSMB_URL = 'https://raw.githubusercontent.com/khiemdoan/vietnam-lottery-xsmb-analysis/main/data/xsmb.json';
// Nguồn #2 (crawl trang gốc): bản nhúng KQ của Minh Ngọc — số 5 chữ số đầu = giải ĐB, ngày đầu = mới nhất.
const MINHNGOC_URL = 'https://www.minhngoc.com.vn/getkqxs/mien-bac.js';

const last2 = special => {
    const s = String(special).replace(/\D/g, '');
    return s.length >= 2 ? Number(s.slice(-2)) : null;
};

/** Nguồn JSON (repo hoặc env XOSO_API_URL). Trả 0-99 hoặc null. */
async function fetchJsonSource(targetDate) {
    try {
        const url = process.env.XOSO_API_URL || DEFAULT_XSMB_URL;
        const headers = {};
        if (process.env.XOSO_API_KEY) headers.Authorization = `Bearer ${process.env.XOSO_API_KEY}`;
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        if (Array.isArray(data)) {
            const row = data.find(r => String(r.date).slice(0, 10) === targetDate);
            return row ? last2(row.special) : null;
        }
        const sp = data?.special ?? data?.dac_biet ?? data?.giaiDB;
        return sp != null ? last2(sp) : null;
    } catch (e) { console.error('[XOSO json]', e.message); return null; }
}

/** Crawl thẳng trang KQ gốc (Minh Ngọc). Chỉ nhận khi ngày mới nhất == ngày cần. */
async function crawlXSMB(targetDate) {
    try {
        const res = await fetch(MINHNGOC_URL, { signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'Mozilla/5.0' } });
        const t = await res.text();
        const dm = t.match(/(\d{2})\/(\d{2})\/(\d{4})/);   // ngày mới nhất (xuất hiện đầu)
        if (!dm || `${dm[3]}-${dm[2]}-${dm[1]}` !== targetDate) return null;
        const num = t.match(/\d{5}/);                       // số 5 chữ số đầu = giải đặc biệt
        return num ? last2(num[0]) : null;
    } catch (e) { console.error('[XOSO crawl]', e.message); return null; }
}

/** Lấy 2 số cuối giải ĐB cho ngày: thử JSON repo -> crawl trang gốc -> null (chờ owner). */
async function fetchXSMB(targetDate = vnDateStr()) {
    const a = await fetchJsonSource(targetDate);
    if (a != null) return a;
    return crawlXSMB(targetDate);
}

async function announce(client, r, date) {
    const embed = new EmbedBuilder().setColor(config.COLORS.JACKPOT)
        .setTitle('🎰 Kết quả Xổ Số (đề) — XSMB')
        .setDescription(
            `Ngày **${date}** · 2 số cuối giải đặc biệt: **${String(r.number).padStart(2, '0')}**\n\n` +
            `🎫 Tổng vé: ${r.total} · 🏆 Trúng: ${r.winners} · 💰 Trả thưởng: ${Number(r.paid).toLocaleString('vi-VN')} ${config.CURRENCY}`)
        .setFooter({ text: 'Đặt đề: /xoso bet <số> <tiền> · trúng x' + config.XOSO.PAYOUT });
    for (const guild of client.guilds.cache.values()) {
        try {
            const s = await db.getGuildSettings(guild.id);
            let ch = s.ai_channel ? guild.channels.cache.get(s.ai_channel) : null;
            if (!ch) ch = guild.systemChannel;
            if (!ch) ch = guild.channels.cache.find(c => c.isTextBased?.() && c.permissionsFor(guild.members.me)?.has('SendMessages'));
            if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
        } catch { /* bỏ qua guild lỗi */ }
    }
}

/** Quay cho ngày VN hôm nay. numberOverride: owner nhập tay; null -> tự fetch. */
async function resolveToday(client, numberOverride = null) {
    const date = vnDateStr();
    if (await db.xosoResult(date)) return { status: 'already' };
    let num = numberOverride;
    if (num == null) num = await fetchXSMB(date);
    if (num == null) return { status: 'no_source' };
    const r = await db.xosoResolve(date, num, config.XOSO.PAYOUT);
    if (r?.status === 'ok' && client) await announce(client, r, date);
    return r;
}

let lastAttempt = 0;
/** Tự động dò KQ mỗi phút sau 18h30 (throttle 5 phút), lỗi thì chờ owner. */
function startScheduler(client) {
    setInterval(async () => {
        try {
            if (!pastDrawTime()) return;
            if (await db.xosoResult(vnDateStr())) return;
            if (Date.now() - lastAttempt < 5 * 60000) return;
            lastAttempt = Date.now();
            await resolveToday(client, null);
        } catch (e) { console.error('[XOSO scheduler]', e.message); }
    }, 60000);
    console.log('[SYSTEM] Đã bật scheduler xổ số (quay ~18h30 giờ VN).');
}

module.exports = { targetDrawDate, vnDateStr, resolveToday, startScheduler, fetchXSMB, crawlXSMB };
