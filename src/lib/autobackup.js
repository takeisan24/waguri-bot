// lib/autobackup.js — Tự backup DB định kỳ NGAY TRONG BOT (không cần scheduler trả phí).
// Mỗi 24h dump dữ liệu rồi gửi file JSON vào kênh BACKUP_CHANNEL_ID (đặt là kênh RIÊNG/staff).
// No-op nếu chưa đặt env. Dùng kênh private vì file chứa dữ liệu người chơi.
const { dumpAll } = require('./backup');

const DAY_MS = 24 * 60 * 60 * 1000;

async function runBackup(client) {
    const chId = process.env.BACKUP_CHANNEL_ID;
    if (!chId) return;
    try {
        const dump = await dumpAll();
        const buf = Buffer.from(JSON.stringify(dump));
        const ch = await client.channels.fetch(chId).catch(() => null);
        if (!ch || !ch.isTextBased?.()) { console.warn('[BACKUP] BACKUP_CHANNEL_ID không hợp lệ.'); return; }

        const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const totals = Object.entries(dump)
            .map(([t, v]) => `${t}: ${Array.isArray(v) ? v.length : '⚠️'}`)
            .join(' · ');
        await ch.send({
            content: `💾 **Backup ${ts}**\n${totals}`.slice(0, 1900),
            files: [{ attachment: buf, name: `backup-${ts}.json` }],
        });
        console.log(`[BACKUP] Đã gửi backup (${(buf.length / 1024).toFixed(1)} KB) vào kênh.`);
    } catch (e) {
        console.error('[BACKUP] Lỗi:', e?.message || e);
    }
}

function scheduleAutoBackup(client) {
    if (!process.env.BACKUP_CHANNEL_ID) return;
    setTimeout(() => runBackup(client), 10 * 60 * 1000); // lần đầu sau 10 phút (đỡ spam khi restart liên tục)
    setInterval(() => runBackup(client), DAY_MS);        // sau đó mỗi 24h
    console.log('[BACKUP] Đã bật auto-backup (mỗi 24h).');
}

module.exports = { scheduleAutoBackup, runBackup };
