// ============================================================
// test/thuong_va_hoi_phuc_noi_that.test.js — hai lệnh CÓ LƯU LƯỢNG THẬT không được khoe
// thứ chưa xảy ra. Kèm cổng canh chính CÔNG CỤ QUÉT.
//
// VÌ SAO CÓ. Sau khi đóng 5 lô bằng cách đọc từng dòng, tôi chạy `scripts/quet-truoc-khi-doc.js`
// lên chính 5 lô đó và nó tìm ra những chỗ tôi đã đọc qua mà bỏ sót:
//
//   · `nghingoi.js` — đốt cooldown 6 tiếng, rồi `setEnergy` KHÔNG kiểm, rồi báo "đã hồi
//     đầy năng lượng". 7 người đã dùng.
//   · `work.js`     — thưởng lên cấp `addMoney` KHÔNG kiểm, rồi dòng ngay dưới khoe đúng
//     con số đó. `/work` là lệnh đông nhất bot: 1.339 lượt / 19 người / 30 ngày.
//
// SẮC THÁI ĐÃ KIỂM Ở `nghingoi` — đừng "sửa" bằng cách đảo thứ tự: `claimCooldown` FAIL-OPEN
// (database.js: DB lỗi -> trả false = cho qua, dòng cooldown không hề được ghi). Nên khi DB
// sập hẳn, người dùng KHÔNG bị khoá 6 tiếng, chỉ nhận một câu nói sai. Đảo thứ tự sẽ bỏ mất
// cổng nguyên tử chống spam để đổi lấy một ca rất hẹp — lỗ hơn.
//
// PHẦN CUỐI CANH CÔNG CỤ. Bản đầu của máy quét chỉ nhận đúng dạng `const x = await db.…` nên
// cho **8 dương tính giả trên 14 ứng viên (~57%)** — tôi suýt đi vá những chỗ vốn đã đúng.
// Một cái cân lệch tệ hơn không có cân, vì nó khiến người ta hành động. Cổng khoá lại các
// dạng "đã giữ kết quả" mà nó phải im lặng.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', ...p), 'utf8'));

test('nghingoi: giữ kết quả setEnergy và nói thật khi hỏng', () => {
    const s = doc('nghingoi.js');

    assert.match(s, /const daHoi = await db\.setEnergy\(interaction\.user\.id, config\.ENERGY\.MAX\);/,
        'Phải GIỮ kết quả `setEnergy` — đó là thứ lệnh này hứa.');
    assert.match(s, /if \(daHoi !== true\)/, 'Phải có nhánh xử lý khi hồi năng lượng hỏng.');
    assert.match(s, /commands\.nghingoi\.err_save_failed/,
        'Hỏng thì phải nói, không được rơi xuống embed "đã hồi đầy".');

    // Nhánh hỏng phải RETURN, nếu không nó chạy tiếp vào đúng câu khoe cần tránh.
    const iHong = s.indexOf('if (daHoi !== true)');
    const iKhoe = s.indexOf('commands.nghingoi.success_desc');
    assert.ok(iHong > -1 && iKhoe > -1 && iHong < iKhoe,
        'Nhánh hỏng phải nằm TRƯỚC câu "đã hồi đầy năng lượng".');
});

