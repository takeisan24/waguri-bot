// ============================================================
// test/builder_noidung.test.js — Nội dung mà builder ĐĂNG LÊN server phải nói đúng
// tên lệnh có thật.
//
// VÌ SAO CÓ: `scripts/build-support-server.js` tự đăng nội dung cho 14 kênh của server
// support, trong đó có kênh hướng dẫn — thứ người mới đọc đầu tiên. Ngày 21-08-2026 quét
// ra 4 trên 28 lệnh được nhắc là SAI:
//
//     /shop  /buy  /sell   -> thật ra là `/store list|buy|sell`
//     /marry               -> thật ra là `/couple marry`
//
// Bốn cái đó là alias PREFIX (`w!shop`), bị viết như lệnh gạch chéo. Người mới làm theo,
// mở bảng gợi ý của Discord, và không thấy đâu cả — rồi kết luận bot hỏng.
//
// Kiểu lạc hậu này tái diễn rất dễ: đổi tên lệnh hoặc gộp lệnh con là xong việc, chẳng ai
// nhớ nội dung tĩnh trong script cũng đang nhắc tên cũ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CMD_DIR = path.join(ROOT, 'src', 'commands');

function duyet(d, o = []) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) duyet(p, o); else if (e.name.endsWith('.js')) o.push(p);
    }
    return o;
}

/** { tenLenh -> Set(sub) } của mọi lệnh slash có thật. */
function lenhThat() {
    const ra = {};
    for (const f of duyet(CMD_DIR)) {
        let m; try { m = require(f); } catch { continue; }
        if (!m?.data?.toJSON) continue;
        const j = m.data.toJSON();
        if (!j.name) continue;
        ra[j.name] = new Set((j.options || []).filter(o => o.type === 1).map(o => o.name));
    }
    return ra;
}

// BỎ CHÚ THÍCH trước khi quét. Không bỏ thì gate đỏ vì chính dòng chú thích giải thích
// lỗi này — nó phải nhắc lại `/shop` `/buy` để nói rõ cái gì đã sai. Một cổng cấm người
// ta viết tài liệu về lỗi mà cổng đó gác là cổng đặt sai chỗ.
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = boCmt(fs.readFileSync(path.join(ROOT, 'scripts', 'build-support-server.js'), 'utf8'));

test('builder: mọi lệnh nhắc trong nội dung đều tồn tại dạng slash', () => {
    const that = lenhThat();
    assert.ok(Object.keys(that).length > 50, 'Không đọc được lệnh — test cần cập nhật.');

    // Chỉ bắt dạng `/lenh` hoặc `/lenh sub` nằm trong backtick — URL như WEB/commands
    // không có backtick+gạch chéo mở đầu nên không dính.
    const nhac = [...src.matchAll(/`\/([a-z][a-z0-9-]*)(?:\s+([a-z][a-z0-9-]*))?`/g)]
        .map(m => ({ lenh: m[1], sub: m[2] || null }));
    assert.ok(nhac.length > 15, `Chỉ trích được ${nhac.length} lệnh — cách viết nội dung đã đổi.`);

    const sai = [];
    for (const n of nhac) {
        if (!that[n.lenh]) { sai.push(`/${n.lenh} — không có lệnh này`); continue; }
        // Lệnh CÓ subcommand thì nhắc trần tên lệnh vẫn ổn (vd `/clan`, `/market`):
        // Discord vẫn gợi ý ra danh sách sub. Chỉ sai khi nhắc sub KHÔNG tồn tại.
        if (n.sub && !that[n.lenh].has(n.sub)) {
            sai.push(`/${n.lenh} ${n.sub} — "${n.sub}" không phải sub của /${n.lenh} (có: ${[...that[n.lenh]].join(', ') || 'không sub nào'})`);
        }
    }

    assert.deepStrictEqual([...new Set(sai)], [],
        'Nội dung builder nhắc lệnh không tồn tại. Người mới gõ vào bảng gợi ý sẽ không ' +
        'thấy đâu. Nếu định nói tới tên gõ tắt thì viết dạng `w!ten`, đừng viết `/ten`.');
});

test('builder: mọi tên gõ tắt `w!` được nhắc đều định tuyến được thật', () => {
    const { PREFIX_ALIASES, tenTatCua } = require('../src/lib/prefixTen');
    const that = lenhThat();

    const nhac = [...new Set([...src.matchAll(/`w!([a-z][a-z0-9-]*)/g)].map(m => m[1]))];
    const sai = nhac.filter(t => !PREFIX_ALIASES[t] && !that[t] && !tenTatCua(t).length
        // tên do handler riêng phục vụ (pig/plant/loto/bingo) — tra ngược qua lệnh chủ
        && !Object.keys(that).some(c => tenTatCua(c).includes(t)));

    assert.deepStrictEqual(sai, [],
        'Nội dung nhắc tên gõ tắt không dẫn tới đâu: ' + sai.join(', '));
});
