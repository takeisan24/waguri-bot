// ============================================================
// test/localizer_khong_khoa_chet.test.js — `commandLocalizer.js` không được chứa khoá CHẾT,
// và mô tả lệnh không được dạy người chơi gõ subcommand không tồn tại.
//
// CHUYỆN ĐÃ XẢY RA: lần chuẩn hoá 72 lệnh (v2.6.0) đổi tên LỆNH sang tiếng Anh nhưng để
// nguyên tên SUBCOMMAND. Hai hậu quả, cả hai đều im lặng:
//
//   1. 135/435 khoá localizer thành khoá chết (32%) — `tiembanh.*`, `vay.*`, `clan.*`,
//      9 subcommand chợ P2P/đấu giá đã gỡ... Không ai tra tới, nhưng đọc như tài liệu
//      sống nên lần sửa sau dễ sửa vào khoá chết rồi tưởng đã xong.
//   2. Mô tả `/help` viết theo tên tiếng Anh mà sub thật vẫn tiếng Việt: `/bakery` chỉ
//      người chơi gõ `view · open · stock · collect · hire · fire · decor · upgrade ·
//      orders · deliver` trong khi sub thật là `xem · mo · nhapnl · thu · ...`. **15 tên
//      sai × 2 ngôn ngữ = 30 chỗ.** `scripts/check-command-refs.js` chỉ kiểm tên LỆNH nên
//      nhánh này chưa ai canh.
//
// CÁCH ĐO khoá chết: GHI LẠI mọi lượt tra thật (Proxy trên 4 bảng, nạp lại mã nguồn trong
// một module riêng vì các hàm tham chiếu biến CỤC BỘ nên Proxy gắn vào exports không bắt
// được gì), chạy trên toàn bộ lệnh thật, rồi lấy hiệu. Không suy luận từ tên.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const LOC = path.join(ROOT, 'src', 'lib', 'commandLocalizer.js');
const BANG = ['COMMAND_DESCRIPTIONS', 'SUBCOMMAND_DESCRIPTIONS', 'OPTION_DESCRIPTIONS', 'CHOICE_LOCALIZATIONS'];

// Tầng dự phòng `OPTION_DESCRIPTIONS[opt.name]` (khoá TRẦN, không có dấu chấm): cố ý giữ,
// vì option mới thêm chưa có khoá riêng vẫn rơi vào đây. Chỉ miễn khi còn option cùng tên.
const MIEN_TRAN = true;

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

function ghiLuotTra() {
    let src = fs.readFileSync(LOC, 'utf8');
    for (const b of BANG) src = src.replace(`const ${b} = {`, `let ${b} = {`);
    const chen = BANG.map((b) => `
${b} = new Proxy(${b}, {
    get(t, k) { if (typeof k === 'string') global.__daTra.${b}.add(k); return t[k]; },
    has(t, k) { if (typeof k === 'string') global.__daTra.${b}.add(k); return k in t; },
});`).join('\n');
    src = src.replace('module.exports = {', `${chen}\nmodule.exports = {`);

    global.__daTra = {};
    for (const b of BANG) global.__daTra[b] = new Set();

    const m = new Module('localizer-bay');
    m.filename = LOC;
    m.paths = Module._nodeModulePaths(path.dirname(LOC));
    m._compile(src, LOC);
    const L = m.exports;

    for (const j of LENH) {
        L.localizeCommandJSON(JSON.parse(JSON.stringify(j)));
        for (const loc of ['vi', 'en']) {
            L.moTaLenh(j.name, loc, j.description);
            for (const o of j.options || []) {
                if (o.type === 1) L.moTaSub(j.name, o.name, loc, o.description);
                if (o.type === 2) for (const s of o.options || []) L.moTaSub(j.name, s.name, loc, s.description);
            }
        }
    }
    return global.__daTra;
}

test('phép đo tự kiểm: có nạp được lệnh thật và có ghi được lượt tra', () => {
    assert.ok(LENH.length >= 70, `chỉ nạp được ${LENH.length} lệnh — phép đo dưới đây vô nghĩa`);
    const tra = ghiLuotTra();
    assert.ok(tra.COMMAND_DESCRIPTIONS.size >= 70,
        `chỉ ghi được ${tra.COMMAND_DESCRIPTIONS.size} lượt tra tên lệnh — Proxy không bắt được gì, `
        + 'nên "0 khoá chết" sẽ là kết luận SAI');
});

test('commandLocalizer không còn khoá CHẾT', () => {
    const tra = ghiLuotTra();
    const That = require(LOC);
    const tenOption = new Set();
    for (const j of LENH) {
        const quet = (os) => (os || []).forEach((o) => {
            if (o.type === 1 || o.type === 2) return quet(o.options);
            tenOption.add(o.name);
        });
        quet(j.options);
    }

    const chet = [];
    for (const b of BANG) {
        for (const k of Object.keys(That[b] || {})) {
            if (tra[b].has(k)) continue;
            // khoá trần trong OPTION_DESCRIPTIONS = tầng dự phòng, miễn nếu còn option cùng tên
            if (MIEN_TRAN && b === 'OPTION_DESCRIPTIONS' && !k.includes('.') && tenOption.has(k)) continue;
            chet.push(`${b}:${k}`);
        }
    }
    assert.deepStrictEqual(chet, [],
        `${chet.length} khoá không ai tra tới — đọc như tài liệu sống nên lần sửa sau dễ sửa vào `
        + `đúng khoá chết rồi tưởng đã xong:\n  ${chet.join('\n  ')}`);
});

test('mô tả lệnh không nhắc subcommand không tồn tại', () => {
    const subThat = {};
    for (const j of LENH) {
        const s = new Set();
        for (const o of j.options || []) {
            if (o.type === 1) s.add(o.name);
            if (o.type === 2) { s.add(o.name); for (const x of o.options || []) s.add(x.name); }
            if (o.choices) for (const c of o.choices) s.add(String(c.value));
        }
        subThat[j.name] = s;
    }

    // CHỈ nhận danh sách phân tách bằng `·`. Dấu `/` là cặp từ trong văn xuôi —
    // `/coinflip` ghi "(heads/tails)" để tả NHÃN choice ("Ngửa / Heads"), không phải tên sub.
    const NGOAC = /\(([a-z][a-z0-9_-]*(?:\s*·\s*[a-z][a-z0-9_-]*)+)\)/g;
    const L = require(LOC);
    const bao = [];
    const xet = (nguon, ten, chuoi) => {
        if (typeof chuoi !== 'string' || !subThat[ten]) return;
        for (const m of chuoi.matchAll(NGOAC)) {
            for (const tok of m[1].split(/\s*·\s*/)) {
                if (!subThat[ten].has(tok)) {
                    bao.push(`${nguon} /${ten} -> "${tok}" (sub thật: ${[...subThat[ten]].join(' ')})`);
                }
            }
        }
    };
    for (const ngn of ['vi', 'en']) {
        const Lc = require(path.join(ROOT, 'src', 'locales', `${ngn}.json`));
        for (const [ten, s] of Object.entries(Lc.commands.help.commands || {})) xet(`${ngn}.json`, ten, s);
    }
    for (const [ten, v] of Object.entries(L.COMMAND_DESCRIPTIONS || {})) {
        xet('localizer.vi', ten, v.vi);
        xet('localizer.en', ten, v.en);
    }
    for (const j of LENH) xet('builder', j.name, j.description);

    assert.deepStrictEqual(bao, [],
        `${bao.length} chỗ chỉ người chơi gõ tên không tồn tại:\n  ${bao.join('\n  ')}`);
});
