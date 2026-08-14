#!/usr/bin/env node
// ============================================================
// scripts/db-snapshot.js — Sinh ảnh chụp schema của prod, commit vào repo.
//
// VÌ SAO CÓ: hai gate của Đợt 3 cần biết "prod đang có gì". Đưa khoá service-role của prod
// lên GitHub Actions là mở bề mặt tấn công rất rộng — `npm ci` cài 231 package, bất kỳ cái
// nào cũng đọc được biến môi trường của job. Thay vào đó: sinh ảnh chụp Ở MÁY LOCAL rồi
// commit, để CI đối chiếu mà KHÔNG cần khoá prod.
//
// AN TOÀN: ảnh chụp chỉ chứa CẤU TRÚC (tên bảng/cột/kiểu/hàm/index), KHÔNG chứa một dòng
// dữ liệu người chơi nào. Và 122 file migration vốn đã công khai trên GitHub nên tên bảng
// /cột/hàm không phải bí mật — ảnh chụp không làm lộ thêm gì.
//
// KHÔNG PHẢI ALLOWLIST: ảnh chụp được SINH RA từ prod chứ không gõ tay. "Cập nhật ảnh chụp"
// = "ghi lại đúng thứ prod đang có". Sinh lại để giấu lỗi là bất khả: muốn giấu test-lệch
// -prod thì Gate B vẫn so test với prod; muốn giấu migration-chưa-áp thì object vẫn vắng.
//
//   node scripts/db-snapshot.js          -> ghi supabase/schema-snapshot.json
//   node scripts/db-snapshot.js --check  -> chỉ SO SÁNH, không ghi (dùng ở pre-push)
// ============================================================

const fs = require('fs');
const path = require('path');
const { layVanTay } = require('./lib/dbFingerprint');

const DUONG_DAN = path.join(__dirname, '..', 'supabase', 'schema-snapshot.json');
const chiKiemTra = process.argv.includes('--check');

// Sắp xếp khoá để file ổn định giữa các lần sinh -> diff chỉ hiện thay đổi THẬT.
function chuanHoa(o) {
    if (Array.isArray(o)) return o.map(chuanHoa);
    if (o && typeof o === 'object') {
        return Object.fromEntries(Object.keys(o).sort().map(k => [k, chuanHoa(o[k])]));
    }
    return o;
}

(async () => {
    let vanTay;
    try {
        vanTay = chuanHoa(await layVanTay('prod'));
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }

    const noiDung = JSON.stringify({
        _ghi_chu: 'Sinh tự động bởi scripts/db-snapshot.js từ DB PROD. ĐỪNG sửa tay — ' +
                  'chạy lại `npm run db:snapshot` sau khi áp migration mới.',
        ...vanTay,
    }, null, 2) + '\n';

    if (chiKiemTra) {
        if (!fs.existsSync(DUONG_DAN)) {
            console.error('❌ Chưa có ảnh chụp. Chạy: npm run db:snapshot');
            process.exit(1);
        }
        if (fs.readFileSync(DUONG_DAN, 'utf8') === noiDung) {
            console.log('✅ Ảnh chụp khớp với DB prod thật.');
            process.exit(0);
        }
        console.error('❌ Ảnh chụp KHÁC với DB prod thật.');
        console.error('   Nghĩa là prod đã đổi mà ảnh chụp chưa cập nhật (hoặc ngược lại).');
        console.error('   -> Nếu prod đổi là ĐÚNG Ý: chạy `npm run db:snapshot` rồi commit.');
        console.error('   -> Nếu KHÔNG ai định đổi prod: có người sửa DB bằng tay, cần điều tra.');
        process.exit(1);
    }

    fs.writeFileSync(DUONG_DAN, noiDung, 'utf8');
    const soBang = Object.keys(vanTay.tables || {}).length;
    const soCot = Object.values(vanTay.tables || {}).reduce((s, c) => s + c.length, 0);
    console.log(`✅ Đã ghi ${path.relative(path.join(__dirname, '..'), DUONG_DAN)}`);
    console.log(`   ${soBang} bảng · ${soCot} cột · ${(vanTay.functions || []).length} hàm · ` +
                `${(vanTay.indexes || []).length} index · ${(vanTay.event_triggers || []).length} event trigger`);
})();
