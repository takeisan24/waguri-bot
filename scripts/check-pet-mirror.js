#!/usr/bin/env node
// ============================================================
// scripts/check-pet-mirror.js — bảng thú cưng của WEB phải khớp bảng của BOT.
//
// VÌ SAO CÓ: `src/data/pets.js` (bot) và `web/src/lib/game.ts` (web) là HAI bản chép tay của
// cùng một bảng dữ liệu. Không cổng nào canh, nên web trôi khỏi bot lúc nào không ai biết —
// và nó đã trôi thật: web từng tự bịa 18 mô tả kỹ năng, cộng 2 chỗ số sai gấp 3–4 lần.
// Cùng đúng lớp lỗi với vụ giá chợ (bảng hiện một giá, ví trả giá khác).
//
// Script gốc do phiên `pet-update-4o8` viết và đã cho 60/60 khớp. Bản này giữ nguyên phần
// quý nhất của họ — ĐỐI CHIẾU TỪNG TỔ HỢP loài × bậc, không chỉ đếm số lượng — và bổ sung
// một thứ họ tự cảnh báo là còn thiếu.
//
// BA KẾT CỤC, không phải hai. Đây là điểm khác so với bản gốc:
//
//   · KHỚP          -> thoát 0
//   · DỮ LIỆU LỆCH  -> thoát 1, chặn push. Đây mới là thứ cổng sinh ra để bắt.
//   · ĐỌC HỎNG      -> thoát 0 kèm cảnh báo TO. KHÔNG chặn push.
//
// Vì sao kết cục thứ ba tồn tại: script đọc TypeScript bằng regex. Chỉ cần ai chạy Prettier
// lên `game.ts` hoặc xuống dòng một trường là regex hụt. Nếu để nó chặn push thì cổng sẽ
// kêu oan — mà cổng kêu oan vài lần là người ta bắt đầu bỏ qua nó, lúc đó TỆ HƠN không có
// cổng. Nên đọc-hỏng chỉ cảnh báo và nói rõ phải làm gì.
//
// Đọc-hỏng nhận ra bằng cách nào: trích ra ĐÚNG 0 mục trong khi bot có >0. Trích ra được
// nhưng THIẾU/THỪA vài mục thì đó là dữ liệu lệch thật, vẫn chặn.
//
// HƯỚNG CHẮC HƠN, chưa làm vì đụng cấu trúc web: tách khối dữ liệu của `game.ts` sang một
// tệp `.js` thuần để cả hai bên `require` thẳng — hết cần parse, và lệch thành bất khả thi
// thay vì bị-phát-hiện-muộn. Đó là việc riêng, cần chủ repo quyết.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const bot = require(path.join(ROOT, 'src', 'data', 'pets.js'));
const TS_PATH = path.join(ROOT, 'web', 'src', 'lib', 'game.ts');

if (!fs.existsSync(TS_PATH)) {
    console.log('⏭️  Không có web/src/lib/game.ts — bỏ qua (mặc định an toàn).');
    process.exit(0);
}
const ts = fs.readFileSync(TS_PATH, 'utf8');

