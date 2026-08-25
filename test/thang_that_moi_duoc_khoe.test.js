// ============================================================
// test/thang_that_moi_duoc_khoe.test.js — bốn trò CÓ NGƯỜI CHƠI THẬT không được khẳng
// định đã trả tiền khi việc trả tiền hỏng.
//
// VÌ SAO CÓ. `addMoney` với số DƯƠNG không bao giờ trả `false`: guard trong RPC
// `increment_balance` là `wallet + amount >= 0`, luôn đúng khi cộng. Nên nhánh hỏng duy
// nhất là `null` — DB lỗi. Lúc đó cược ĐÃ bị trừ mà thưởng chưa vào, và bản cũ vẫn in
//
//     "🎉 Cậu thắng! **+15.000** xu"
//
// rồi chỉ ghi một dòng `console.error` mà không ai đọc. Người chơi nhận một câu khẳng
// định sai về tiền của chính họ.
//
// PHẠM VI CÓ CHỦ Ý: chỉ 4 trò có lưu lượng thật — taixiu 343 lượt, coinflip 43,
// blackjack 19, crate 7 (đo `economy_ledger` 60 ngày, 2026-08-25). Chín chỗ cùng lớp lỗi
// ở các trò 0 lượt (baucua, duangua, xocdia, masoi, bacay, loto, bingo, pig, plant) đã
// ghi Backlog trong sổ audit lô game — ĐỪNG mở rộng cổng này sang chúng mà không đo lại.
//
// KHÔNG SỬA BẰNG CÁCH THỬ LẠI. `null` có thể là timeout mạng SAU KHI ghi đã thành công;
// trả lần nữa là trả gấp đôi. Cách đúng là đừng khẳng định, và để dòng số dư — vốn đọc
// lại từ DB — làm trọng tài.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = tro => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'games', `${tro}.js`), 'utf8'));

// Ba trò cùng một hình: giữ kết quả vào biến, rồi nối cảnh báo vào mô tả.
const BA_TRO = ['taixiu', 'coinflip'];

