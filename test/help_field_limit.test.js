// ============================================================
// test/help_field_limit.test.js — Chặn NGÒI NỔ CHẬM ở trường "danh sách sub" của /help.
//
// VÌ SAO CÓ: `help.js` dựng một field embed liệt kê MỌI subcommand của lệnh đang xem,
// dạng `` `tên` — mô tả `` nối bằng xuống dòng, và KHÔNG cắt. Discord chặn cứng 1024 ký tự
// cho value của một field; vượt là ném `RangeError` và cả tin nhắn không gửi được.
//
// Đo ngày 21-08: 0/29 lệnh vượt, nhưng `/config` đã ở **781/1024** — tức 76%. Thêm chừng
// ba subcommand nữa là vỡ. Và vỡ ở `/help`, KHÔNG phải ở `/config`, nên người sửa
// `/config` sẽ không hiểu vì sao `/help` chết. Đúng kiểu lỗi tốn nhiều giờ nhất để lần ra.
//
// Ngưỡng đặt ở 900 chứ không phải 1024: để còn chỗ cho khoảng một subcommand nữa, và để
// cảnh báo TRƯỚC khi chạm vách chứ không phải lúc đã rơi.
//
// ĐƯỜNG PHÌNH LÀ "THÊM SUB", KHÔNG PHẢI "MÔ TẢ DÀI": discord.js chặn cứng mô tả
// subcommand ở 100 ký tự (`expected.length <= 100`), nên một mô tả không thể tự đẩy field
// qua ngưỡng. Trần thật của một lệnh ≈ số_sub × (tên + 3 + 100 + 1). Với 12 sub là ~1380 —
// đã vượt 1024. Tức `/config` chỉ an toàn nhờ mô tả hiện tại còn ngắn, không nhờ cấu trúc.
// Hệ quả: rút ngắn mô tả có tác dụng nhưng CÓ HẠN; qua một mức nào đó thì phải tách lệnh.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const GIOI_HAN_DISCORD = 1024;
const NGUONG = 900;

const CMD_DIR = path.join(__dirname, '..', 'src', 'commands');

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

/** Dựng ĐÚNG chuỗi mà help.js nối cho field danh sách sub. */
function chuoiSub(d) {
    const subs = (d.options || []).filter(o => o.type === 1);
    if (!subs.length) return null;
    return subs.map(s => `\`${s.name}\` — ${s.description}`).join('\n');
}

function doTatCa() {
    const ra = [];
    for (const f of duyet(CMD_DIR)) {
        let mod;
        try { mod = require(f); } catch { continue; }
        if (!mod?.data?.toJSON) continue;
        const d = mod.data.toJSON();
        const chuoi = chuoiSub(d);
        if (chuoi === null) continue;
        ra.push({ ten: d.name, soSub: (d.options || []).filter(o => o.type === 1).length, dai: chuoi.length });
    }
    return ra.sort((a, b) => b.dai - a.dai);
}

test('help: không lệnh nào vượt ngưỡng cảnh báo của field danh sách sub', () => {
    const ds = doTatCa();
    assert.ok(ds.length > 0, 'Không đọc được lệnh nào — test cần cập nhật theo cấu trúc mới.');

    const vuot = ds.filter(x => x.dai > NGUONG);
    const bang = vuot.map(x => `  /${x.ten}: ${x.dai}/${GIOI_HAN_DISCORD} ký tự (${x.soSub} sub)`).join('\n');

    assert.deepStrictEqual(vuot, [],
        `Trường "danh sách sub" của /help sắp vượt giới hạn ${GIOI_HAN_DISCORD} của Discord:\n${bang}\n` +
        'Cách sửa, theo thứ tự nên thử: (1) rút ngắn mô tả các subcommand — chúng chỉ cần đủ ' +
        'để chọn, không phải để giải thích; (2) tách lệnh thành hai; (3) cắt chuỗi trong ' +
        'help.js và ghi rõ "còn N mục nữa". KHÔNG nới ngưỡng lên sát 1024 — hết chỗ xoay xở ' +
        'thì lần vỡ sau sẽ là RangeError thật, và nó nổ ở /help chứ không ở lệnh vừa sửa.');
});

test('help: vẫn dựng field đó theo đúng cách test này giả định', () => {
    // Nếu help.js đổi cách nối (thêm emoji, đổi dấu gạch, bọc thêm ký tự) thì con số đo
    // được ở trên lệch với thực tế, và gate thành bù nhìn — xanh trong khi đã vỡ.
    const src = fs.readFileSync(path.join(CMD_DIR, 'utility', 'help.js'), 'utf8');
    assert.match(src, /subs\.map\(s => `\\`\$\{s\.name\}\\` — \$\{s\.description\}`\)\.join\('\\n'\)/,
        'help.js đã đổi cách dựng field danh sách sub — cập nhật hàm chuoiSub() trong test này ' +
        'cho khớp, nếu không phép đo mất ý nghĩa.');
});

test('help: báo cho biết lệnh nào đang sát ngưỡng nhất', () => {
    const ds = doTatCa();
    const top = ds[0];
    // Không assert gì cứng ở đây — mục đích là IN RA để người chạy test thấy khoảng cách
    // còn lại, thay vì chỉ biết "chưa vỡ".
    console.log(`      [help] sát ngưỡng nhất: /${top.ten} — ${top.dai}/${GIOI_HAN_DISCORD} ` +
        `(${Math.round(top.dai / GIOI_HAN_DISCORD * 100)}%), còn ${NGUONG - top.dai} ký tự trước ngưỡng ${NGUONG}`);
    assert.ok(top.dai <= GIOI_HAN_DISCORD, `/${top.ten} ĐÃ vượt giới hạn cứng của Discord.`);
});
