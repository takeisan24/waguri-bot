#!/usr/bin/env node
// ============================================================
// scripts/quet-truoc-khi-doc.js — BẢN ĐỒ trước khi đọc từng dòng.
//
// VÌ SAO CÓ. Trong loạt audit 5 lô, thứ tự làm việc của tôi không nhất quán: lô game và lô
// fun thì quét trước rồi đọc, còn `interactionCreate.js` — tệp lớn nhất — thì đọc thẳng từ
// đầu tới cuối. Kết quả: đọc đủ 692 dòng trong một lượt mà vẫn bỏ sót BA lỗi cùng một lớp,
// chỉ lộ ra khi chủ repo hỏi lại hai lần và tôi ngồi liệt kê từng lời gọi `db.*`.
//
// Bài học: đọc kỹ không thay được một danh sách kiểm chạy máy. Đọc trước rồi mới quét thì
// bản đồ chỉ dùng để xác nhận thứ mình đã thấy — nó không còn khả năng chỉ ra thứ mình bỏ qua.
//
// CÔNG CỤ NÀY KHÔNG KẾT LUẬN. Nó chỉ xếp ứng viên theo bốn lớp lỗi đã thật sự gây thiệt hại
// trong repo này. Mọi dòng nó chỉ ra đều PHẢI đọc tay — trong loạt audit vừa rồi, máy quét
// đã cho dương tính giả hàng chục lần (đoán sai kiểu vỡ, đọc nhầm bản SQL cũ, regex chỉ khớp
// một dạng return...). Dùng nó để BIẾT PHẢI NHÌN ĐÂU, không phải để biết kết luận.
//
// Cách dùng:
//   node scripts/quet-truoc-khi-doc.js src/events/ready.js index.js
//   node scripts/quet-truoc-khi-doc.js src/commands/economy
// ============================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- L1: lời gọi GHI bỏ kết quả -----------------------------------------------------
// Hàm bọc trong database.js trả `false`/`null` khi DB lỗi. Bỏ kết quả = nhánh sau chạy tiếp
// như thể xong việc, rồi báo thành công. Đây là lớp lỗi ĐÔNG NHẤT của cả loạt audit.
const CHI_DOC = /^(get|is|has|list|count|fetch|find|read|tra|xem|lay)/i;
const GIU_KET_QUA = /(const|let|var)\s+\w+\s*=\s*await\s+db\.|if\s*\(!?\s*await\s+db\.|\.then\(|\.catch\(|return\s+await\s+db\.|return\s+db\./;

// ---- L3: hành động KHÔNG ĐẢO NGƯỢC ĐƯỢC ---------------------------------------------
// Xoá kênh / ban / kick / xoá tin. Chúng phải phụ thuộc vào bước có thể hỏng đứng trước —
// vụ `closeTicket` khoá người dùng vĩnh viễn khỏi hệ thống ticket ra đời đúng từ đây.
const KHONG_DAO_NGUOC = /\.delete\(|\.ban\(|\.kick\(|bans\.create\(|\.bulkDelete\(|deleteUserData|resetUser/;

function quetTep(tuyetDoi) {
    const tuongDoi = path.relative(ROOT, tuyetDoi).split(path.sep).join('/');
    const tho = fs.readFileSync(tuyetDoi, 'utf8');
    // Bỏ chú thích: chú thích trong repo này nhắc lại rất nhiều mẫu mã, quét cả vào là ngập
    // dương tính giả (đã mắc: regex tên role trong chú thích bị đếm như mã sống).
    const sach = tho.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
                    .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const dong = sach.split('\n');

    const ra = { L1: [], L2: [], L3: [], L4: [] };

    dong.forEach((l, i) => {
        const so = i + 1;

        // L1 — GHI mà bỏ kết quả
        const mDb = l.match(/db\.([a-zA-Z_]+)\s*\(/);
        if (mDb && !CHI_DOC.test(mDb[1]) && !GIU_KET_QUA.test(l)) {
            ra.L1.push({ so, chi: mDb[1], ma: l.trim().slice(0, 84) });
        }

        // L2 — chuỗi ghi cứng (có dấu tiếng Việt) không đi qua t()
        if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(l)
            && /(content|description|reply|send|setTitle|setDescription|setFooter)\s*[:(]/.test(l)
            && !/\bt\(/.test(l)) {
            ra.L2.push({ so, ma: l.trim().slice(0, 84) });
        }

        // L3 — hành động không đảo ngược được
        if (KHONG_DAO_NGUOC.test(l)) {
            ra.L3.push({ so, ma: l.trim().slice(0, 84) });
        }
    });

    // L4 — BẤT ĐỐI XỨNG ANH EM: cùng một hàm/khoá dùng ở nhiều nơi trong CÙNG tệp nhưng
    // cách xử lý khác nhau. Lớp này đã trúng 4 lần: config vs antinuke, /vote lệnh vs
    // webhook, handleTicketOpen vs hai nút của chính nó, đường mở vs đường đóng ticket.
    const demGoi = {};
    for (const l of dong) {
        const m = l.match(/(?:db|await)\s*\.?\s*([a-zA-Z_]{4,})\s*\(/g) || [];
        for (const g of m) {
            const ten = g.replace(/[^a-zA-Z_]/g, '');
            if (ten.length < 5) continue;
            demGoi[ten] = (demGoi[ten] || 0) + 1;
        }
    }
    for (const [ten, n] of Object.entries(demGoi)) {
        if (n < 2) continue;
        const cacDong = dong.map((l, i) => ({ l, so: i + 1 }))
            .filter(x => new RegExp(`\\b${ten}\\s*\\(`).test(x.l));
        const cachXuLy = new Set(cacDong.map(x => GIU_KET_QUA.test(x.l) ? 'giữ' : 'bỏ'));
        if (cachXuLy.size > 1) {
            ra.L4.push({ ten, dong: cacDong.map(x => x.so).join(', ') });
        }
    }

    return { tep: tuongDoi, tongDong: dong.length, ...ra };
}

function liet(nhan, ds, ve) {
    if (!ds.length) return;
    console.log(`    ${nhan} — ${ds.length} ứng viên`);
    for (const x of ds) console.log('      ' + ve(x));
}

const args = process.argv.slice(2);
if (!args.length) {
    console.error('Cách dùng: node scripts/quet-truoc-khi-doc.js <tệp|thư mục> [...]');
    process.exit(2);
}

const tepCanQuet = [];
for (const a of args) {
    const p = path.isAbsolute(a) ? a : path.join(ROOT, a);
    if (!fs.existsSync(p)) { console.error(`  ⚠️  không thấy: ${a}`); continue; }
    if (fs.statSync(p).isDirectory()) {
        for (const f of fs.readdirSync(p)) if (f.endsWith('.js')) tepCanQuet.push(path.join(p, f));
    } else tepCanQuet.push(p);
}

console.log(`\n  BẢN ĐỒ TRƯỚC KHI ĐỌC — ${tepCanQuet.length} tệp\n`);
console.log('  Bốn lớp lỗi đã thật sự gây thiệt hại trong repo này:');
console.log('    L1  lời gọi GHI bỏ kết quả  -> báo thành công khi DB từ chối');
console.log('    L2  chuỗi ghi cứng          -> không qua i18n');
console.log('    L3  hành động không đảo ngược -> phải phụ thuộc bước có thể hỏng trước nó');
console.log('    L4  bất đối xứng anh em     -> cùng một hàm, hai cách xử lý trong cùng tệp\n');

let tong = { L1: 0, L2: 0, L3: 0, L4: 0 };
for (const f of tepCanQuet) {
    const r = quetTep(f);
    const n = r.L1.length + r.L2.length + r.L3.length + r.L4.length;
    tong.L1 += r.L1.length; tong.L2 += r.L2.length; tong.L3 += r.L3.length; tong.L4 += r.L4.length;
    console.log(`  ${n ? '●' : '○'} ${r.tep}  (${r.tongDong} dòng)`);
    liet('L1 GHI bỏ kết quả', r.L1, x => `${String(x.so).padStart(4)}  ${x.chi.padEnd(22)} ${x.ma}`);
    liet('L2 chuỗi ghi cứng', r.L2, x => `${String(x.so).padStart(4)}  ${x.ma}`);
    liet('L3 không đảo ngược', r.L3, x => `${String(x.so).padStart(4)}  ${x.ma}`);
    liet('L4 bất đối xứng', r.L4, x => `${x.ten} — dòng ${x.dong}`);
    if (n) console.log('');
}

console.log(`\n  TỔNG ứng viên: L1=${tong.L1}  L2=${tong.L2}  L3=${tong.L3}  L4=${tong.L4}`);
console.log('  Đây là DANH SÁCH PHẢI NHÌN, không phải danh sách lỗi. Mọi dòng đều phải đọc tay —');
console.log('  trong loạt audit vừa rồi máy quét đã cho dương tính giả hàng chục lần.\n');
