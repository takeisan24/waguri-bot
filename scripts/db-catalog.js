#!/usr/bin/env node
// ============================================================
// scripts/db-catalog.js — Chụp danh sách ID vật phẩm/nghề từ DB prod để gate chạy OFFLINE.
//
// Cùng nguyên tắc với `db-snapshot.js`: khoá service-role của prod KHÔNG rời máy local;
// CI chỉ đọc file đã commit. Ở đây còn nhẹ hơn — chỉ có DANH SÁCH ID, không có tên, không
// có giá, không có dữ liệu người chơi.
//
//   npm run db:catalog        -> ghi scripts/db-catalog-ids.json
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RA = path.join(__dirname, 'db-catalog-ids.json');

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
        fs.writeFileSync(RA, JSON.stringify({
            _ghi_chu: 'Sinh tự động bởi scripts/db-catalog.js từ DB PROD. Chỉ chứa ID, không có ' +
                      'tên/giá/dữ liệu người chơi. Chạy lại sau khi thêm hoặc xoá vật phẩm.',
            items, jobs,
        }, null, 2) + '\n', 'utf8');
        console.log(`✅ Đã ghi ${path.basename(RA)} — ${items.length} vật phẩm · ${jobs.length} nghề`);
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(1);
    }
})();