for (const tro of BA_TRO) {
    test(`${tro}: giữ kết quả trả tiền và nói thật khi nó hỏng`, () => {
        const s = doc(tro);

        assert.match(s, /const daTra = await db\.addMoney\(userId, payout, 'wallet'\);/,
            `${tro}: phải GIỮ kết quả cộng tiền vào biến. Dạng cũ \`if (!await db.addMoney(...))\`\n`
            + 'vứt kết quả ngay sau khi kiểm, nên dòng khoe bên dưới không còn gì để dựa vào.');

        assert.match(s, /if \(daTra !== true\) desc \+= t\(locale, 'common\.payout_unconfirmed'\);/,
            `${tro}: trả tiền hỏng thì PHẢI nối cảnh báo vào mô tả. Chỉ ghi console.error là\n`
            + 'im lặng với đúng người cần biết.');

        // Thứ tự quan trọng: cảnh báo phải nằm SAU dòng khoe thắng (đọc mới xuôi) và
        // TRƯỚC dòng số dư (để người đọc thấy cảnh báo rồi mới thấy con số thật).
        const iKhoe = s.indexOf(`commands.${tro}.win_msg`);
        const iCanh = s.indexOf("common.payout_unconfirmed");
        const iSoDu = s.indexOf(`commands.${tro}.balance_footer`);
        assert.ok(iKhoe > -1 && iCanh > -1 && iSoDu > -1, `${tro}: thiếu một trong ba mốc.`);
        assert.ok(iKhoe < iCanh && iCanh < iSoDu,
            `${tro}: cảnh báo phải nằm giữa dòng khoe thắng và dòng số dư.`);
    });

    test(`${tro}: không quay lại dạng vứt kết quả`, () => {
        const s = doc(tro);
        assert.doesNotMatch(s, /if \(!await db\.addMoney\(userId, payout/,
            `${tro}: dạng \`if (!await db.addMoney(...))\` đã quay lại — đúng lỗi đang chặn.`);
    });
}

test('blackjack: nhánh HOÀ cũng là một lần trả tiền, cũng phải cảnh báo', () => {
    const s = doc('blackjack');

    // `push` trả lại đúng tiền cược. Hỏng ở đó thì người chơi mất trắng tiền cược mà vẫn
    // đọc "hoà" — nặng hơn nhánh thắng, vì họ tưởng mình chẳng mất gì.
    // Phải kiểm VỊ TRÍ chứ không chỉ sự tồn tại: `let` bị chặn phạm vi khối, nên nếu khai
    // báo tụt vào trong `if (payout > 0)` thì nhánh THUA (payout = 0) chạy tới `if (!daTra)`
    // sẽ ném ReferenceError và hỏng cả lệnh. Bản đầu của cổng này chỉ bắt sự tồn tại nên
    // vẫn xanh với đúng cú bẻ đó — phát hiện khi chạy bẻ ngược, không phải khi đọc lại.
    const iKhai = s.indexOf('let daTra = true;');
    const iKhoi = s.indexOf('if (payout > 0) {');
    assert.ok(iKhai > -1, 'blackjack: thiếu `let daTra = true;`.');
    assert.ok(iKhoi > -1, 'blackjack: không thấy khối `if (payout > 0) {` — tệp đã đổi hình.');
    assert.ok(iKhai < iKhoi,
        'blackjack: `daTra` đang khai báo BÊN TRONG khối `if (payout > 0)`. Nhánh thua sẽ\n'
        + 'ném ReferenceError ở `if (!daTra)` phía dưới và làm hỏng cả lệnh.');

    assert.match(s, /daTra = await db\.addMoney\(userId, payout, 'wallet'\) === true;/,
        'blackjack: phải giữ kết quả cộng tiền vào `daTra`.');

    assert.match(s, /if \(!daTra\) note \+= t\(locale, 'common\.payout_unconfirmed'\);/,
        'blackjack: trả tiền hỏng phải nối cảnh báo vào `note`.');

    const iCanh = s.indexOf("common.payout_unconfirmed");
    const iSoDu = s.indexOf('commands.blackjack.balance_footer');
    assert.ok(iCanh > -1 && iSoDu > -1 && iCanh < iSoDu,
        'blackjack: cảnh báo phải đứng TRƯỚC dòng số dư.');
});

test('crate: mọi cửa trao thưởng đều kiểm kết quả', () => {
    const s = doc('crate');

    assert.match(s, /if \(await db\.addMoney\(userId, amt, 'wallet'\) !== true\) return null;/,
        'crate: `money()` phải trả `null` khi cộng tiền hỏng.');
    assert.match(s, /if \(await db\.giveItemAdmin\(userId, id, 1\) !== true\) return null;/,
        'crate: `giveItem()` phải trả `null` khi cấp vật phẩm hỏng.');

    // Ở rương, trao hỏng là MẤT TRẮNG: tiền mở rương đã trừ trước đó rồi.
    assert.match(s, /const HONG = t\(locale, 'commands\.crate\.prize_failed'\);/,
        'crate: phải có chuỗi nói thật khi trao hỏng.');
    assert.match(s, /if \(desc === HONG\) type = 'warning';/,
        'crate: rương hỏng mà vẫn để `type = \'jackpot\'` thì hiện khung vàng "ĐẠI TRÚNG"\n'
        + 'cho một lần mất trắng. Hai nhánh hiếm nhất đặt `jackpot` TRƯỚC khi biết kết quả.');
});

test('crate: cả bảy nhánh đi qua cửa kiểm, không nhánh nào gọi thẳng', () => {
    const s = doc('crate');

    // Nếu một nhánh gọi thẳng `money(...)`/`giveItem(...)` rồi tự dựng chuỗi, nó lại bỏ
    // qua `null` — đúng lỗi vừa vá, chỉ khác chỗ.
    const nhanh = (s.match(/desc = await dong(Tien|Do)\(/g) || []).length;
    assert.strictEqual(nhanh, 7,
        `Chỉ ${nhanh}/7 nhánh đi qua \`dongTien\`/\`dongDo\`. Nhánh còn lại tự dựng chuỗi\n`
        + 'nghĩa là nó lại bỏ qua kết quả trao thưởng.');

    // Đếm NƠI GỌI thay vì bắt hình dạng chuỗi: `money`/`giveItem` chỉ được gọi đúng MỘT
    // lần mỗi cái — từ trong `dongTien`/`dongDo`. Thêm một lời gọi nào nữa nghĩa là có
    // nhánh đi vòng qua cửa kiểm.
    //
    // (Bản đầu của cổng này bắt `const a = await money(` và tự đỏ, vì đó CHÍNH LÀ dòng
    // bên trong `dongTien`. Đếm nơi gọi không dính bẫy đó.)
    const goiMoney = (s.match(/await money\(/g) || []).length;
    const goiItem = (s.match(/await giveItem\(/g) || []).length;
    assert.strictEqual(goiMoney, 1,
        `\`money()\` được gọi ${goiMoney} lần, phải đúng 1 (từ trong \`dongTien\`).`);
    assert.strictEqual(goiItem, 1,
        `\`giveItem()\` được gọi ${goiItem} lần, phải đúng 1 (từ trong \`dongDo\`).`);
});

test('khoá i18n có ở CẢ hai ngôn ngữ và không khẳng định phẳng', () => {
    for (const ngu of ['vi', 'en']) {
        const j = require(`../src/locales/${ngu}.json`);

        const chung = j.common?.payout_unconfirmed;
        assert.ok(chung, `${ngu}: thiếu common.payout_unconfirmed`);
        assert.ok(chung.length > 40, `${ngu}: common.payout_unconfirmed quá ngắn để nói rõ chuyện gì.`);

        const rieng = j.commands?.crate?.prize_failed;
        assert.ok(rieng, `${ngu}: thiếu commands.crate.prize_failed`);

        // Cả hai chuỗi phải CHỈ người đọc sang dòng số dư — đó là chỗ nói thật duy nhất.
        const chiSoDu = ngu === 'vi' ? /số dư/i : /balance/i;
        assert.match(chung, chiSoDu, `${ngu}: common.payout_unconfirmed phải chỉ sang dòng số dư.`);
        assert.match(rieng, chiSoDu, `${ngu}: commands.crate.prize_failed phải chỉ sang dòng số dư.`);
    }
});
