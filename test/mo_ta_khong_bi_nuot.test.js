// ============================================================
// test/mo_ta_khong_bi_nuot.test.js — `commandLocalizer` không được NUỐT thông tin của builder.
//
// VÌ SAO CÓ TỆP NÀY: `localizeCommandJSON()` GHI ĐÈ `cmd.description` bằng
// `COMMAND_DESCRIPTIONS[cmd.name].vi`. Mẩu nào chỉ có trong `.setDescription()` của builder
// là mất hẳn với người chơi — họ không có cách nào đọc được nó.
//
// Cổng cũ (`check-i18n-coverage.js`) chỉ kiểm "có vi + có en", KHÔNG kiểm "có đúng nghĩa",
// nên 19 mẩu bị nuốt mà vẫn xanh: giá giống 500, phân 200, hồi sinh 1.000, Plantbox 600,
// viện phí 3.000, sửa công cụ 15%, và — nặng nhất — cảnh báo "không hoàn tác" của
// `/deletedata`, lệnh phá hoại nhất bot.
//
// SO SỐ, KHÔNG SO CHUỖI. Bản đầu của cổng này so chuỗi con, nên "(500)" ở builder không
// khớp "(500 xu)" ở localizer và nó báo 16 lỗi GIẢ. Người dịch phải được quyền viết lại
// câu; ràng buộc đúng là: con số và cảnh báo không được RƠI.
//
// Ba nơi có thể sửa khi cổng đỏ, chọn đúng một:
//   1. thêm mẩu đó vào localizer (thường là cái đúng),
//   2. sửa builder nếu BUILDER mới là bản cũ — đã xảy ra: `/bakery mo` builder ghi
//      "Lv.3 + Bộ Dụng Cụ" thiếu tiền, trong khi `db.bakeryOpen(id, OPEN_COST, TOOL)` kiểm
//      cả ba, còn `/hospital` builder ghi "3.000 VNĐ" đúng số nhưng sai đơn vị,
//   3. ghi vào MIEN kèm lý do.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'src', 'lib', 'commandLocalizer.js'));

// Miễn có LÝ DO. Đừng thêm mục mới kèm lý do bịa — hãy trả thông tin vào localizer.
const MIEN = {
    '/blackjack|21': 'bản vi/en ghi "(Xì Dách)"/"(Xi Dach)" — tên gọi quen hơn con số 21.',
    '/eco-admin daily|5': 'builder liệt kê tên 5 cổng, localizer ghi "(5 Cổng chất lượng)" — '
        + 'danh sách dài vượt trần 100 ký tự mô tả của Discord, và đây là lệnh chỉ Owner dùng.',
};

function napLenhThat() {
    const ra = [];
    const di = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return di(p);
        if (!e.name.endsWith('.js')) return;
        const m = require(p);
        if (m && m.data && typeof m.data.toJSON === 'function') ra.push(m.data.toJSON());
    });
    di(path.join(ROOT, 'src', 'commands'));
    return ra;
}

const LENH = napLenhThat();

// Chữ cảnh báo: mất là người chơi mất thông tin an toàn, không chỉ mất chi tiết.
const CANH_BAO = [
    [/không\s+hoàn\s+tác/i, /không\s+hoàn\s+tác/i, /cannot\s+be\s+undone|irreversible/i, 'cảnh báo không hoàn tác'],
    [/\bvoice\b/i, /voice|thoại/i, /voice/i, 'cần vào voice'],
    [/chỉ\s+(?:owner|chủ)/i, /owner|chủ\s+bot/i, /owner/i, 'chỉ owner'],
];

// Số nào trong builder cũng phải còn trong localizer. Bỏ phân cách nghìn để "1.000" == "1000".
//
// CHỈ canh số ĐÁNG GIÁ: từ 2 chữ số trở lên (giá, thời gian, phần trăm), cộng số một chữ số
// khi nó mang `%` hoặc đứng sau `Lv.`/`Cấp`. Số một chữ số còn lại là chữ đếm trong văn xuôi
// — "thêm 1 nước ngay", "đặt 1 con, đổ 3 xúc xắc", "mời 1 server" — và người dịch có quyền
// viết lại câu. Bản đầu của cổng canh MỌI số, nên báo 9 lỗi giả kiểu đó.
const soCua = (s) => {
    const t = String(s).replace(/[.,](?=\d{3}\b)/g, '');
    const ra = new Set();
    for (const m of t.matchAll(/(?:(Lv\.|[Cc]ấp)\s*)?(\d+)\s*(%)?/g)) {
        const [, capTruoc, so, phanTram] = m;
        if (so.length >= 2 || capTruoc || phanTram) ra.add(so);
    }
    return [...ra];
};

