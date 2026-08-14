#!/usr/bin/env node
// ============================================================
// scripts/check-db-drift.js — Chặn DB test TRÔI khỏi prod.
//
// VÌ SAO CÓ: WORKFLOW §6 bắt buộc "áp migration lên test trước, npm test xanh, RỒI mới áp
// prod". Lưới an toàn đó chỉ có tác dụng khi test GIỐNG prod. Tháng 8/2026 phát hiện test
// thiếu 4 bảng + 3 hàm + 5 cột so với prod — nó đã chặn giữa chừng 3 lần trong MỘT phiên
// làm việc, đúng lúc cần nhất. Cảnh báo bằng văn xuôi trong WORKFLOW.md không ngăn được gì.
//
// KHÔNG CÓ ALLOWLIST — cố ý. Nguyên tắc đã chốt: *test là gương 1:1 của prod*. Allowlist cho
// độ lệch schema là lỗ rò chậm: ngoại lệ tích tụ rồi có ngày một độ lệch THẬT lọt vào mà
// không ai nhận ra. Muốn hết lệch thì SỬA DB, không phải sửa danh sách miễn trừ.
//
// So DB test với ẢNH CHỤP prod (không nối thẳng prod) -> CI chỉ cần khoá test, khoá prod
// không bao giờ rời máy local. Xem scripts/db-snapshot.js.
// ============================================================

const fs = require('fs');
const path = require('path');
const { layVanTay, coCauHinh } = require('./lib/dbFingerprint');

const ANH_CHUP = path.join(__dirname, '..', 'supabase', 'schema-snapshot.json');
// DB test ngủ (Supabase free tier tự ngủ khi lâu không dùng) KHÔNG được chặn mọi lần push.
const meoNhe = process.argv.includes('--soft');

const lech = [];
const soSanhMang = (ten, a = [], b = []) => {
    const A = new Set(a), B = new Set(b);
    for (const x of a) if (!B.has(x)) lech.push(`${ten}: TEST THIẾU  →  ${x}`);
    for (const x of b) if (!A.has(x)) lech.push(`${ten}: TEST DƯ     →  ${x}`);
};

(async () => {
    if (!fs.existsSync(ANH_CHUP)) {
        console.error('❌ Chưa có supabase/schema-snapshot.json. Chạy: npm run db:snapshot');
        process.exit(1);
    }
    const chuan = JSON.parse(fs.readFileSync(ANH_CHUP, 'utf8'));

    if (!coCauHinh('test')) {
        console.log('⏭️  Bỏ qua so lệch: chưa cấu hình TEST_SUPABASE_* (mặc định an toàn).');
        process.exit(0);
    }

    let test;
    try {
        test = await layVanTay('test');
    } catch (e) {
        if (meoNhe) {
            console.warn('⚠️  KHÔNG đọc được DB test — bỏ qua để không chặn push.');
            console.warn('   ' + e.message.split('\n')[0]);
            console.warn('   Chạy `npm run check-db` khi DB test tỉnh lại.');
            process.exit(0);
        }
        console.error('❌ ' + e.message);
        process.exit(1);
    }

    // --- bảng & cột ---
    const bangChuan = chuan.tables || {}, bangTest = test.tables || {};
    soSanhMang('bảng', Object.keys(bangChuan), Object.keys(bangTest));
    for (const b of Object.keys(bangChuan)) {
        if (!bangTest[b]) continue;                       // đã báo ở trên
        soSanhMang(`cột ${b}`, bangChuan[b], bangTest[b]);
    }

    // --- hàm, index, event trigger ---
    soSanhMang('hàm', chuan.functions, test.functions);
    soSanhMang('index', chuan.indexes, test.indexes);
    soSanhMang('event trigger', chuan.event_triggers, test.event_triggers);

    // --- thuộc tính bảo mật: không so hai chiều mà bắt tuyệt đối, cả hai DB đều phải sạch ---
    for (const b of test.bang_chua_bat_rls || []) lech.push(`BẢO MẬT: bảng test chưa bật RLS → ${b}`);
    for (const f of test.definer_khong_ghim_search_path || []) lech.push(`BẢO MẬT: hàm test SECURITY DEFINER chưa ghim search_path → ${f}`);

    const soBang = Object.keys(bangChuan).length;
    console.log(`So DB test với ảnh chụp prod: ${soBang} bảng · ${(chuan.functions || []).length} hàm · ` +
                `${(chuan.indexes || []).length} index`);

    if (lech.length) {
        console.error(`\n❌ ${lech.length} độ lệch giữa DB test và prod:\n`);
        lech.forEach(l => console.error('  • ' + l));
        console.error('\nWORKFLOW §6: áp migration thì áp CẢ HAI DB. Test lệch prod = lưới an toàn hỏng');
        console.error('đúng lúc cần nhất. Sửa DB cho khớp — KHÔNG có danh sách miễn trừ ở gate này.');
        process.exit(1);
    }
    console.log('✅ DB test khớp ảnh chụp prod, không độ lệch nào.');
})();
