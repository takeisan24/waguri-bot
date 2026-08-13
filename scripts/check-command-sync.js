// ============================================================
// scripts/check-command-sync.js — Chặn DRIFT ở bề mặt lệnh.
//
// HAI KIỂM TRA:
//   (A) Mọi lệnh slash của bot phải có trên trang commands của web.
//   (B) BỀ MẶT LỆNH (lệnh + subcommand) phải khớp ảnh chụp đã commit
//       `scripts/command-surface.json`.
//
// VÌ SAO CÓ (B): commit baf61de ghi đè `src/commands/economy/market.js` và xoá mất
// 9 subcommand — toàn bộ chợ P2P (view/mine/list/buy/cancel) và hệ thống đấu giá
// (auctions/auction/bid/cancel-auction) — trong khi hạ tầng vẫn sống (RPC, bảng,
// 10 helper, 46 khoá i18n) và index.js vẫn chạy runAuctionResolution() mỗi 60 giây.
// `/help` + web vẫn quảng cáo đủ 10 subcommand, nên người chơi làm theo và bot im
// lặng ("The application did not respond"). Kiểm tra (A) cũ chỉ so tên lệnh CẤP 1
// nên `/market` vẫn khớp -> gate xanh trong khi 9 subcommand bốc hơi.
//
// Ảnh chụp KHÔNG phải để cấm thay đổi — nó buộc mọi thay đổi bề mặt lệnh phải
// HIỆN RA trong diff và được xác nhận có chủ đích:
//     node scripts/check-command-sync.js --update
//
// (Đã thử 2 cách khác và loại: bắt web liệt kê đủ subcommand -> 23/28 lệnh đỏ oan;
//  đối chiếu ngoặc đơn trong /help -> 35 dương tính giả vì đó là văn xuôi.)
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const cmdRoot = path.join(ROOT, 'src', 'commands');
const webFile = path.join(ROOT, 'web', 'src', 'components', 'CommandsExplorer.tsx');
const snapFile = path.join(__dirname, 'command-surface.json');

const SUBCOMMAND = 1;
const SUBCOMMAND_GROUP = 2;

// --- Bề mặt lệnh THẬT: require từng file rồi đọc data.toJSON() ---
// Chính xác hơn regex (bắt được cả subcommand lồng trong group), và là đúng thứ
// index.js gửi lên Discord API.
const surface = {};
const loadErrors = [];
for (const cat of fs.readdirSync(cmdRoot)) {
    const dir = path.join(cmdRoot, cat);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
        let cmd;
        try {
            cmd = require(path.join(dir, file));
        } catch (e) {
            loadErrors.push(`${cat}/${file}: ${e.message}`);
            continue;
        }
        if (!cmd?.data?.toJSON) continue;
        const json = cmd.data.toJSON();
        const subs = [];
        for (const opt of json.options || []) {
            if (opt.type === SUBCOMMAND) subs.push(opt.name);
            else if (opt.type === SUBCOMMAND_GROUP) {
                for (const inner of opt.options || []) subs.push(`${opt.name} ${inner.name}`);
            }
        }
        surface[json.name] = subs.sort();
    }
}

if (loadErrors.length) {
    console.error('❌ Không nạp được lệnh (sẽ CHẾT lúc bot khởi động):');
    for (const e of loadErrors) console.error('   · ' + e);
    process.exit(1);
}

// --- Chế độ cập nhật ảnh chụp ---
if (process.argv.includes('--update')) {
    fs.writeFileSync(snapFile, JSON.stringify(surface, null, 2) + '\n');
    const n = Object.values(surface).reduce((s, v) => s + v.length, 0);
    console.log(`✍️  Đã cập nhật ảnh chụp: ${Object.keys(surface).length} lệnh · ${n} subcommand.`);
    process.exit(0);
}

// --- (A) Bot ↔ Web ---
const tsx = fs.readFileSync(webFile, 'utf8');
const webCmds = new Set([...tsx.matchAll(/\[\s*"([^"]+)"\s*,/g)].map(m => m[1]));
const slashBot = Object.keys(surface).filter(n => !/\s/.test(n)); // loại context-menu ("Xem hồ sơ Waguri")

const missingInWeb = slashBot.filter(n => !webCmds.has(n)).sort();
const extraInWeb = [...webCmds].filter(n => !surface[n]).sort();

console.log(`Bot: ${slashBot.length} lệnh slash · Web: ${webCmds.size} lệnh liệt kê`);
if (extraInWeb.length) console.warn(`⚠️  Web có lệnh KHÔNG còn trong bot: ${extraInWeb.join(', ')}`);

let failed = false;
if (missingInWeb.length) {
    console.error(`❌ Lệnh bot CHƯA lên web: ${missingInWeb.join(', ')}`);
    failed = true;
}

// --- (B) Bề mặt lệnh ↔ ảnh chụp ---
if (!fs.existsSync(snapFile)) {
    console.error(`❌ Thiếu ${path.relative(ROOT, snapFile)} — chạy: node scripts/check-command-sync.js --update`);
    process.exit(1);
}
const snap = JSON.parse(fs.readFileSync(snapFile, 'utf8'));

const removedCmds = Object.keys(snap).filter(c => !surface[c]);
const addedCmds = Object.keys(surface).filter(c => !snap[c]);
const changed = [];
for (const cmd of Object.keys(surface)) {
    if (!snap[cmd]) continue;
    const before = new Set(snap[cmd]);
    const after = new Set(surface[cmd]);
    const gone = snap[cmd].filter(s => !after.has(s));
    const added = surface[cmd].filter(s => !before.has(s));
    if (gone.length || added.length) changed.push({ cmd, gone, added });
}

const total = Object.values(surface).reduce((s, v) => s + v.length, 0);
console.log(`Bề mặt: ${Object.keys(surface).length} lệnh · ${total} subcommand`);

if (removedCmds.length || addedCmds.length || changed.length) {
    console.error('\n❌ BỀ MẶT LỆNH ĐỔI so với ảnh chụp đã commit:\n');
    for (const c of removedCmds) console.error(`   🔴 MẤT hẳn lệnh /${c}`);
    for (const c of addedCmds) console.error(`   🟢 THÊM lệnh /${c}`);
    for (const { cmd, gone, added } of changed) {
        if (gone.length) console.error(`   🔴 /${cmd} MẤT subcommand: ${gone.join(', ')}`);
        if (added.length) console.error(`   🟢 /${cmd} THÊM subcommand: ${added.join(', ')}`);
    }
    console.error('\nNếu ĐÚNG chủ đích: node scripts/check-command-sync.js --update  (rồi commit ảnh chụp).');
    console.error('Nếu KHÔNG: có thứ vừa bị xoá nhầm — kiểm tra lại trước khi đi tiếp.');
    console.error('⚠️  Đổi bề mặt lệnh thì PHẢI để bot đăng ký lại lệnh (bỏ SKIP_DEPLOY=1 một lần),');
    console.error('   nếu không Discord vẫn giữ định nghĩa CŨ và người chơi gặp "application did not respond".');
    failed = true;
}

if (failed) process.exit(1);
console.log('✅ Đồng bộ: lệnh bot có đủ trên web, bề mặt lệnh khớp ảnh chụp.');
