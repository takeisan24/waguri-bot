#!/usr/bin/env node
// ============================================================
// scripts/check-i18n-bot.js — Chặn lệnh MỚI ship mà không có i18n.
//
// VÌ SAO CÓ: `scripts/check-i18n-coverage.js` chỉ đọc `web/src/locales/*` — **chỉ gác phía
// web**. Phía bot không có gì kiểm. Đó là lý do `/study` ship được với **0 lời gọi i18n**
// (45 chuỗi tiếng Việt viết cứng) mà CI vẫn xanh, rồi Đợt 2 đưa nó vào `/help` cho mọi
// người thấy — người dùng tiếng Anh đọc toàn tiếng Việt.
//
// CƠ CHẾ RATCHET (giống check-sql-policy): chụp hiện trạng làm mốc trong
// `scripts/i18n-bot-allowlist.json`, chỉ chặn vi phạm MỚI. KHÔNG bắt sửa hết file cũ ngay —
// đó sẽ là over-scope. Mỗi lần dọn được một file thì gỡ nó khỏi allowlist, mốc tự siết lại.
//
//   node scripts/check-i18n-bot.js                     -> kiểm
//   node scripts/check-i18n-bot.js --update-allowlist  -> chụp lại mốc (dùng khi CỐ Ý)
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALLOW = path.join(__dirname, 'i18n-bot-allowlist.json');
const capNhat = process.argv.includes('--update-allowlist');

// Chỉ soi nơi sinh ra chữ hiển thị cho người dùng.
const THU_MUC = ['src/commands', 'src/events'];

// Dấu tiếng Việt — dùng dấu phụ nên không bắt nhầm tiếng Anh.
const VI = /[àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i;
const CHUOI = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
// Dấu hiệu file CÓ i18n. `nameEn`/`isEn` tính là hợp lệ: song ngữ nội tuyến vẫn tôn trọng
// ngôn ngữ người dùng, chỉ là không qua file locale.
const CO_I18N = /\bt\s*\(\s*locale|getInteractionLanguage|useLanguage|getLocaleServer|isEn\b|locale\.startsWith|nameEn/;

const boComment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function duyet(dir, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

const viPham = [];
for (const tm of THU_MUC) {
    for (const f of duyet(path.join(ROOT, tm))) {
        const code = boComment(fs.readFileSync(f, 'utf8'));
        if (CO_I18N.test(code)) continue;
        // Ngưỡng 8 ký tự: bỏ qua mảnh vụn như 'ngày', 'giờ' vốn hay là đơn vị ghép chuỗi.
        const so = [...code.matchAll(CHUOI)].filter(m => VI.test(m[2]) && m[2].length >= 8).length;
        if (so > 0) viPham.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), so });
    }
}
viPham.sort((a, b) => a.file.localeCompare(b.file));

if (capNhat) {
    fs.writeFileSync(ALLOW, JSON.stringify({
        _ghi_chu: 'Mốc ratchet: file CHƯA có i18n tại thời điểm chụp. Dọn được file nào thì ' +
                  'gỡ khỏi đây để mốc siết lại. ĐỪNG thêm file mới vào — hãy i18n nó.',
        files: viPham.map(v => v.file),
    }, null, 2) + '\n', 'utf8');
    console.log(`✅ Đã chụp mốc: ${viPham.length} file.`);
    process.exit(0);
}

const daBiet = new Set((fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')).files : []) || []);
const moi = viPham.filter(v => !daBiet.has(v.file));
const daDon = [...daBiet].filter(f => !viPham.some(v => v.file === f));

console.log(`Quét ${THU_MUC.join(', ')} · ${viPham.length} file chưa có i18n (${daBiet.size} đã ghi nhận trong mốc)`);

if (daDon.length) {
    console.log(`\n🎉 ${daDon.length} file đã được dọn — nhớ chạy \`--update-allowlist\` để siết mốc:`);
    daDon.forEach(f => console.log('   · ' + f));
}

if (moi.length) {
    console.error(`\n❌ ${moi.length} file MỚI có chữ tiếng Việt viết cứng mà không dùng i18n:\n`);
    moi.forEach(v => console.error(`  • ${v.file} — ${v.so} chuỗi`));
    console.error('\nNgười dùng tiếng Anh sẽ đọc phải tiếng Việt. Dùng `t(locale, \'commands.<lệnh>.<khoá>\')`');
    console.error('và thêm khoá vào CẢ `src/locales/vi.json` lẫn `en.json`.');
    console.error('Nếu chuỗi là DỮ LIỆU tiếng Việt (tên can-chi, từ điển nối từ...) chứ không phải giao');
    console.error('diện, chạy: node scripts/check-i18n-bot.js --update-allowlist');
    process.exit(1);
}
console.log('✅ Không có file lệnh/sự kiện MỚI nào thiếu i18n.');