// ---------- trích dữ liệu từ web ----------
const webSpecies = {};
for (const m of ts.matchAll(
    /\{\s*id:\s*"(\w+)",\s*emoji:\s*"([^"]+)",\s*rarity:\s*"(\w+)",\s*buff:\s*"(\w+)",\s*adoptable:\s*(true|false)\s*\}/g)) {
    webSpecies[m[1]] = { emoji: m[2], rarity: m[3], buff: m[4], adoptable: m[5] === 'true' };
}
const webRarity = {};
for (const m of ts.matchAll(
    /(\w+):\s*\{\s*emoji:\s*"([^"]+)",\s*color:\s*"(#[0-9A-Fa-f]{6})",\s*mult:\s*([\d.]+),\s*minLevel:\s*(\d+)\s*\}/g)) {
    webRarity[m[1]] = { emoji: m[2], color: m[3], mult: parseFloat(m[4]), minLevel: parseInt(m[5], 10) };
}
const webBuffs = {};
for (const m of ts.matchAll(/(\w+):\s*\{\s*emoji:\s*"([^"]+)",\s*base:\s*([\d.]+)\s*\}/g)) {
    webBuffs[m[1]] = parseFloat(m[3]);
}

// ---------- kết cục 3: đọc hỏng ----------
const trong = [];
if (bot.SPECIES.length > 0 && Object.keys(webSpecies).length === 0) trong.push('PET_SPECIES');
if (bot.RARITY_ORDER.length > 0 && Object.keys(webRarity).length === 0) trong.push('PET_RARITY');
if (Object.keys(bot.BUFFS).length > 0 && Object.keys(webBuffs).length === 0) trong.push('PET_BUFFS');
if (trong.length) {
    console.warn('\n⚠️  KHÔNG ĐỌC ĐƯỢC bảng ' + trong.join(', ') + ' trong web/src/lib/game.ts.');
    console.warn('   Đây là giới hạn của bộ đọc (regex trên TypeScript), KHÔNG phải dữ liệu lệch.');
    console.warn('   Thường xảy ra khi ai đó đổi ĐỊNH DẠNG file — chạy Prettier, xuống dòng một trường…');
    console.warn('   Cổng KHÔNG chặn push vì lý do này. Cách xử:');
    console.warn('     · sửa regex trong scripts/check-pet-mirror.js cho khớp định dạng mới, HOẶC');
    console.warn('     · tách khối dữ liệu sang tệp .js thuần để hai bên require thẳng (hết cần parse).');
    process.exit(0);
}

// ---------- kết cục 2: dữ liệu lệch ----------
const lech = [];
const bao = (...a) => lech.push(a.join(' '));

if (Object.keys(webSpecies).length !== bot.SPECIES.length) {
    bao(`số loài lệch: bot ${bot.SPECIES.length}, web ${Object.keys(webSpecies).length}`);
}
for (const s of bot.SPECIES) {
    const w = webSpecies[s.id];
    if (!w) { bao(`web thiếu loài \`${s.id}\``); continue; }
    if (w.rarity !== s.rarity) bao(`${s.id}: bậc gốc — bot ${s.rarity}, web ${w.rarity}`);
    if (w.buff !== s.buff) bao(`${s.id}: buff — bot ${s.buff}, web ${w.buff}`);
    if (w.emoji !== s.emoji) bao(`${s.id}: emoji khác nhau`);
    if (w.adoptable !== s.adoptable) bao(`${s.id}: adoptable — bot ${s.adoptable}, web ${w.adoptable}`);
}
for (const k of bot.RARITY_ORDER) {
    const w = webRarity[k], b = bot.RARITY[k];
    if (!w) { bao(`web thiếu bậc \`${k}\``); continue; }
    if (w.mult !== b.mult) bao(`bậc ${k}: hệ số — bot ${b.mult}, web ${w.mult}`);
    if (w.minLevel !== b.minLevel) bao(`bậc ${k}: minLevel — bot ${b.minLevel}, web ${w.minLevel}`);
    if (w.color !== b.color) bao(`bậc ${k}: màu — bot ${b.color}, web ${w.color}`);
}
for (const [id, b] of Object.entries(bot.BUFFS)) {
    if (webBuffs[id] !== b.base) bao(`buff ${id}: base — bot ${b.base}, web ${webBuffs[id]}`);
}

// GIÁ TRỊ CUỐI trên toàn ma trận loài × bậc. Phần đáng giữ nhất của script gốc: ba khối trên
// chỉ so từng bảng rời, còn đây mới là con số NGƯỜI CHƠI THẬT SỰ ĐỌC trên web.
let soToHop = 0;
for (const s of bot.SPECIES) {
    for (const r of bot.RARITY_ORDER) {
        const botVal = bot.petBuffValue({ species: s.id, exp: 10830, ascended_to: r }, s.buff);
        const hang = Math.max(bot.rarityRank(r), bot.rarityRank(s.rarity), bot.rarityRank('rare'));
        const webVal = webBuffs[s.buff] * webRarity[bot.RARITY_ORDER[hang]].mult;
        if (Math.abs(botVal - webVal) > 1e-9) {
            bao(`${s.id} @${r}: GIÁ TRỊ CUỐI — bot ${botVal}, web ${webVal}`);
        }
        soToHop++;
    }
}

if (lech.length) {
    console.error(`\n❌ Bảng thú cưng của web LỆCH bot — ${lech.length} chỗ:\n`);
    for (const d of lech) console.error('   · ' + d);
    console.error('\nWeb hứa một đằng, bot trả một nẻo. Sửa web/src/lib/game.ts cho khớp');
    console.error('src/data/pets.js — bot là nguồn sự thật.\n');
    process.exit(1);
}

console.log(`✅ Bảng thú cưng web khớp bot: ${bot.SPECIES.length} loài · ${bot.RARITY_ORDER.length} bậc · `
    + `${Object.keys(bot.BUFFS).length} buff · ${soToHop} tổ hợp loài × bậc.`);
process.exit(0);