test('nghingoi: KHÔNG đảo thứ tự cooldown (giữ cổng nguyên tử chống spam)', () => {
    const s = doc('nghingoi.js');
    const iCd = s.indexOf("db.claimCooldown(interaction.user.id, 'sleep'");
    const iHoi = s.indexOf('db.setEnergy(');
    assert.ok(iCd > -1 && iHoi > -1 && iCd < iHoi,
        '`claimCooldown` phải đứng TRƯỚC `setEnergy`. Nó là cổng nguyên tử chống spam, và vì\n'
        + 'nó FAIL-OPEN nên ca DB sập không hề khoá người dùng — đảo thứ tự là đánh đổi lỗ.');
    assert.doesNotMatch(s, /db\.setCooldown\(/,
        'Không dùng `setCooldown` (đã @deprecated, không nguyên tử) để thay `claimCooldown`.');
});

test('work: thưởng lên cấp phải được kiểm trước khi khoe', () => {
    const s = doc('work.js');

    assert.match(s, /const daThuong = bonus > 0/,
        'Phải GIỮ kết quả trả thưởng lên cấp vào biến.');
    assert.match(s, /await db\.addMoney\(userId, bonus, 'wallet'\) === true/,
        'Phải so sánh `=== true`: `addMoney` trả ba giá trị, `!` gộp nhầm `false` với `null`.');
    assert.match(s, /if \(!daThuong\) lvlUpDesc \+= t\(locale, 'commands\.work\.bonus_unconfirmed'\);/,
        'Thưởng hỏng thì phải nối cảnh báo vào đúng dòng chúc mừng đang khoe con số đó.');

    assert.doesNotMatch(s, /if \(bonus > 0\) await db\.addMoney\(userId, bonus, 'wallet'\);/,
        'Dạng cũ (bỏ kết quả) đã quay lại — đúng lỗi đang chặn.');
});

test('hai chuỗi mới chỉ đúng cách tự kiểm, ở cả hai ngôn ngữ', () => {
    for (const ngu of ['vi', 'en']) {
        const c = require(`../src/locales/${ngu}.json`).commands;

        const ngu1 = c.nghingoi?.err_save_failed;
        assert.ok(ngu1, `${ngu}: thiếu commands.nghingoi.err_save_failed`);
        assert.match(ngu1, /\/status/,
            `${ngu}: phải chỉ \`/status\` — đó là nơi xem được năng lượng thật.`);

        const w = c.work?.bonus_unconfirmed;
        assert.ok(w, `${ngu}: thiếu commands.work.bonus_unconfirmed`);
        assert.match(w, /\/bank balance/,
            `${ngu}: phải chỉ \`/bank balance\` — embed của /work chỉ hiện MỨC THAY ĐỔI của ví,\n`
            + 'không hiện số dư, nên không thể bảo người ta "xem dòng số dư bên dưới".');
        const conCap = ngu === 'vi' ? /cấp độ thì đã lên|không mất/i : /level did go up|nothing is lost/i;
        assert.match(w, conCap,
            `${ngu}: phải trấn an rằng CẤP ĐỘ vẫn lên thật — nếu không họ tưởng mất cả cấp.`);
    }
});

test('CÔNG CỤ QUÉT: không được báo nhầm các dạng đã giữ kết quả', () => {
    // Tám dạng dưới đây đều LÀ giữ kết quả. Bản đầu của máy quét báo nhầm cả tám.
    const mau = [
        "const [a, b] = await Promise.all([db.clanMembersExp(x), db.clanMembersExp(y)]);",
        "if (name) clan = await db.clanByName(name.trim());",
        "const rows = sub === 'mine' ? await db.marketMine(id) : await db.marketAll();",
        "const { owing, owed } = await db.loansOf(id);",
        "usedVehicle = await db.useVehicle(userId);",
        "const phat = fine > 0 ? await db.chargeAssets(id, fine) : 0;",
        "event = await db.createWorldEvent(a, b, c);",
        "daTra = await db.addMoney(userId, payout, 'wallet') === true;",
    ];
    const tam = path.join(os.tmpdir(), `waguri-quet-${process.pid}.js`);
    fs.writeFileSync(tam, mau.join('\n'), 'utf8');
    try {
        const ra = execFileSync(process.execPath,
            [path.join(ROOT, 'scripts', 'quet-truoc-khi-doc.js'), tam],
            { encoding: 'utf8' });
        const m = /TỔNG ứng viên: L1=(\d+)/.exec(ra);
        assert.ok(m, 'Không đọc được dòng TỔNG từ máy quét — nó đã đổi định dạng đầu ra.');
        assert.strictEqual(Number(m[1]), 0,
            `Máy quét báo ${m[1]} ứng viên L1 trên tám dòng vốn ĐỀU giữ kết quả.\n`
            + 'Một cái cân lệch tệ hơn không có cân: nó khiến người ta đi vá chỗ đang đúng,\n'
            + 'và làm mất lòng tin vào những báo cáo THẬT nằm cùng danh sách.');
    } finally {
        fs.unlinkSync(tam);
    }
});

test('CÔNG CỤ QUÉT: vẫn bắt được dạng bỏ kết quả thật', () => {
    // Cổng trên chặn báo nhầm. Cổng này chặn chiều ngược lại — máy quét im lặng luôn thì
    // nó cũng "0 dương tính giả", và vô dụng.
    const tam = path.join(os.tmpdir(), `waguri-quet2-${process.pid}.js`);
    fs.writeFileSync(tam, [
        "await db.setVoteReminder(userId, false);",
        "await db.closeTicket(channelId);",
        "db.syncProfile(a, b, c);",
    ].join('\n'), 'utf8');
    try {
        const ra = execFileSync(process.execPath,
            [path.join(ROOT, 'scripts', 'quet-truoc-khi-doc.js'), tam],
            { encoding: 'utf8' });
        const m = /TỔNG ứng viên: L1=(\d+)/.exec(ra);
        assert.strictEqual(Number(m[1]), 3,
            `Máy quét chỉ thấy ${m[1]}/3 dòng bỏ kết quả. Nó đang mù — mà một máy quét im lặng\n`
            + 'thì mọi tệp đều "sạch".');
    } finally {
        fs.unlinkSync(tam);
    }
});
