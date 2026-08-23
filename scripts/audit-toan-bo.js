#!/usr/bin/env node
// ============================================================
// scripts/audit-toan-bo.js — chạy MỘT lệnh, soi cả ba tầng: lệnh · DB · web.
//
// VÌ SAO CÓ: ngày 2026-08-23 audit tay cả ngày, và bài học lớn nhất KHÔNG phải các lỗi tìm
// được mà là **phép đo nói dối 10 lần**. Vài ví dụ, để ai đọc file này biết mà đề phòng:
//
//   · "40/81 lệnh không ack ở dòng đầu"  -> đọc kỹ ra 1, và cái đó là đọc THAM SỐ chứ không
//     phải gọi DB. Tầng lệnh sạch 81/81.
//   · "10 lệnh không lọc người bấm nút"  -> 7 cái kiểm ngay trong `collect` chứ không qua
//     `filter:`; 2 cái là sảnh chờ nhiều người, KHÔNG lọc mới đúng.
//   · "30 RPC mồ côi"                    -> 9 cái gọi qua hàm bọc truyền tên bằng biến;
//     7 cái còn lại thì prod đã xoá từ lâu.
//   · Phép quét cột-ma đầu tiên đặt trần thân truy vấn 600 ký tự, và ở một file `.from(` kế
//     cách 628 -> nó BỎ QUA cả khối, im lặng. 3/4 truy vấn của file chưa từng được quét.
//
// Nên script này chỉ ĐẾM và CHỈ CHỖ, không tự kết luận "đây là lỗi". Người đọc phải mở file
// ra xem. Mọi ngưỡng đều ghi rõ nguồn gốc.
//
// Chạy: node scripts/audit-toan-bo.js
// ============================================================
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const duyet = (d, o = [], loc = /\.(js|ts|tsx)$/) => {
    if (!fs.existsSync(d)) return o;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) duyet(p, o, loc); else if (loc.test(e.name)) o.push(p);
    }
    return o;
};
const doc = f => fs.readFileSync(f, 'utf8');
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const muc = (t) => console.log('\n════ ' + t + ' ════');
const dong = (nhan, gt, ghi = '') => console.log('  ' + String(nhan).padEnd(38) + String(gt).padStart(6) + (ghi ? '  ' + ghi : ''));

let canXem = 0;
const luuY = (s) => { canXem++; console.log('  ⚠  ' + s); };

// ───────────────────────────── 1. LỆNH
muc('TẦNG LỆNH');
const fileLenh = duyet(path.join(ROOT, 'src', 'commands'));
const lenh = [];
for (const f of fileLenh) {
    let m; try { m = require(f); } catch { continue; }
    if (!m?.data?.toJSON) continue;
    const j = m.data.toJSON();
    if (!j.name) continue;
    const subs = (j.options || []).filter(o => o.type === 1).length
        + (j.options || []).filter(o => o.type === 2)
            .reduce((s, g) => s + (g.options || []).filter(o => o.type === 1).length, 0);
    lenh.push({ ten: j.name, file: rel(f), sub: subs, src: doc(f) });
}
dong('lệnh', lenh.length);
dong('lệnh con', lenh.reduce((s, x) => s + x.sub, 0));

