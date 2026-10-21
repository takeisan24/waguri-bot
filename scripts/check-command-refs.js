#!/usr/bin/env node
// ============================================================
// scripts/check-command-refs.js — Chặn chữ hướng dẫn nhắc tới lệnh KHÔNG tồn tại.
//
// VÌ SAO CÓ: đợt "chuẩn hoá 72 lệnh tiếng Anh" đổi `/tiembanh` -> `/bakery`, `/vay` ->
// `/loan`… và cất `/clan` vào `archive/`, nhưng chữ hướng dẫn không đổi theo. Thêm nữa,
// `commandLocalizer.localizeCommandJSON` ghi đè `name_localizations` bằng tên tiếng Anh,
// nên `setNameLocalizations({ vi: 'tiembanh' })` trong builder không bao giờ tới Discord.
// Hậu quả đo được (feedback 2026-10): người chơi đọc "Vd: `/tiembanh nhapnl ca_ngon 5`"
// và mất 10 phút mới tìm ra lệnh thật là `/bakery`. Lúc quét có ~100 chỗ sai như vậy,
// kể cả cốt truyện `/quest` bắt làm việc bằng `/clan` — lệnh đã không còn.
//
// KIỂM TRA: mọi `` `/ten `` (và `` `/ten sub `` nếu lệnh có subcommand) trong chuỗi người
// chơi đọc phải là lệnh đang đăng ký. Bỏ qua dòng chú thích JS — ở đó tên cũ là lịch sử.
// ============================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMD_DIR = path.join(ROOT, 'src', 'commands');

// Khoá dịch CHỈ code trong `archive/` còn đọc — bot đang chạy không bao giờ hiện ra, nên
// tên lệnh cũ ở đây vô hại. Không xoá vì test của mã đã cất vẫn đọc (vd vay_cong_bo_phi).
// Thêm vào đây phải kèm lý do thật.
const KHOA_CHI_ARCHIVE = {
    'commands.clan.': 'archive/commands/clan.js — /clan đã cất, 0 bang trên prod',
    'commands.vay.':  'archive/commands/vay.js — vay P2P đã thay bằng /loan',
    'commands.market.list_success_desc': 'chợ P2P đã gỡ khỏi /market ở v2.6.0',
};

// Chuỗi trông như `/lệnh` nhưng không phải lệnh. Thêm vào đây phải kèm lý do thật.
const KHONG_PHAI_LENH = {
    day:   '"**{n} messages**/day" — đơn vị "mỗi ngày", dấu `**` đóng in đậm đứng ngay trước',
    slash: '"dùng được bằng /slash" — chỉ kiểu lệnh gạch chéo nói chung',
};

// Từ văn xuôi hay đứng sau tên lệnh ("giữ tiền trong /bank cho an toàn", "/config trong
// Discord", "/bakery with friends") — không phải lệnh con, đừng kiểm.
const TU_VAN_XUOI = new Set(['cho', 'trong', 'with', 'command', 'to', 'for', 'in', 'or', 'and', 'va', 'de', 'nhe']);

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (/\.(js|json)$/.test(e.name)) out.push(p);
    }
    return out;
}

// tên lệnh -> tập subcommand + subcommand group (rỗng nếu lệnh không có)
function dungSoLenh() {
    const so = new Map();
    for (const tep of duyet(CMD_DIR).filter(f => f.endsWith('.js'))) {
        const lenh = require(tep);
        if (!lenh.data || typeof lenh.data.toJSON !== 'function') continue;
        const json = lenh.data.toJSON();
        const subs = new Set();
        for (const o of json.options || []) {
            if (o.type === 1) subs.add(o.name);
            if (o.type === 2) { subs.add(o.name); for (const s of o.options || []) subs.add(s.name); }
        }
        so.set(json.name, subs);
    }
    return so;
}

