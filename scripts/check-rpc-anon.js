#!/usr/bin/env node
// ============================================================
// scripts/check-rpc-anon.js — Chặn việc RPC ghi dữ liệu bị mở cho khoá công khai.
//
// VÌ SAO CÓ: 2026-08-24 phát hiện 75 hàm RPC ghi dữ liệu gọi được bằng khoá `anon` — khoá
// nằm sẵn trong bundle JavaScript của web. Chứng minh bằng lời gọi HTTP thật:
// `transfer_money` trả HTTP 200 (hàm chạy) với khoá anon. Trong đó có đường cướp sạch ví
// người khác, máy in tiền (`quest_claim` để người gọi tự khai số thưởng), và
// `set_guild_setting` đổi được cấu hình bot của server bất kỳ.
//
// VÌ SAO CỔNG NÀY HỎI DB CHỨ KHÔNG QUÉT FILE: không ai viết `GRANT ... TO anon` cả.
// Postgres MẶC ĐỊNH cho PUBLIC quyền EXECUTE trên mọi hàm vừa tạo. `check-sql-policy.js`
// quét chữ trong migration nên không thể thấy — nó đọc điều ta VIẾT, còn lỗ hổng nằm ở
// điều Postgres LẶNG LẼ LÀM. Cổng này vì thế hỏi thẳng DB qua rpc_mo_cho_anon() (0138).
//
// Migration 0137 đã thu quyền, và thêm `alter default privileges ... revoke execute ...
// from public` để hàm mới không tự mở lại. Cổng này canh trường hợp ai đó gỡ dòng đó,
// GRANT tay, hoặc tạo hàm bằng vai trò khác.
// ============================================================
require('dotenv').config();
const { coCauHinh, KHOA } = require('./lib/dbFingerprint');
const { trongPhamVi } = require('./lib/phamViWaguri');

// DB test ngủ (Supabase free tier) không được chặn mọi lần push.
const meoNhe = process.argv.includes('--soft');

function noi(moiTruong) {
    const k = KHOA[moiTruong];
    const { createClient } = require('@supabase/supabase-js');
    return createClient(process.env[k.url], process.env[k.key], { auth: { persistSession: false } });
}

async function soi(moiTruong) {
    const { data, error } = await noi(moiTruong).rpc('rpc_mo_cho_anon');
    if (error) {
        throw new Error(
            `Không gọi được rpc_mo_cho_anon() trên DB ${moiTruong}: ${error.message}\n` +
            '   -> Có thể migration 0138_ham_soi_quyen_rpc.sql chưa được áp lên DB đó.'
        );
    }
    return Array.isArray(data) ? data : [];
}

// --- Soi BẢNG (không chỉ hàm) --------------------------------
// VÌ SAO THÊM (audit 2026-10-08): cổng này chỉ soi HÀM, nên hai bảng do 0149/0151 sinh ra
// (`study_shop_catalog`, `bakery_completed_orders` — bảng sau chứa user_id) mang policy
// `FOR SELECT` mở cho anon suốt từ 11/09 và 21/09 mà không lưới nào kêu. Phát hiện ra là
// nhờ Supabase advisor, tức nhờ công cụ bên ngoài — đúng nghĩa điểm mù.
async function soiBang(moiTruong) {
    const { data, error } = await noi(moiTruong).rpc('bang_mo_cho_anon');
    if (error) {
        throw new Error(
            `Không gọi được bang_mo_cho_anon() trên DB ${moiTruong}: ${error.message}\n` +
            '   -> Có thể migration 0153_thu_quyen_anon_bang_moi.sql chưa được áp lên DB đó.'
        );
    }
    // Tên bảng nằm trước dấu ' [' trong mỗi dòng mô tả. Bảng của app khác dùng chung DB
    // (xem scripts/lib/phamViWaguri.js) không thuộc trách nhiệm của repo này.
    const tat = Array.isArray(data) ? data : [];
    const cua_minh = [], cua_app_khac = [];
    for (const d of tat) {
        const ten = String(d).split(' [')[0];
        (trongPhamVi('table', ten) ? cua_minh : cua_app_khac).push(d);
    }
    return { cua_minh, cua_app_khac };
}

(async () => {
    const moiTruongs = ['test', 'prod'].filter(coCauHinh);
    if (!moiTruongs.length) {
        console.log('⏭️  Bỏ qua soi quyền RPC: chưa cấu hình DB nào (mặc định an toàn).');
        process.exit(0);
    }

    let hong = false;
    for (const mt of moiTruongs) {
        let ho;
        try {
            ho = await soi(mt);
        } catch (e) {
            if (meoNhe) {
                console.warn(`⚠️  KHÔNG đọc được DB ${mt} — bỏ qua để không chặn push.`);
                console.warn('   ' + e.message.split('\n')[0]);
                continue;
            }
            console.error('❌ ' + e.message);
            process.exit(1);
        }

        // --- Bảng ---
        try {
            const b = await soiBang(mt);
            if (b.cua_app_khac.length) {
                console.log(`ℹ️  DB ${mt}: ${b.cua_app_khac.length} bảng mở cho anon nhưng KHÔNG do migration`);
                console.log('   của Waguri khai báo (DB dùng chung với app khác) — bỏ qua, không chặn:');
                for (const x of b.cua_app_khac) console.log('     · ' + x);
            }
            if (b.cua_minh.length) {
                hong = true;
                console.error(`\n❌ DB ${mt}: ${b.cua_minh.length} BẢNG của Waguri đang đọc/ghi được bằng khoá CÔNG KHAI.`);
                console.error('   RLS bật mà có policy permissive cho anon là vẫn mở — grant không thôi thì không.');
                for (const x of b.cua_minh) console.error('     · ' + x);
                console.error('\n   Cách sửa — thêm vào migration mới:');
                console.error('     drop policy if exists "<tên policy>" on public.<bảng>;');
                console.error('     revoke all on public.<bảng> from anon, authenticated;');
                console.error('     grant select, insert, update, delete on public.<bảng> to service_role;');
            } else {
                console.log(`✅ DB ${mt}: không bảng nào của Waguri mở cho anon/authenticated.`);
            }
        } catch (e) {
            if (meoNhe) {
                console.warn(`⚠️  KHÔNG soi được quyền bảng ở DB ${mt} — bỏ qua để không chặn push.`);
                console.warn('   ' + e.message.split('\n')[0]);
            } else {
                console.error('❌ ' + e.message);
                process.exit(1);
            }
        }

        // --- Hàm ---
        if (ho.length === 0) {
            console.log(`✅ DB ${mt}: không RPC ghi nào mở cho anon/authenticated.`);
            continue;
        }
        hong = true;
        console.error(`\n❌ DB ${mt}: ${ho.length} RPC GHI DỮ LIỆU đang gọi được bằng khoá CÔNG KHAI.`);
        console.error('   Khoá anon nằm trong bundle trình duyệt — ai xem mã nguồn trang cũng lấy được.');
        console.error('   Mỗi dòng dưới đây là một đường ghi thẳng vào DB không cần đăng nhập:\n');
        for (const x of ho) console.error('     · ' + x);
        console.error('\n   Cách sửa — thêm vào migration mới:');
        console.error('     revoke execute on function public.<tên>(<kiểu>) from public, anon, authenticated;');
        console.error('     grant  execute on function public.<tên>(<kiểu>) to service_role;');
        console.error('   Bot và web đều chạy bằng service_role nên KHÔNG gãy gì.');
    }
    process.exit(hong ? 1 : 0);
})();
