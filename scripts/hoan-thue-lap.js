#!/usr/bin/env node
// ============================================================
// scripts/hoan-thue-lap.js — Hoàn thuế tài sản bị thu LẶP + nhắn riêng người được hoàn.
// DÙNG MỘT LẦN cho sự cố 05/10 → 11/2026 (spec P1 trong docs/spec-index-js.md); bị xoá
// cùng hàm `hoan_thue_lap` ở migration 0162.
//
// KHÔNG CHỨA DỮ LIỆU: danh sách ai được hoàn bao nhiêu nằm trong file JSON riêng ở `docs/`
// (ngoài git, vì chứa Discord ID). Script chỉ đọc file đó rồi gọi `db.hoanThueLap()`.
// Chống hoàn hai lần nằm ở DB (khoá (dot, user_id)) → chạy lại bao nhiêu lần cũng an toàn.
//
// THỨ TỰ BẮT BUỘC: áp migration 0161 TRƯỚC rồi mới hoàn — làm ngược thì việc 12 tiếng kiểu
// cũ có thể thu thuế ngay trên số tiền vừa hoàn.
//
// Cách dùng:
//   Hoàn tiền:
//     node scripts/hoan-thue-lap.js <file.json> --db test|prod --dot <ten-dot> [--thu]
//   Nhắn riêng (sau khi hoàn xong mọi đợt; số tiền lấy từ BIÊN LAI trong DB):
//     node scripts/hoan-thue-lap.js --nhan --db test|prod --dot <dot1,dot2> --den-ngay YYYY-MM-DD [--thu]
//
//   --thu   chạy thử: chỉ đọc + in bảng, KHÔNG ghi DB, KHÔNG gửi tin.
//   --ghi <đường dẫn>  lưu kết quả đầy đủ (có Discord ID) ra file — nên đặt trong docs/.
//
// Màn hình chỉ in 4 số cuối của Discord ID.
// ============================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ---------- Tham số ----------
const argv = process.argv.slice(2);
const co = f => argv.includes(f);
const giaTri = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const voCo = new Set(['--db', '--dot', '--den-ngay', '--ghi']);
const viTri = argv.filter((a, i) => !a.startsWith('--') && !voCo.has(argv[i - 1]));

const THU = co('--thu');
const NHAN = co('--nhan');
const DB = giaTri('--db');
const DOTS = String(giaTri('--dot') || '').split(',').map(s => s.trim()).filter(Boolean);
const GHI = giaTri('--ghi');

function dung(msg) { console.error(`❌ ${msg}`); process.exit(1); }

if (DB !== 'test' && DB !== 'prod') dung('Phải ghi rõ --db test hoặc --db prod.');
if (!DOTS.length) dung('Thiếu --dot <ten-dot>.');
if (!NHAN && DOTS.length !== 1) dung('Hoàn tiền chỉ nhận MỘT --dot mỗi lần.');

// Trỏ database.js vào đúng DB TRƯỚC khi require (nó đọc biến môi trường lúc nạp).
if (DB === 'test') {
    if (!process.env.TEST_SUPABASE_URL || !process.env.TEST_SUPABASE_SERVICE_KEY) dung('Thiếu TEST_SUPABASE_* trong .env.');
    process.env.SUPABASE_URL = process.env.TEST_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_KEY;
}
const db = require('../src/database.js');
const config = require('../src/config');

const an = id => `…${String(id).slice(-4)}`;
const TRAN = 1_100_000;                          // khớp c_tran trong hoan_thue_lap (0161)
const TU_NGAY = '2026-10-05';                    // ngày đầu sổ còn giữ (spec S4)

function ghiFile(duLieu) {
    if (!GHI) return;
    fs.writeFileSync(path.resolve(GHI), JSON.stringify(duLieu, null, 2) + '\n');
    console.log(`📝 Đã lưu kết quả đầy đủ: ${GHI}`);
}

