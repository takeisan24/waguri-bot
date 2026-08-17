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
// MỖI MỤC TRONG MỐC PHẢI CÓ LÝ DO. Bản đầu chỉ là mảng đường dẫn, nên nó đọc như 5 việc
// tồn — trong khi kiểm lại thì CẢ 5 đều là báo nhầm (khoá tra bảng, mô tả slash đã được
// commandLocalizer dịch, console.log). Mốc không lý do vừa giấu nợ thật vừa bịa nợ ảo.
// Lý do mở đầu bằng `NỢ THẬT:` được đếm riêng và in ra mỗi lần chạy.
//
//   node scripts/check-i18n-bot.js                     -> kiểm
//   node scripts/check-i18n-bot.js --update-allowlist  -> chụp lại mốc (dùng khi CỐ Ý)
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALLOW = path.join(__dirname, 'i18n-bot-allowlist.json');
const capNhat = process.argv.includes('--update-allowlist');

// Nơi sinh ra chữ hiển thị cho người dùng. `src/lib` được thêm sau khi phát hiện gate cũ
// mù hẳn với nó: chữ nút bấm, mô tả vai Ma Sói, thông báo lỗi cược đều nằm ở đây.
const THU_MUC = ['src/commands', 'src/events', 'src/lib'];

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

const mocCu = fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')) : {};
// Chấp nhận cả dạng cũ (mảng đường dẫn) lẫn dạng mới (đường dẫn -> lý do).
const lyDoCu = Array.isArray(mocCu.files)
    ? Object.fromEntries(mocCu.files.map(f => [f, '']))
    : (mocCu.files || {});

if (capNhat) {
    // Giữ nguyên lý do đã viết; mục mới bị đánh dấu để không lặng lẽ nuốt thêm nợ.
    const files = {};
    for (const v of viPham) files[v.file] = lyDoCu[v.file] || `CHƯA XÉT: ${v.so} chuỗi — ghi lý do miễn, hoặc i18n rồi xoá khỏi đây.`;
    fs.writeFileSync(ALLOW, JSON.stringify({ ...mocCu, files }, null, 2) + '\n', 'utf8');
    const chuaXet = Object.values(files).filter(l => l.startsWith('CHƯA XÉT')).length;
    console.log(`✅ Đã chụp mốc: ${viPham.length} file${chuaXet ? ` · ${chuaXet} mục CHƯA XÉT cần viết lý do` : ''}.`);
    process.exit(0);
}

const daBiet = new Set(Object.keys(lyDoCu));
const moi = viPham.filter(v => !daBiet.has(v.file));
const daDon = [...daBiet].filter(f => !viPham.some(v => v.file === f));

const noThat = Object.entries(lyDoCu).filter(([, l]) => l.startsWith('NỢ THẬT'));
const chuaXet = Object.entries(lyDoCu).filter(([, l]) => !l || l.startsWith('CHƯA XÉT'));

console.log(`Quét ${THU_MUC.join(', ')} · ${viPham.length} file chưa có i18n (${daBiet.size} đã ghi nhận trong mốc)`);
console.log(`   ${daBiet.size - noThat.length - chuaXet.length} miễn có căn cứ · ${noThat.length} nợ thật · ${chuaXet.length} chưa xét`);

if (noThat.length) {
    console.log('\n📌 Nợ i18n thật còn tồn (không chặn CI, nhưng người dùng EN đọc phải tiếng Việt):');
    noThat.forEach(([f, l]) => console.log(`   · ${f} — ${l.replace(/^NỢ THẬT:\s*/, '')}`));
}

if (chuaXet.length) {
    console.error(`\n❌ ${chuaXet.length} mục trong mốc chưa có lý do:`);
    chuaXet.forEach(([f]) => console.error('   · ' + f));
    console.error('\nViết lý do miễn vào scripts/i18n-bot-allowlist.json, hoặc i18n file rồi xoá mục đó.');
    process.exit(1);
}

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
