// ============================================================
// scripts/backup-db.js — Sao lưu bảng dữ liệu người chơi ra file JSON (chạy tay).
// Dùng: node scripts/backup-db.js  ->  backups/backup-<thời-gian>.json (đã .gitignore).
// (Bot cũng TỰ backup mỗi 24h vào kênh BACKUP_CHANNEL_ID — xem src/lib/autobackup.js.)
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { dumpAll } = require('../src/lib/backup');

(async () => {
    const dump = await dumpAll();
    for (const [t, v] of Object.entries(dump)) {
        console.log(`  ${t}: ${Array.isArray(v) ? v.length + ' dòng' : '⚠️ ' + v.__error}`);
    }
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `backup-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(dump));
    console.log(`\n✅ Đã backup -> ${file}`);
    process.exit(0);
})();