// ---------- Hoàn tiền ----------
function docDanhSach(file) {
    if (!file) dung('Thiếu đường dẫn file JSON danh sách.');
    let j;
    try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { dung(`Không đọc được ${file}: ${e.message}`); }
    const ds = Array.isArray(j?.danh_sach) ? j.danh_sach : dung('File thiếu mảng danh_sach.');
    const thay = new Set();
    for (const r of ds) {
        if (!r || typeof r.user_id !== 'string' || !/^\d{5,25}$/.test(r.user_id)) dung(`Dòng có user_id hỏng: ${JSON.stringify(r?.user_id)}`);
        if (thay.has(r.user_id)) dung(`user_id trùng trong file: ${an(r.user_id)}`);
        thay.add(r.user_id);
        if (!Number.isSafeInteger(r.xu_can_hoan) || r.xu_can_hoan <= 0 || r.xu_can_hoan > TRAN) {
            dung(`${an(r.user_id)}: xu_can_hoan = ${r.xu_can_hoan} nằm ngoài (0, ${TRAN}]`);
        }
    }
    const tong = ds.reduce((a, r) => a + r.xu_can_hoan, 0);
    if (j.tong_xu_can_hoan !== undefined && j.tong_xu_can_hoan !== tong) {
        dung(`Tổng các dòng (${tong}) ≠ tong_xu_can_hoan trong file (${j.tong_xu_can_hoan}).`);
    }
    return { ds, tong };
}

async function hoanTien() {
    const { ds, tong } = docDanhSach(viTri[0]);
    const dot = DOTS[0];
    console.log(`DB: ${DB} · đợt: ${dot} · ${ds.length} người · tổng ${tong.toLocaleString('vi-VN')} xu · ${THU ? 'CHẠY THỬ (không ghi)' : 'CHẠY THẬT'}`);

    const doc = await db.docHoanThueLap(ds.map(r => r.user_id), [dot]);
    if (!doc) dung('Không đọc được DB (xem log phía trên).');
    const daHoan = new Map(doc.bienLai.map(b => [b.user_id, b.so_xu]));

    if (THU) {
        console.table(ds.map((r, i) => ({
            '#': i + 1,
            ai: an(r.user_id),
            so_xu: r.xu_can_hoan.toLocaleString('vi-VN'),
            so_lan_lap: r.so_lan_lap,
            co_trong_db: doc.nguoi.has(r.user_id) ? 'có' : 'KHÔNG (sẽ bỏ qua)',
            ngon_ngu: doc.nguoi.get(r.user_id)?.locale || '(vi)',
            da_hoan_dot_nay: daHoan.has(r.user_id) ? `rồi (${daHoan.get(r.user_id)})` : 'chưa',
        })));
        const hoanDuoc = ds.filter(r => doc.nguoi.has(r.user_id) && !daHoan.has(r.user_id));
        console.log(`→ Chạy thật sẽ hoàn ${hoanDuoc.length} người, ${hoanDuoc.reduce((a, r) => a + r.xu_can_hoan, 0).toLocaleString('vi-VN')} xu.`);
        return;
    }

    const ketQua = [];
    for (const r of ds) {
        const res = await db.hoanThueLap(r.user_id, r.xu_can_hoan, dot);
        ketQua.push({ user_id: r.user_id, so_xu: r.xu_can_hoan, status: res?.status ?? 'loi_mang_hoac_db' });
        console.log(`  ${an(r.user_id)}  ${String(r.xu_can_hoan).padStart(9)}  → ${res?.status ?? 'LỖI (không rõ đã hoàn chưa — chạy lại script)'}`);
    }
    const dem = s => ketQua.filter(k => k.status === s);
    const ok = dem('ok');
    console.log(`\nXong: ok ${ok.length} (${ok.reduce((a, k) => a + k.so_xu, 0).toLocaleString('vi-VN')} xu) · ` +
        `already ${dem('already').length} · không có người ${dem('khong_co_user').length} · ` +
        `khác/lỗi ${ketQua.length - ok.length - dem('already').length - dem('khong_co_user').length}`);
    ghiFile({ dot, db: DB, luc: new Date().toISOString(), ket_qua: ketQua });
    if (ketQua.some(k => !['ok', 'already', 'khong_co_user'].includes(k.status))) process.exit(1);
}

