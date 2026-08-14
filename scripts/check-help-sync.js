#!/usr/bin/env node
// ============================================================
// scripts/check-help-sync.js — Chặn DRIFT giữa lệnh thật và `/help`.
//
// VÌ SAO CÓ: AGENTS.md Luật 7 nói thêm lệnh phải cập nhật **cả web lẫn `/help`**, nhưng
// gate `check-command-sync.js` chỉ soi nửa web. Nửa `/help` không ai gác nên trôi dần:
// ngày 2026-08-14 phát hiện **11 lệnh mở cho mọi người** không có trong `/help` —
// gồm `/start` (lệnh onboarding), `/study` (tính năng chủ lực v2.4.0) và `/prestige`
// (vòng lặp cuối game).
//
// Hậu quả đo được, không phải lý thuyết: `/study` và `/ticket` đều có **0 dòng dữ liệu**
// trên prod. Tính năng xây xong nhưng chưa ai dùng một lần nào, vì không có đường khám phá.
//
// BA KIỂM TRA:
//   (A) Mọi lệnh slash phải có trong `/help`, HOẶC nằm trong danh sách ẩn-có-lý-do dưới đây.
//   (B) `/help` không được nêu lệnh KHÔNG tồn tại (người chơi gõ vào sẽ báo lỗi).
//   (C) Mỗi lệnh trong `/help` phải có khoá dịch ở CẢ `vi.json` lẫn `en.json` — chuỗi trong
//       CATEGORIES chỉ là dự phòng, hiển thị thật đi qua `commands.help.commands.<tên>`.
//       Thiếu khoá thì người dùng tiếng Anh đọc mô tả tiếng Việt.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMD_DIR = path.join(ROOT, 'src', 'commands');

// Lệnh CỐ Ý không xuất hiện trong /help. Thêm vào đây phải kèm lý do thật.
const AN_CO_LY_DO = {
    'eco-admin':       'owner-only (có kiểm isOwner) — cấp/trừ tiền, không phải lệnh người chơi',
    'getinvite':       'owner-only (có kiểm isOwner) — công cụ vận hành',
    'premium-admin':   'owner-only (có kiểm isOwner) — duyệt đơn Premium',
    'Xem hồ sơ Waguri': 'context menu (chuột phải), không phải lệnh gạch chéo nên /help không liệt kê',
};

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const loi = [];

// --- Lệnh thật ---
const lenhThat = new Map(); // tên -> đường dẫn
for (const f of duyet(CMD_DIR)) {
    let mod;
    try { mod = require(f); } catch (e) {
        loi.push(`Không nạp được ${path.relative(ROOT, f)}: ${e.message}`);
        continue;
    }
    if (mod?.data?.name) lenhThat.set(mod.data.name, path.relative(ROOT, f));
}

// --- Lệnh mà /help liệt kê ---
const help = require(path.join(CMD_DIR, 'utility', 'help.js'));
const trongHelp = new Set();
for (const nhom of help.CATEGORIES || []) {
    for (const c of nhom.cmds || []) {
        if (Array.isArray(c) && c[0]) trongHelp.add(c[0]);
    }
}

// --- (A) lệnh thật thiếu trong /help ---
for (const [ten, file] of lenhThat) {
    if (trongHelp.has(ten) || AN_CO_LY_DO[ten]) continue;
    loi.push(`Lệnh /${ten} (${file}) KHÔNG có trong /help.\n` +
             `        -> thêm vào CATEGORIES của src/commands/utility/help.js,\n` +
             `           hoặc thêm vào AN_CO_LY_DO trong scripts/check-help-sync.js kèm lý do.`);
}

// --- (B) /help nêu lệnh không tồn tại ---
for (const ten of trongHelp) {
    if (!lenhThat.has(ten)) {
        loi.push(`/help nêu lệnh /${ten} nhưng KHÔNG có file lệnh nào tên đó -> người chơi gõ vào sẽ lỗi.`);
    }
}

// --- (C) khoá dịch phải có ở CẢ hai ngôn ngữ ---
const doc = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'locales', f), 'utf8'));
const kho = { vi: doc('vi.json'), en: doc('en.json') };
for (const ngonNgu of ['vi', 'en']) {
    const mo = kho[ngonNgu]?.commands?.help?.commands || {};
    for (const ten of trongHelp) {
        if (!mo[ten]) {
            loi.push(`Thiếu bản dịch '${ngonNgu}': commands.help.commands.${ten} (lệnh /${ten} có trong /help).`);
        }
    }
}

// --- Kết luận ---
const soAn = [...lenhThat.keys()].filter(t => AN_CO_LY_DO[t]).length;
console.log(`Lệnh thật: ${lenhThat.size} · /help nêu: ${trongHelp.size} · ẩn có lý do: ${soAn}`);

if (loi.length) {
    console.error(`\n❌ ${loi.length} vấn đề đồng bộ /help:\n`);
    loi.forEach(l => console.error('  • ' + l));
    console.error('\nLuật 7 (AGENTS.md): thêm/sửa lệnh -> cập nhật CẢ web CommandsExplorer LẪN /help.');
    process.exit(1);
}
console.log('✅ /help khớp danh sách lệnh thật, và mọi mục đều có bản dịch vi + en.');
