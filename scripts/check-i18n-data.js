#!/usr/bin/env node
// ============================================================
// scripts/check-i18n-data.js — Gác i18n cho DỮ LIỆU (tầng DB), thứ hai gate cũ không thấy.
//
// Ba lỗi đợt 6 phát hiện, cả ba đều lọt qua mọi gate hiện có:
//
//  1. `vi.json` chứa namespace `items.*` với GIÁ TRỊ TIẾNG ANH -> người Việt đọc
//     "Iron Fishing Rod" thay vì "Cần Câu Cá". 29 lời gọi / 10 file dính, gồm gần trọn
//     vòng lặp chơi chính (/craft /eat /fish /work /market /pet /repair /tangdo).
//     Gốc: hàm `t()` chỉ rơi về `undefined` khi khoá KHÔNG TỒN TẠI; khoá tồn tại với giá
//     trị tiếng Anh thì nó trả nguyên văn.
//
//  2. 32/90 vật phẩm trong DB không có tên tiếng Anh -> người dùng EN đọc tiếng Việt.
//
//  3. 7 khoá mồ côi: vật phẩm đã xoá khỏi DB nhưng khoá dịch còn lại, che mất độ phủ thật.
//
// `check-i18n-coverage` chỉ soi locale WEB; `check-i18n-bot` chỉ dò chuỗi tiếng Việt viết
// cứng trong CODE. Không cái nào đối chiếu locale với DỮ LIỆU trong DB.
//
// Chạy OFFLINE: đối chiếu với `supabase/schema-snapshot.json`? KHÔNG — ảnh chụp chỉ có cấu
// trúc, không có dữ liệu. Danh sách id lấy từ `scripts/db-catalog-ids.json`, sinh lại bằng
// `npm run db:catalog` khi thêm/xoá vật phẩm.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CATALOG = path.join(__dirname, 'db-catalog-ids.json');
const LOC = path.join(ROOT, 'src', 'locales');

const loi = [];
const doc = f => JSON.parse(fs.readFileSync(path.join(LOC, f), 'utf8'));
const vi = doc('vi.json');
const en = doc('en.json');

// ---------- 1) vi.json KHÔNG được chứa namespace tên vật phẩm ----------
// Tên tiếng Việt là DỮ LIỆU trong DB (`items.name`), không phải bản dịch. Đặt khoá vi cho
// chúng chỉ tạo ra một nguồn sự thật thứ hai — và lần trước nguồn đó chứa tiếng Anh.
for (const ns of ['items', 'data.items', 'data.jobs']) {
    const o = ns.split('.').reduce((x, k) => x?.[k], vi);
    if (o && Object.keys(o).length) {
        loi.push(`vi.json KHÔNG được chứa \`${ns}.*\` (đang có ${Object.keys(o).length} khoá).\n` +
                 `        Tên tiếng Việt lấy từ DB; đặt khoá vi ở đây tạo nguồn sự thật thứ hai.`);
    }
}

// ---------- 1b) `items.*` đã bị GỘP vào `data.items.*` — không được hồi sinh ----------
// Hai namespace song song chính là thứ đẻ ra lỗi "người Việt đọc tiếng Anh" ở đợt 6:
// 29 lời gọi dùng cái này, 22 dùng cái kia, và chỉ MỘT trong hai bị nhiễm tiếng Anh.
if (en.items && Object.keys(en.items).length) {
    loi.push(`en.json chứa \`items.*\` (${Object.keys(en.items).length} khoá) — namespace này ĐÃ GỘP vào \`data.items.*\`.\n` +
             `        Hai namespace song song là gốc của lỗi tên vật phẩm ở đợt 6. Dùng \`data.items.*\`.`);
}

// ---------- 2 & 3) en.json phải phủ ĐÚNG tập id trong DB ----------
if (!fs.existsSync(CATALOG)) {
    console.error(`❌ Thiếu ${path.relative(ROOT, CATALOG)}. Chạy: npm run db:catalog`);
    process.exit(1);
}
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));

for (const [nhom, ns] of [['items', 'data.items'], ['jobs', 'data.jobs']]) {
    const ids = catalog[nhom] || [];
    const kho = ns.split('.').reduce((x, k) => x?.[k], en) || {};
    const thieu = ids.filter(id => !kho[id]?.name);
    const moCoi = Object.keys(kho).filter(id => !ids.includes(id));

    if (thieu.length) {
        loi.push(`en.json thiếu tên tiếng Anh cho ${thieu.length} ${nhom} ở \`${ns}.*\`:\n` +
                 `        ${thieu.slice(0, 10).join(', ')}${thieu.length > 10 ? `, … +${thieu.length - 10}` : ''}\n` +
                 `        -> người dùng tiếng Anh sẽ đọc phải tên tiếng Việt.`);
    }
    if (moCoi.length) {
        loi.push(`en.json có ${moCoi.length} khoá MỒ CÔI ở \`${ns}.*\` (không còn trong DB):\n` +
                 `        ${moCoi.slice(0, 10).join(', ')}${moCoi.length > 10 ? `, … +${moCoi.length - 10}` : ''}`);
    }
}

const tong = (catalog.items || []).length + (catalog.jobs || []).length;
console.log(`Đối chiếu ${tong} bản ghi DB (${(catalog.items || []).length} vật phẩm · ${(catalog.jobs || []).length} nghề) với locale bot`);

if (loi.length) {
    console.error(`\n❌ ${loi.length} vấn đề i18n ở tầng DỮ LIỆU:\n`);
    loi.forEach(l => console.error('  • ' + l));
    console.error('\nThêm vật phẩm mới vào DB thì phải thêm tên tiếng Anh vào `data.items.*`');
    console.error('trong src/locales/en.json (KHÔNG thêm vào vi.json — tên Việt lấy từ DB).');
    console.error('Sau khi đổi danh mục DB, chạy lại: npm run db:catalog');
    process.exit(1);
}
console.log('✅ Mọi vật phẩm/nghề trong DB đều có tên tiếng Anh, và vi.json không lấn sân dữ liệu.');
