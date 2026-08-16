#!/usr/bin/env node
// ============================================================
// scripts/db-catalog.js — Chụp danh sách ID vật phẩm/nghề từ DB prod để gate chạy OFFLINE.
//
// Cùng nguyên tắc với `db-snapshot.js`: khoá service-role của prod KHÔNG rời máy local;
// CI chỉ đọc file đã commit. Ở đây còn nhẹ hơn — chỉ có DANH SÁCH ID, không có tên, không
// có giá, không có dữ liệu người chơi.
//
//   npm run db:catalog           -> ghi scripts/db-catalog-ids.json
//   node scripts/db-catalog.js --check -> chỉ SO SÁNH, không ghi
//
// Vì sao cần `--check`: `check-i18n-data` đối chiếu locale với FILE này, nên nếu ai đó
// thêm vật phẩm vào DB mà quên chạy lại lệnh trên thì gate vẫn xanh trong khi lỗi đã có.
// Tức gate chỉ đúng khi người ta NHỚ chạy — đúng kiểu "luật là văn xuôi" mà dự án đang bỏ.
// `--check` chạy trong `npm run check-db` và trong pre-push khi có đổi migration (thêm
// vật phẩm luôn đi kèm migration), nên khoảng hở đó được bịt bằng máy thay vì trí nhớ.
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RA = path.join(__dirname, 'db-catalog-ids.json');
const chiKiemTra = process.argv.includes('--check');

(async () => {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key || url.includes('dummy')) {
        console.error('❌ Thiếu SUPABASE_URL / SUPABASE_SERVICE_KEY trong .env');
        process.exit(1);
    }
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(url, key, { auth: { persistSession: false } });

    const lay = async (bang) => {
        const { data, error } = await db.from(bang).select('id');
        if (error) throw new Error(`đọc bảng ${bang}: ${error.message}`);
        return (data || []).map(r => r.id).sort();
    };

    try {
        const items = await lay('items');
        const jobs = await lay('jobs');
        const noiDung = JSON.stringify({
            _ghi_chu: 'Sinh tự động bởi scripts/db-catalog.js từ DB PROD. Chỉ chứa ID, không có ' +
                      'tên/giá/dữ liệu người chơi. Chạy lại sau khi thêm hoặc xoá vật phẩm.',
            items, jobs,
        }, null, 2) + '\n';

        if (chiKiemTra) {
            if (!fs.existsSync(RA)) {
                console.error('❌ Chưa có db-catalog-ids.json. Chạy: npm run db:catalog');
                process.exit(1);
            }
            if (fs.readFileSync(RA, 'utf8') === noiDung) {
                console.log(`✅ Danh mục khớp DB prod (${items.length} vật phẩm · ${jobs.length} nghề).`);
                process.exit(0);
            }
            console.error('❌ db-catalog-ids.json ĐÃ CŨ so với DB prod.');
            console.error('   Nghĩa là danh mục vật phẩm/nghề đã đổi mà file chưa cập nhật —');
            console.error('   `check-i18n-data` sẽ gác theo danh sách cũ và bỏ lọt món chưa dịch.');
            console.error('   -> Chạy `npm run db:catalog`, thêm tên tiếng Anh cho món mới, rồi commit.');
            process.exit(1);
        }

        fs.writeFileSync(RA, noiDung, 'utf8');
        console.log(`✅ Đã ghi ${path.basename(RA)} — ${items.length} vật phẩm · ${jobs.length} nghề`);
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }
})();
