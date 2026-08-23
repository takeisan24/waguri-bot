// ============================================================
// test/tien_kiem_ket_qua.test.js — trừ tiền thì PHẢI đọc kết quả, và tin nhắn phải nói
// số ĐÃ trừ chứ không phải số ĐỊNH trừ.
//
// VÌ SAO CÓ: dự án có HAI hàm trừ tiền, hành xử ngược nhau, và dùng nhầm là ra lỗ hổng:
//
//   increment_balance  — chỉ ví · không đủ thì trừ ĐÚNG 0 ĐỒNG · trả NULL
//   charge_assets      — ví trước rồi bank · trừ đúng phần đang có · trả SỐ ĐÃ TRỪ
//
// Ngày 2026-08-24 tìm ra `/work` gọi hàm thứ nhất cho một khoản PHẠT, rồi bỏ giá trị trả
// về. Hệ quả đã chứng minh trên prod: gửi hết tiền vào ngân hàng → ví = 0 → mọi lần làm
// việc thất bại đều bị chặn, không mất gì, KHÔNG để lại dòng nào trong sổ cái, mà tin nhắn
// vẫn báo "cậu mất X xu".
//
// 13 trên 14 chỗ trừ tiền khác đều viết `if (!await db.addMoney(...))`. `/work` là ngoại lệ
// duy nhất — có lẽ vì nó dùng MỘT lời gọi cho cả cộng lẫn trừ nên khuôn đó không vừa.
//
// Cổng này chốt lại con số 14/14, và soi luôn lớp lỗi "tin nhắn nói số định làm".
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function duyet(d, o = []) {
    if (!fs.existsSync(d)) return o;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) duyet(p, o); else if (e.name.endsWith('.js')) o.push(p);
    }
    return o;
}
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');
const FILES = duyet(path.join(ROOT, 'src')).filter(f => rel(f) !== 'src/database.js');

test('mọi lời gọi addMoney với số ÂM đều đọc kết quả', () => {
    const xau = [];
    for (const f of FILES) {
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        s.split('\n').forEach((d, i) => {
            const m = d.match(/db\.addMoney\(\s*[^,]+,\s*([^,]+?)\s*,/);
            if (!m) return;
            const soTien = m[1].trim();

            // Khoản này CÓ THỂ âm không?
            //
            // Bản đầu đoán theo TÊN BIẾN (`loss`/`fine`/`cost`) và báo oan ngay:
            // `cosmetic.js:138` là dòng HOÀN TIỀN `+badgeConf.cost` — cùng tên biến, ngược dấu.
            // Tên biến không nói lên dấu. Chỉ hai thứ nói lên: dấu trừ ngay tại chỗ gọi, hoặc
            // biến đó được gán một giá trị âm ở đâu đó trong chính file này.
            const amRoRang = soTien.startsWith('-');

            // Chỉ dò "biến này có bị gán giá trị âm không" khi token là một ĐỊNH DANH THUẦN.
            //
            // Bản trước không lọc, nên với `db.addMoney(uid, rand(config.CHAT.MIN, ...), ...)`
            // phép cắt theo dấu phẩy trả về `rand(config` — rồi nhét dấu ngoặc đó vào
            // `new RegExp` và test TỰ NỔ. Một cổng gác tự nổ trông y hệt một cổng bắt được lỗi.
            const bien = soTien.replace(/^[-!]/, '').split(/[.[]/)[0];
            const laDinhDanh = /^[A-Za-z_$][\w$]*$/.test(bien);
            const ganAm = laDinhDanh && new RegExp(`\\b${bien}\\s*=\\s*-`).test(s);
            if (!amRoRang && !ganAm) return;
            // Có đọc kết quả không?
            //
            // Phải nhận ĐỦ MỌI DẠNG đang dùng trong mã, không chỉ dạng `if (!await ...)`:
            //   if (!await db.addMoney(...))            — pig.js, plant.js, coinflip...
            //   if (x > 0 && !await db.addMoney(...))   — gather.js:194
            //   const ok = await db.addMoney(...)       — eco-admin.js
            // Bản đầu chỉ dò `if (\s*!?await` nên báo oan 3 chỗ vốn kiểm đúng bằng `&& !await`.
            const coDoc = /!\s*await\s+db\.addMoney|(?:const|let|var)\s+\w+\s*=\s*await\s+db\.addMoney|\breturn\s+await\s+db\.addMoney/.test(d);
            if (!coDoc) xau.push(`${rel(f)}:${i + 1}  ${d.trim().slice(0, 72)}`);
        });
    }
    assert.deepStrictEqual(xau, [],
        'Trừ tiền mà bỏ kết quả. `increment_balance` chặn ví âm bằng cách trừ ĐÚNG 0 ĐỒNG rồi '
        + 'trả NULL — bỏ kết quả nghĩa là không biết khoản phạt có ăn hay không, và tin nhắn '
        + 'sẽ báo một con số không có thật.');
});

test('/work không còn báo số tiền mất khi thực tế không mất gì', () => {
    const s = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'work.js'), 'utf8'));

    const i = s.indexOf('db.addMoney(');
    assert.ok(i > -1, 'Không thấy lời gọi addMoney trong work.js — test cần cập nhật.');
    const dong = s.slice(s.lastIndexOf('\n', i) + 1, s.indexOf('\n', i));
    assert.match(dong, /(?:const|let)\s+\w+\s*=\s*await\s+db\.addMoney/,
        'work.js phải GIỮ kết quả của addMoney để biết khoản lỗ có thật sự bị trừ hay không.');

    // Nhánh phân biệt phải THẬT SỰ suy từ kết quả, không phải một hằng số.
    //
    // Kiểm ngược lần đầu cho thấy đổi `const loBiChan = earnedMoney < 0 && !daTru` thành
    // `const loBiChan = false` vẫn XANH — vì cổng chỉ dò tên biến có tồn tại. Cổng phải
    // soi DÒNG CHẢY: biến điều kiện phải được tính từ giá trị mà addMoney trả về.
    const mCo = s.match(/const\s+(\w+)\s*=\s*([^;\n]+);/g) || [];
    const dongDk = mCo.find(x => /loBiChan|khongMat|biChan/.test(x));
    assert.ok(dongDk, 'Mất biến đánh dấu "lỗ bị chặn".');
    assert.match(dongDk, /daTru|!\s*\w*[Tt]ru/,
        'Biến "lỗ bị chặn" phải suy từ kết quả của addMoney, không được gán hằng số.');

    // Và nhánh đó phải đổi TIN NHẮN, không chỉ tồn tại.
    assert.match(s, /if\s*\(\s*loBiChan\s*\)[\s\S]{0,200}?resultMessage\s*=/,
        'Nhánh lỗ-bị-chặn phải thay tin nhắn. Bắt được điều kiện mà vẫn in câu cũ thì người '
        + 'chơi vẫn đọc một con số không có thật.');
});

