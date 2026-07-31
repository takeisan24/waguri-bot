/**
 * Script upload 30 tệp MP3 Album HVL - MCK lên Supabase Storage Private Bucket.
 * Chạy lệnh: node scripts/upload-hvl-to-supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const playlist = require('../src/data/hvl_playlist.json');

require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const LOCAL_AUDIO_DIR = process.env.HVL_AUDIO_DIR || 'C:\\Users\\LAPTOP\\Downloads\\SoundLoadMate.com - H.V.L album RPT MCK - Haziel';
const BUCKET_NAME = 'hvl_audio';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_KEY trong .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('🌸 Đang kiểm tra Supabase Storage Bucket:', BUCKET_NAME);

    // 1. Khởi tạo Bucket nếu chưa có
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some(b => b.name === BUCKET_NAME);

    if (!exists) {
        console.log(`📦 Đang tạo Private Bucket '${BUCKET_NAME}'...`);
        const { error } = await supabase.storage.createBucket(BUCKET_NAME, { public: true });
        if (error) {
            console.error('❌ Lỗi tạo bucket:', error);
            process.exit(1);
        }
        console.log('✅ Tạo Bucket thành công!');
    }

    // 2. Upload 30 bài hát
    console.log('🚀 Bắt đầu upload 30 tệp MP3 lên Supabase Storage...\n');

    let successCount = 0;
    for (const track of playlist) {
        const fileSlug = String(track.id).padStart(2, '0') + '.mp3';
        const localPath = path.join(LOCAL_AUDIO_DIR, track.fileName);

        if (!fs.existsSync(localPath)) {
            console.warn(`⚠️ Không tìm thấy file local: ${track.fileName}`);
            continue;
        }

        const fileBuffer = fs.readFileSync(localPath);
        console.log(`📤 [${fileSlug}] Đang upload: ${track.title}...`);

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileSlug, fileBuffer, {
                contentType: 'audio/mpeg',
                upsert: true
            });

        if (error) {
            console.error(`❌ Lỗi upload bài ${track.title}:`, error);
        } else {
            console.log(`   ✅ Thành công: ${track.title}`);
            successCount++;
        }
    }

    console.log(`\n🎉 HOÀN THÀNH! Đã upload ${successCount}/${playlist.length} tệp MP3 lên Supabase Storage!`);
    console.log(`🔗 URL Base để cấu hình trên Production:`);
    console.log(`   ${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET_NAME}`);
}

main().catch(err => {
    console.error('❌ Lỗi hệ thống:', err);
});
