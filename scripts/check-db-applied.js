#!/usr/bin/env node
// ============================================================
// scripts/check-db-applied.js — "File migration có, DB có không?"
//
// LỚP LỖI NÀY ĐÃ XẢY RA BA LẦN, mỗi lần một kiểu:
//   · `0096_fix_market_item_ids` trùng số hiệu -> không bao giờ được áp -> chợ bán mọi
//     thứ 500 xu (sự cố 2026-08)
//   · `0092_function_search_path_hardening` trùng số -> không bao giờ được áp -> 4 hàm
//     SECURITY DEFINER hở search_path
//   · `0080_user_locale` -> cột `users.locale` không tồn tại -> ghi nhớ ngôn ngữ chết âm
//     thầm, mọi lệnh prefix ra tiếng Việt kể cả người dùng tiếng Anh
//
// Một câu: **"viết migration" KHÁC "DB đã có"**, và trước gate này không gì phát hiện được.
//
// CHẠY HOÀN TOÀN OFFLINE: đối chiếu file .sql với `supabase/schema-snapshot.json`.
// CI không cần bất kỳ khoá DB nào. Xem scripts/db-snapshot.js để hiểu vì sao dùng ảnh chụp.
// ============================================================

const fs = require('fs');
const path = require('path');
const { bocObject, khoa } = require('./lib/sqlObjects');

const ROOT = path.join(__dirname, '..');
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const ANH_CHUP = path.join(ROOT, 'supabase', 'schema-snapshot.json');

if (!fs.existsSync(ANH_CHUP)) {
    console.error('❌ Chưa có supabase/schema-snapshot.json. Chạy: npm run db:snapshot');
    process.exit(1);
}
const chup = JSON.parse(fs.readFileSync(ANH_CHUP, 'utf8'));

// --- Chỉ mục tra cứu nhanh từ ảnh chụp ---
const bangCo = new Set(Object.keys(chup.tables || {}));
const cotCo = new Map(); // bảng -> Set(tên cột)
for (const [b, cols] of Object.entries(chup.tables || {})) {
    cotCo.set(b.toLowerCase(), new Set(cols.map(c => String(c).split(':')[0].toLowerCase())));
}
const hamCo = new Set((chup.functions || []).map(f => String(f).split('(')[0].toLowerCase()));
const indexCo = new Set((chup.indexes || []).map(s => String(s).toLowerCase()));
const etCo = new Set((chup.event_triggers || []).map(s => String(s).toLowerCase()));

const coTrongDb = o => {
    switch (o.loai) {
        case 'table':         return bangCo.has(o.ten);
        case 'column':        return cotCo.get(o.bang)?.has(o.ten) ?? false;
        case 'function':      return hamCo.has(o.ten);
        case 'index':         return indexCo.has(o.ten);
        case 'event_trigger': return etCo.has(o.ten);
        default:              return true;
    }
};

// --- Gom object theo LẦN NHẮC CUỐI CÙNG ---
// Migration sau có thể XOÁ thứ migration trước tạo: `0095` tạo `market_prices`, `0111` xoá.
// Không xử lý điều này thì gate báo `0095` "chưa áp" — sai.
const files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
const cuoiCung = new Map(); // khoá -> { ...object, file }
for (const f of files) {
    for (const o of bocObject(fs.readFileSync(path.join(MIG_DIR, f), 'utf8'))) {
        cuoiCung.set(khoa(o), { ...o, file: f });
    }
}

// Bảng bị xoá thì INDEX của nó cũng biến mất theo (Postgres tự xoá). Không tính đến điều
// này thì `0111` xoá `market_history` sẽ khiến `idx_market_history_item` bị báo "thiếu".
const bangDaXoa = new Set(
    [...cuoiCung.values()].filter(o => o.loai === 'table' && o.xoa).map(o => o.ten)
);

// --- Đối chiếu ---
const thieu = [], du = [];
for (const o of cuoiCung.values()) {
    if (o.loai === 'index' && o.bangCha && bangDaXoa.has(o.bangCha)) continue;
    const co = coTrongDb(o);
    if (!o.xoa && !co) thieu.push(o);
    if (o.xoa && co) du.push(o);
}

const nhan = o => (o.loai === 'column' ? `cột ${o.bang}.${o.ten}` : `${o.loai} ${o.ten}`);

console.log(`Quét ${files.length} migration · ${cuoiCung.size} object khai báo · đối chiếu ảnh chụp prod`);

if (thieu.length || du.length) {
    console.error(`\n❌ ${thieu.length + du.length} object LỆCH giữa file migration và DB:\n`);
    for (const o of thieu) {
        console.error(`  • THIẾU TRONG DB: ${nhan(o)}`);
        console.error(`      khai báo ở ${o.file} — file có trong repo nhưng DB KHÔNG có object này.`);
    }
    for (const o of du) {
        console.error(`  • ĐÁNG LẼ ĐÃ XOÁ: ${nhan(o)}`);
        console.error(`      ${o.file} có lệnh DROP nhưng object vẫn còn trong DB.`);
    }
    console.error('\nNguyên nhân thường gặp: số hiệu migration TRÙNG nhau nên file không bao giờ được');
    console.error('áp (đúng gốc rễ sự cố chợ 2026-08). Kiểm tra rồi áp bù, sau đó `npm run db:snapshot`.');
    console.error('Nếu ảnh chụp cũ hơn prod thì sinh lại ảnh chụp trước khi kết luận.');
    process.exit(1);
}
console.log('✅ Mọi object mà migration khai báo đều tồn tại đúng trạng thái trong DB.');
