// Helper dùng chung cho các gate soi DB: lấy "vân tay schema" của một DB qua RPC.
//
// Vì sao qua RPC chứ không đọc catalog trực tiếp: `@supabase/supabase-js` đi qua PostgREST,
// mà PostgREST không phơi `information_schema`/`pg_catalog`. Hàm `schema_fingerprint()`
// (migration 0113) để chính DB tự mô tả mình — gate chỉ cần một lời gọi, không cần thêm
// thư viện Postgres thuần.
require('dotenv').config();

const KHOA = {
    prod: { url: 'SUPABASE_URL', key: 'SUPABASE_SERVICE_KEY' },
    test: { url: 'TEST_SUPABASE_URL', key: 'TEST_SUPABASE_SERVICE_KEY' },
};

/** Biến môi trường của DB này đã cấu hình chưa? (không in ra giá trị) */
function coCauHinh(moiTruong) {
    const k = KHOA[moiTruong];
    const url = process.env[k.url];
    const key = process.env[k.key];
    return Boolean(url && key && !url.includes('dummy'));
}

/**
 * @param {'prod'|'test'} moiTruong
 * @returns {Promise<object>} vân tay schema
 * @throws nếu thiếu cấu hình hoặc DB không phản hồi
 */
async function layVanTay(moiTruong) {
    const k = KHOA[moiTruong];
    if (!coCauHinh(moiTruong)) {
        throw new Error(`Thiếu ${k.url} / ${k.key} trong .env — không lấy được vân tay DB ${moiTruong}.`);
    }
    const { createClient } = require('@supabase/supabase-js');
    const db = createClient(process.env[k.url], process.env[k.key], {
        auth: { persistSession: false },
    });

    const { data, error } = await db.rpc('schema_fingerprint');
    if (error) {
        // Thiếu chính hàm này cũng là một dạng "migration chưa áp" -> nói rõ cách sửa.
        throw new Error(
            `Không gọi được schema_fingerprint() trên DB ${moiTruong}: ${error.message}\n` +
            `   -> Có thể migration 0113_schema_fingerprint.sql chưa được áp lên DB đó.`
        );
    }
    if (!data || typeof data !== 'object') {
        throw new Error(`DB ${moiTruong} trả về vân tay rỗng/không hợp lệ.`);
    }
    return data;
}

module.exports = { layVanTay, coCauHinh, KHOA };