// ---------- Nhắn riêng ----------
function ngay(iso, locale) {
    const d = new Date(`${iso}T12:00:00+07:00`);
    if (Number.isNaN(d.getTime())) dung(`Ngày hỏng: ${iso}`);
    // Tiếng Việt viết tay "DD/MM": ICU của Node in vi-VN thành "05-10", không đúng spec S4.
    // Tiếng Anh dùng "Oct 5" vì "05/10" người đọc Mỹ hiểu là 10 tháng 5.
    return locale === 'en'
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' })
        : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// Câu chữ: spec S4 (giọng Waguri, đã chốt). Đơn vị tiền lấy từ config.CURRENCY.
function soanTin(locale, soXu, denNgay) {
    const tien = config.CURRENCY;
    if (locale === 'en') {
        return `🌸 Waguri is so sorry! Because of a system bug, your wealth tax was charged more than once between ${ngay(TU_NGAY, 'en')} and ${ngay(denNgay, 'en')}. ` +
            `Waguri has refunded **${soXu.toLocaleString('en-US')} ${tien}** to your bank, and the bug is fixed now. Thank you for your patience!`;
    }
    return `🌸 Waguri xin lỗi cậu nhé! Do lỗi hệ thống, thuế tài sản của cậu đã bị thu trùng trong khoảng ${ngay(TU_NGAY, 'vi')} – ${ngay(denNgay, 'vi')}. ` +
        `Waguri đã hoàn **${soXu.toLocaleString('vi-VN')} ${tien}** vào ngân hàng của cậu rồi. Lỗi cũng đã được sửa, cảm ơn cậu đã kiên nhẫn với Waguri!`;
}

async function discord(duong, body) {
    const res = await fetch(`https://discord.com/api/v10${duong}`, {
        method: 'POST',
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, http: res.status, code: j?.code, data: j, retryAfter: j?.retry_after };
}

async function nhanTin() {
    const denNgay = giaTri('--den-ngay');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(denNgay || '')) dung('Thiếu --den-ngay YYYY-MM-DD (ngày áp 0161 lên prod).');
    if (!THU && !process.env.DISCORD_TOKEN) dung('Thiếu DISCORD_TOKEN trong .env.');

    // Số tiền trong tin = tổng BIÊN LAI trong DB (sự thật), không phải số trong file JSON.
    const truoc = await db.docHoanThueLap([], DOTS);
    if (!truoc) dung('Không đọc được biên lai.');
    const tong = new Map();
    for (const b of truoc.bienLai) tong.set(b.user_id, (tong.get(b.user_id) || 0) + b.so_xu);
    const doc = await db.docHoanThueLap([...tong.keys()], DOTS);
    if (!doc) dung('Không đọc được người chơi.');

    const ds = [...tong.entries()].map(([uid, soXu]) => {
        const locale = doc.nguoi.get(uid)?.locale === 'en' ? 'en' : 'vi';
        return { user_id: uid, so_xu: soXu, locale, noi_dung: soanTin(locale, soXu, denNgay) };
    });
    console.log(`DB: ${DB} · đợt: ${DOTS.join(', ')} · ${ds.length} người có biên lai · ${THU ? 'CHẠY THỬ (không gửi)' : 'GỬI THẬT'}`);

    if (THU) {
        for (const [i, r] of ds.entries()) console.log(`\n#${i + 1} ${an(r.user_id)} · ${r.locale} · ${r.so_xu}\n${r.noi_dung}`);
        return;
    }

    const ketQua = [];
    for (const r of ds) {
        let kq;
        const kenh = await discord('/users/@me/channels', { recipient_id: r.user_id });
        if (!kenh.ok) {
            kq = `loi_mo_kenh_${kenh.code ?? kenh.http}`;
        } else {
            const gui = await discord(`/channels/${kenh.data.id}/messages`, { content: r.noi_dung });
            // 50007 = người chơi khoá tin nhắn riêng → ghi lại, KHÔNG thử lại (spec S1 #10).
            kq = gui.ok ? 'da_gui' : gui.code === 50007 ? 'khoa_tin_nhan' : `loi_${gui.code ?? gui.http}`;
        }
        ketQua.push({ user_id: r.user_id, so_xu: r.so_xu, locale: r.locale, ket_qua: kq });
        console.log(`  ${an(r.user_id)} → ${kq}`);
        await new Promise(res => setTimeout(res, 1500));   // giãn nhịp, tránh chạm hạn mức DM
    }
    const dem = s => ketQua.filter(k => k.ket_qua === s).length;
    console.log(`\nXong: đã gửi ${dem('da_gui')} · khoá tin nhắn ${dem('khoa_tin_nhan')} · lỗi khác ${ketQua.length - dem('da_gui') - dem('khoa_tin_nhan')}`);
    ghiFile({ dots: DOTS, db: DB, luc: new Date().toISOString(), ket_qua: ketQua });
}

(NHAN ? nhanTin() : hoanTien())
    .then(() => process.exit(0))
    .catch(e => { console.error('❌', e?.message || e); process.exit(1); });