// ack: chỉ đếm I/O THẬT trước ack, không đếm đọc tham số (bài học dương tính giả)
const ACK = /interaction\.(deferReply|reply|showModal|deferUpdate)\s*\(/;
const IO = /await\s+db\.|await\s+supabase|\.rpc\(|await\s+fetch\(/;
let ioTruocAck = 0;
for (const x of lenh) {
    const d = boCmt(x.src).split('\n');
    const iE = d.findIndex(l => /async\s+execute\s*\(/.test(l));
    if (iE === -1) continue;                       // uỷ quyền cho hàm dùng chung -> ack nằm ở đó
    let iA = -1;
    for (let i = iE; i < d.length; i++) if (ACK.test(d[i])) { iA = i; break; }
    if (iA === -1) continue;
    if (d.slice(iE + 1, iA).some(l => IO.test(l))) { ioTruocAck++; luuY(`I/O trước ack: /${x.ten}`); }
}
dong('có I/O trước khi ack', ioTruocAck, ioTruocAck ? '' : '(sạch)');

// ───────────────────────────── 2. DB
muc('TẦNG DB');
const snap = JSON.parse(doc(path.join(ROOT, 'supabase', 'schema-snapshot.json')));
const COT = {};
for (const [b, ds] of Object.entries(snap.tables)) COT[b] = new Set(ds.map(x => String(x).split(':')[0]));
dong('bảng trong ảnh chụp', Object.keys(snap.tables).length);
dong('hàm trong ảnh chụp', Object.keys(snap.functions || {}).length);
dong('migration', duyet(path.join(ROOT, 'supabase', 'migrations'), [], /\.sql$/).length);

for (const [khoa, nhan] of [
    ['bang_chua_bat_rls', 'bảng chưa bật RLS'],
    ['definer_khong_ghim_search_path', 'SECURITY DEFINER chưa ghim search_path'],
    ['ham_goi_bang_khong_ton_tai', 'hàm gọi bảng không tồn tại'],
    ['ham_ghi_cot_khong_ton_tai', 'hàm ghi cột không tồn tại'],
    ['rang_buoc_trung', 'ràng buộc trùng'],
]) {
    const v = snap[khoa];
    const n = Array.isArray(v) ? v.length : (v ? Object.keys(v).length : 0);
    dong(nhan, n);
    if (n) luuY(`${nhan}: ${JSON.stringify(v).slice(0, 150)}`);
}

// ───────────────────────────── 3. MÃ ↔ SCHEMA
muc('MÃ ĐỐI CHIẾU SCHEMA');
const maSrc = duyet(path.join(ROOT, 'src')).concat(duyet(path.join(ROOT, 'web', 'src')));
let soKhoi = 0;
const cotMa = [];
for (const f of maSrc) {
    const s = boCmt(doc(f));
    for (const m of s.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)([\s\S]{0,1500}?)(?=;|\.from\(|$)/g)) {
        const cot = COT[m[1]];
        if (!cot) continue;
        soKhoi++;
        const sel = m[2].match(/\.select\(\s*["'`]([^"'`]*)["'`]/);
        if (sel && sel[1].trim() && sel[1].trim() !== '*') {
            for (const c of sel[1].replace(/\w+\s*\([^)]*\)/g, '').split(',')) {
                const t = c.trim().split(':')[0].trim();
                if (t && t !== '*' && !t.includes('(') && !cot.has(t)) cotMa.push(`${rel(f)} → ${m[1]}.${t}`);
            }
        }
        for (const o of m[2].matchAll(/\.(order|eq|neq|gt|gte|lt|lte|ilike|like)\(\s*["'`](\w+)["'`]/g)) {
            if (!cot.has(o[2])) cotMa.push(`${rel(f)} → ${m[1]}.${o[2]} (.${o[1]})`);
        }
    }
}
dong('khối .from() quét được', soKhoi);
dong('truy vấn cột KHÔNG tồn tại', new Set(cotMa).size);
for (const x of new Set(cotMa)) luuY('cột ma: ' + x);

// ───────────────────────────── 4. WEB
muc('TẦNG WEB');
const web = duyet(path.join(ROOT, 'web', 'src'));
dong('file', web.length);
dong('trang', web.filter(f => /\/page\.tsx$/.test(rel(f))).length);
dong('route API', web.filter(f => /\/route\.ts$/.test(rel(f))).length);

let nuot = 0;
for (const f of web) {
    if (rel(f).endsWith('lib/ghiLoi.ts')) continue;
    const s = boCmt(doc(f));
    for (const m of s.matchAll(/const\s*\{\s*data(\s*:\s*\w+)?\s*\}\s*=\s*await\s+(\w+)/g)) {
        if (!/supabase|admin|client|db/i.test(m[2])) continue;
        nuot++; luuY('nuốt lỗi: ' + rel(f));
    }
}
dong('truy vấn nuốt `error`', nuot, nuot ? '' : '(sạch)');

// service_role mà không kiểm danh tính
const AUTH = [/getSession|getUser\(\)|auth\(\)/, /session\?\.user|session\.user/,
    /requireOwner|isOwner|OWNER_ID/, /unauthorized|401|redirect\(['"`]\/login/, /headers\(\)\.get/];
let khongAuth = 0;
for (const f of web) {
    const s = boCmt(doc(f));
    if (!/createAdminClient|SERVICE_ROLE/.test(s)) continue;
    if (AUTH.some(re => re.test(s))) continue;
    if (!/params|searchParams|request\.(json|nextUrl|url)/.test(s)) continue;
    khongAuth++;
    luuY('service_role + nhận tham số + không kiểm danh tính: ' + rel(f));
}
dong('service_role không kiểm danh tính', khongAuth);

// ───────────────────────────── TỔNG
muc('TỔNG');
if (!canXem) console.log('  ✅ Không có mục nào cần xem lại.');
else console.log('  ' + canXem + ' mục cần MỞ RA ĐỌC. Script này không tự kết luận đúng/sai —');
console.log('     xem chú thích đầu file: phép đo ở đây đã nói dối 10 lần trong một buổi.');
process.exit(0);