test('/rob hiện số ĐÃ phạt, không phải số ĐỊNH phạt', () => {
    const s = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'rob.js'), 'utf8'));

    const i = s.indexOf('db.chargeAssets(');
    assert.ok(i > -1, 'Không thấy chargeAssets trong rob.js.');
    const dong = s.slice(s.lastIndexOf('\n', i) + 1, s.indexOf('\n', i));
    // Nhận cả dạng tam nguyên `const x = dieuKien ? await db.chargeAssets(...) : 0;`
    // Bản đầu đòi `= await` liền kề nên báo oan chính bản vá vừa viết.
    const mBien = dong.match(/(?:const|let)\s+(\w+)\s*=[^;]*await\s+db\.chargeAssets/);
    assert.ok(mBien,
        '`charge_assets` TRẢ VỀ số thật sự đã trừ (nó cắt theo tài sản đang có). Bỏ giá trị đó '
        + 'nghĩa là người có 100 xu bị phạt 500 sẽ đọc "bị phạt 500" trong khi chỉ mất 100.');

    // Bắt được rồi thì phải HIỂN THỊ nó.
    //
    // Kiểm ngược lần đầu: đổi `fmt(phatThat)` về `fmt(fine)` vẫn XANH, vì cổng chỉ soi dòng
    // bắt giá trị. Bắt mà không dùng thì y hệt không bắt.
    const ten = mBien[1];
    assert.match(s, new RegExp(`fine\\s*:\\s*fmt\\(\\s*${ten}\\b`),
        `Tin nhắn phải hiển thị \`${ten}\` (số ĐÃ trừ), không phải \`fine\` (số ĐỊNH trừ).`);
});

test('police trả về số ĐÃ phạt cho nơi hiển thị', () => {
    const s = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'police.js'), 'utf8'));

    const mBien = s.match(/(?:const|let)\s+(\w+)\s*=[^;]*await\s+db\.chargeAssets/);
    assert.ok(mBien, 'police.js phải giữ kết quả của chargeAssets.');
    assert.match(s, new RegExp(`return\\s*\\{[^}]*fine\\s*:\\s*${mBien[1]}\\b`),
        'applyPolice phải trả về số ĐÃ phạt. Trả `fine` (số định phạt) thì nơi hiển thị báo '
        + 'một con số không có thật với người ít tiền — đúng lỗi vừa vá ở /rob, chỉ khác chỗ.');
});

test('hình phạt dùng charge_assets, giao dịch thường dùng increment_balance', () => {
    // Ghi lại ranh giới để lần sau ai đó không chọn nhầm hàm.
    const rob = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'rob.js'), 'utf8'));
    const police = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'police.js'), 'utf8'));

    for (const [ten, s] of [['rob', rob], ['police', police]]) {
        assert.match(s, /db\.chargeAssets\(/,
            `${ten} là hình phạt — phải dùng chargeAssets (trừ ví rồi bank, cắt theo tài sản có), `
            + 'không dùng addMoney (chỉ ví, không đủ thì trừ 0).');
    }
});
