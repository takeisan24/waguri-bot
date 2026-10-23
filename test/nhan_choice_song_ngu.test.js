// ============================================================
// test/nhan_choice_song_ngu.test.js — mọi `choice` phải có NHÃN hai ngôn ngữ, và `value`
// phải giữ nguyên vì nó là khoá DỮ LIỆU.
//
// CHUYỆN ĐÃ XẢY RA: `CHOICE_LOCALIZATIONS` chỉ phủ 33/112 giá trị. 79 cái còn lại hiện nhãn
// tiếng Việt cho MỌI ngôn ngữ ("Tài sản", "Cấp độ", "Trong server này"), hoặc nhồi hai thứ
// tiếng vào một dòng ("Ngửa / Heads", "🍐 Bầu / Gourd", "Thắc mắc chung (General)").
// `check-i18n-coverage` không thấy, vì nó so KHOÁ giữa vi.json và en.json — còn nhãn choice
// nằm trong commandLocalizer, không nằm ở hai tệp đó.
//
// RANH GIỚI QUAN TRỌNG — `value` KHÔNG được đổi, dù đợt này đổi tên mọi thứ khác sang tiếng
// Anh. Giá trị choice là khoá DỮ LIỆU:
//   · 21 giá trị trùng `items.id` trong seed `0043_seed_catalog.sql`
//   · `pet.adopt.species` -> cột `pets.species` (bảng `pets`, migration 0013)
//   · `bakery.hire.staff` / `bakery.decor.item` -> JSONB `bakeries.staff` / `bakeries.decor`
// Đổi chúng là phải migrate dữ liệu và làm vỡ mọi dòng đã lưu, không phải đổi giao diện.
//
// PHÉP ĐO TỪNG SAI: tôi báo "CHOICE_LOCALIZATIONS đang 0 khoá" vì đọc qua `require()` —
// bảng này KHÔNG nằm trong `module.exports`, nên `Object.keys(undefined -> {})` ra 0. Phải
// đọc từ MÃ NGUỒN. Phép kiểm dưới đây tự canh chính điều đó.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const L = require('../src/lib/commandLocalizer');

function khoaChoice() {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'commandLocalizer.js'), 'utf8');
    const i = s.indexOf('const CHOICE_LOCALIZATIONS = {');
    assert.ok(i >= 0, 'không thấy bảng CHOICE_LOCALIZATIONS');
    const khoi = s.slice(i, s.indexOf('\n};', i));
    return [...khoi.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
}

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

function moiChoice() {
    const ra = [];
    for (const j of LENH) {
        const quet = (os, duong) => (os || []).forEach((o) => {
            if (o.type === 1 || o.type === 2) return quet(o.options, `${duong}.${o.name}`);
            for (const c of o.choices || []) ra.push({ duong: `${duong}.${o.name}`, value: String(c.value), ten: c.name });
        });
        quet(j.options, `/${j.name}`);
    }
    return ra;
}

test('phép đo tự kiểm: đọc được bảng TỪ MÃ NGUỒN, không qua require', () => {
    assert.strictEqual(L.CHOICE_LOCALIZATIONS, undefined,
        'bảng nay được export — sửa phép đo này để đọc qua require, đừng để nó đọc mã nguồn nữa');
    assert.ok(khoaChoice().length >= 100,
        `chỉ đọc được ${khoaChoice().length} khoá từ mã nguồn — phép kiểm dưới vô nghĩa`);
    assert.ok(moiChoice().length >= 100, `chỉ thấy ${moiChoice().length} choice trên bề mặt`);
});

test('mọi giá trị choice đều có nhãn ở CẢ hai ngôn ngữ', () => {
    const ks = new Set(khoaChoice());
    const thieu = [...new Set(moiChoice().filter((c) => !ks.has(c.value))
        .map((c) => `${c.duong}=${c.value} (nhãn: ${c.ten})`))];
    assert.deepStrictEqual(thieu, [],
        `${thieu.length} choice hiện nhãn tiếng Việt cho mọi ngôn ngữ:\n  ${thieu.join('\n  ')}`);
});

