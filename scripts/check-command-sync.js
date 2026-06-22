// ============================================================
// scripts/check-command-sync.js — Cảnh báo lệch giữa lệnh BOT thật và danh sách trên WEB.
// Nguồn sự thật = các file trong src/commands/. Web = web/src/components/CommandsExplorer.tsx.
// Dùng: node scripts/check-command-sync.js   (exit 1 nếu có lệnh bot chưa lên web)
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const cmdRoot = path.join(ROOT, 'src', 'commands');
const webFile = path.join(ROOT, 'web', 'src', 'components', 'CommandsExplorer.tsx');

// --- Lệnh BOT: lấy `setName('...')` đầu tiên trong mỗi file lệnh ---
const botCmds = new Set();
for (const cat of fs.readdirSync(cmdRoot)) {
    const dir = path.join(cmdRoot, cat);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js'))) {
        const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/setName\(['"]([^'"]+)['"]\)/);
        if (m) botCmds.add(m[1]);
    }
}
// Lệnh slash = tên không có khoảng trắng (loại context-menu như "Xem hồ sơ Waguri").
const slashBot = [...botCmds].filter(n => !/\s/.test(n));

// --- Lệnh WEB: trích phần tử đầu mỗi cặp ["name", "desc"] ---
const tsx = fs.readFileSync(webFile, 'utf8');
const webCmds = new Set([...tsx.matchAll(/\[\s*"([^"]+)"\s*,/g)].map(m => m[1]));

const missingInWeb = slashBot.filter(n => !webCmds.has(n)).sort();
const extraInWeb = [...webCmds].filter(n => !botCmds.has(n)).sort();

console.log(`Bot: ${slashBot.length} lệnh slash · Web: ${webCmds.size} lệnh liệt kê`);
if (extraInWeb.length) console.warn(`⚠️  Web có lệnh KHÔNG còn trong bot: ${extraInWeb.join(', ')}`);
if (missingInWeb.length) {
    console.error(`❌ Lệnh bot CHƯA lên web: ${missingInWeb.join(', ')}`);
    process.exit(1);
}
console.log('✅ Đồng bộ: mọi lệnh slash của bot đều có trên web.');