function kiemChuoi(noiDung, viTri, so, loi) {
    // Bắt `/lệnh` đứng sau backtick, `**` (in đậm), khoảng trắng hay ngoặc — không chỉ dạng
    // backtick: hướng dẫn của nút nhắc nhở viết `**/tiembanh donhang**` đã lọt qua bản đầu.
    // Trước `/` chỉ nhận đầu chuỗi, khoảng trắng, backtick, `*`, `(` — loại URL (`.app/study`),
    // route (`'/api`), thẻ đóng HTML (`</div>`) và regex (`/x/g`). Sau tên phải là ranh giới
    // (khoảng trắng, dấu câu, backtick, `*`) chứ không phải `/` của một đường dẫn tiếp theo.
    // Không nhận `?` làm ranh giới sau tên: regex `/https?:\/\//` không phải lệnh.
    const re = /(?<=^|[\s`*(])\/([a-z][a-z0-9_-]*)(?=$|[\s`*.,!:;)'"\]])(?: +([a-z][a-z0-9_-]*)(?=$|[\s`*.,!:;)'"\]]))?/g;
    let m;
    while ((m = re.exec(noiDung))) {
        const [, ten, sub] = m;
        if (KHONG_PHAI_LENH[ten]) continue;
        const subs = so.get(ten);
        if (!subs) loi.push(`${viTri}  \`/${ten}\` — lệnh không tồn tại`);
        // Lệnh không có subcommand thì từ thứ hai là đối số (`/eat banh_kem_dau`), bỏ qua.
        else if (sub && subs.size > 0 && !subs.has(sub) && !TU_VAN_XUOI.has(sub)) loi.push(`${viTri}  \`/${ten} ${sub}\` — /${ten} không có subcommand "${sub}"`);
    }
}

// Dòng JS người chơi không bao giờ đọc: chú thích, log. Chú thích CUỐI dòng (`code; // ...`)
// cũng cắt bỏ — `//` đứng sau khoảng trắng, nên không đụng `https://` trong chuỗi.
function phanNguoiDoc(dong) {
    const d = dong.trim();
    if (d.startsWith('//') || d.startsWith('*') || d.startsWith('/*')) return '';
    if (/\bconsole\.(log|warn|error|info)\(/.test(d)) return '';
    return dong.replace(/\s\/\/.*$/, '');
}

function quetJson(nut, khoa, viTriTep, so, loi) {
    if (typeof nut === 'string') {
        if (Object.keys(KHOA_CHI_ARCHIVE).some(k => khoa === k || khoa.startsWith(k))) return;
        kiemChuoi(nut, `${viTriTep} ${khoa}`, so, loi);
    } else if (nut && typeof nut === 'object') {
        for (const [k, v] of Object.entries(nut)) quetJson(v, khoa ? `${khoa}.${k}` : k, viTriTep, so, loi);
    }
}

function quet(tep, so, loi) {
    const viTriTep = path.relative(ROOT, tep).replace(/\\/g, '/');
    if (tep.endsWith('.json')) return quetJson(JSON.parse(fs.readFileSync(tep, 'utf8')), '', viTriTep, so, loi);
    fs.readFileSync(tep, 'utf8').split(/\r?\n/).forEach((noiDung, i) => {
        kiemChuoi(phanNguoiDoc(noiDung), `${viTriTep}:${i + 1}`, so, loi);
    });
}

function main() {
    const so = dungSoLenh();
    const tep = [
        ...duyet(path.join(ROOT, 'src')).filter(f => !f.startsWith(CMD_DIR) || f.endsWith('.js')),
        ...duyet(path.join(ROOT, 'web', 'src', 'locales')),
    ];
    const loi = [];
    for (const f of tep) quet(f, so, loi);

    if (loi.length) {
        console.error(`❌ ${loi.length} chỗ hướng dẫn nhắc tới lệnh không tồn tại (người chơi gõ theo sẽ không thấy lệnh):`);
        for (const l of loi) console.error('   ' + l);
        process.exit(1);
    }
    console.log(`✅ Mọi lệnh được nhắc trong chữ hướng dẫn đều tồn tại (${so.size} lệnh, ${tep.length} tệp).`);
}

main();