test('nhãn vi và en phải KHÁC nhau, và không nhồi hai thứ tiếng vào một dòng', () => {
    const xau = [];
    for (const j of LENH) {
        const ban = JSON.parse(JSON.stringify(j));
        L.localizeCommandJSON(ban);
        const quet = (os, duong) => (os || []).forEach((o) => {
            if (o.type === 1 || o.type === 2) return quet(o.options, `${duong}.${o.name}`);
            for (const c of o.choices || []) {
                const nl = c.name_localizations || {};
                if (!nl.vi || !nl['en-US']) { xau.push(`${duong}.${o.name}=${c.value}: thiếu bản dịch`); continue; }
                // Nhãn nhồi "Ngửa / Heads" là dấu hiệu CHƯA localize đúng: cả hai locale đọc
                // một chuỗi lai. Chỉ bắt khi hai bản y hệt nhau — đó mới là chưa tách.
                if (nl.vi === nl['en-US'] && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(nl.vi)) {
                    xau.push(`${duong}.${o.name}=${c.value}: vi và en y hệt nhau và có dấu tiếng Việt ("${nl.vi}")`);
                }
            }
        });
        quet(ban.options, `/${ban.name}`);
    }
    assert.deepStrictEqual(xau, [], `${xau.length} nhãn chưa tách ngôn ngữ:\n  ${xau.join('\n  ')}`);
});

test('nhãn choice không vượt trần 100 ký tự của Discord', () => {
    // Vượt trần thì Discord TỪ CHỐI đăng ký lệnh — lỗi chỉ nổ lúc deploy, không nổ lúc test.
    const dai = [];
    for (const j of LENH) {
        const ban = JSON.parse(JSON.stringify(j));
        L.localizeCommandJSON(ban);
        const quet = (os, duong) => (os || []).forEach((o) => {
            if (o.type === 1 || o.type === 2) return quet(o.options, `${duong}.${o.name}`);
            for (const c of o.choices || []) {
                for (const [loc, s] of Object.entries(c.name_localizations || { x: c.name })) {
                    const n = [...String(s)].length;
                    if (n > 100) dai.push(`${duong}.${o.name}=${c.value} [${loc}] ${n} ký tự`);
                }
            }
        });
        quet(ban.options, `/${ban.name}`);
    }
    assert.deepStrictEqual(dai, [], `vượt trần:\n  ${dai.join('\n  ')}`);
});

test('GIÁ TRỊ choice là khoá dữ liệu — phải khớp seed/DB, không được "dịch"', () => {
    // Khoá chặt nhất: giá trị nào trùng `items.id` trong seed thì phải GIỮ NGUYÊN dạng đó.
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '0043_seed_catalog.sql'), 'utf8');
    const ids = new Set([...sql.matchAll(/^ {2}\('([a-z0-9_]+)'/gm)].map((m) => m[1]));
    assert.ok(ids.size > 40, `chỉ đọc được ${ids.size} id từ seed — phép kiểm vô nghĩa`);

    // ít nhất một nhóm choice phải còn trỏ vào items.id; nếu 0 thì có ai đã "dịch" chúng
    const trung = moiChoice().filter((c) => ids.has(c.value));
    assert.ok(trung.length >= 15,
        `chỉ còn ${trung.length} choice trỏ vào items.id (trước đây 21) — có thể giá trị vừa bị `
        + 'đổi sang tiếng Anh, mà đó là khoá DỮ LIỆU: đổi là phải migrate và làm vỡ dòng đã lưu');

    // species thú cưng phải khớp hàm kiểm trong DB
    const sql142 = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations',
        '0142_pet_rarity_ascend_hatch.sql'), 'utf8');
    const spec = moiChoice().filter((c) => c.duong === '/pet.adopt.species').map((c) => c.value);
    assert.ok(spec.length >= 6, `chỉ thấy ${spec.length} loài thú cưng`);
    for (const s of spec) {
        assert.ok(sql142.includes(`'${s}'`),
            `species "${s}" không có trong 0142 — \`pet_species_adoptable\` sẽ từ chối, `
            + 'người chơi không nhận nuôi được');
    }
});