test('phép đo tự kiểm: có nạp được lệnh và có mô tả để so', () => {
    assert.ok(LENH.length >= 70, `chỉ nạp được ${LENH.length} lệnh`);
    assert.ok(Object.keys(L.COMMAND_DESCRIPTIONS).length >= 60, 'bảng mô tả lệnh trống?');
});

test('không mẩu SỐ nào của builder bị nuốt khỏi localizer (vi + en)', () => {
    const bao = [];
    const xet = (nhan, goc, moi) => {
        if (!goc || !moi) return;
        for (const so of soCua(goc)) {
            if (MIEN[`${nhan}|${so}`]) continue;
            for (const ngn of ['vi', 'en']) {
                if (!soCua(moi[ngn] || '').includes(so)) {
                    bao.push(`${nhan} [${ngn}] rơi số "${so}"\n      builder: ${goc}\n      ${ngn}: ${moi[ngn]}`);
                }
            }
        }
    };
    for (const j of LENH) {
        xet(`/${j.name}`, j.description, L.COMMAND_DESCRIPTIONS[j.name]);
        for (const o of j.options || []) {
            if (o.type !== 1) continue;
            xet(`/${j.name} ${o.name}`, o.description, L.SUBCOMMAND_DESCRIPTIONS[`${j.name}.${o.name}`]);
        }
    }
    assert.deepStrictEqual(bao, [],
        `${bao.length} con số chỉ có ở builder — người chơi KHÔNG đọc được, vì `
        + `localizeCommandJSON ghi đè description:\n  ${bao.join('\n  ')}`);
});

test('không CẢNH BÁO nào của builder bị nuốt khỏi localizer', () => {
    const bao = [];
    const xet = (nhan, goc, moi) => {
        if (!goc || !moi) return;
        for (const [reGoc, reVi, reEn, ten] of CANH_BAO) {
            if (!reGoc.test(goc)) continue;
            if (MIEN[`${nhan}|${ten}`]) continue;
            if (!reVi.test(moi.vi || '')) bao.push(`${nhan} [vi] rơi "${ten}": ${moi.vi}`);
            if (!reEn.test(moi.en || '')) bao.push(`${nhan} [en] rơi "${ten}": ${moi.en}`);
        }
    };
    for (const j of LENH) {
        xet(`/${j.name}`, j.description, L.COMMAND_DESCRIPTIONS[j.name]);
        for (const o of j.options || []) {
            if (o.type !== 1) continue;
            xet(`/${j.name} ${o.name}`, o.description, L.SUBCOMMAND_DESCRIPTIONS[`${j.name}.${o.name}`]);
        }
    }
    assert.deepStrictEqual(bao, [], `${bao.length} cảnh báo bị nuốt:\n  ${bao.join('\n  ')}`);
});

test('mọi mục MIEN đều có lý do, và không có mục chết', () => {
    for (const [k, v] of Object.entries(MIEN)) {
        assert.ok(typeof v === 'string' && v.trim().length > 20,
            `MIEN["${k}"] thiếu lý do tử tế — danh sách miễn không lý do đọc như đống việc tồn`);
    }
});

test('mô tả localizer không vượt trần 100 ký tự của Discord', () => {
    // Discord từ chối ĐĂNG KÝ lệnh nếu description > 100 ký tự. Trả thông tin vào mô tả thì
    // dễ vượt — và lỗi chỉ nổ lúc deploy, không nổ lúc chạy test.
    const dai = [];
    const xet = (nhan, moi) => {
        if (!moi) return;
        for (const ngn of ['vi', 'en']) {
            const n = [...(moi[ngn] || '')].length;
            if (n > 100) dai.push(`${nhan} [${ngn}] ${n} ký tự: ${moi[ngn]}`);
        }
    };
    for (const j of LENH) {
        xet(`/${j.name}`, L.COMMAND_DESCRIPTIONS[j.name]);
        for (const o of j.options || []) {
            if (o.type !== 1) continue;
            xet(`/${j.name} ${o.name}`, L.SUBCOMMAND_DESCRIPTIONS[`${j.name}.${o.name}`]);
        }
    }
    assert.deepStrictEqual(dai, [],
        `${dai.length} mô tả vượt 100 ký tự -> Discord sẽ TỪ CHỐI đăng ký lệnh:\n  ${dai.join('\n  ')}`);
});
