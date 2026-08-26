// ============================================================
// test/utility_khong_hua_hao_va_khong_cho_vo_co.test.js — hai nhóm nhỏ khép lại lô utility.
//
// (A) `/vote` khoe thưởng khi chưa trả được — đúng lớp lỗi đã vá ở 4 trò cờ bạc (`26b7974`).
//     KHÁC một điểm quan trọng: embed của `/vote` KHÔNG có dòng số dư. Ở 4 trò kia, chỗ nói
//     thật là dòng số dư đọc lại từ DB ngay bên dưới; ở đây không có gì đóng vai đó, nên
//     chuỗi cảnh báo phải TỰ chỉ người đọc sang `/bank balance`.
//
//     Và KHÔNG được "sửa" bằng cách thử trả lại: cooldown ở lệnh này được đặt TRƯỚC khi trả
//     tiền và chính nó là cổng chống nhận đúp. Trả lần nữa là mở lại đúng cái race mà thứ
//     tự đó sinh ra để chặn.
//
// (B) Ba chỗ chờ nối tiếp trong khi các lời gọi hoàn toàn độc lập nhau. Không phải lỗi sai
//     kết quả — chỉ là thời gian chờ vô cớ. Gom vào cùng cổng vì cùng một hình dạng: thứ có
//     thể chạy song song mà lại xếp hàng.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'utility', ...p), 'utf8'));

test('vote: giữ kết quả trả tiền, và cảnh báo khi nó hỏng', () => {
    const s = doc('vote.js');

    assert.match(s, /const daTra = await db\.addMoney\(interaction\.user\.id, coins, 'wallet'\);/,
        'Phải GIỮ kết quả cộng tiền vào biến. Dạng cũ `if (!await db.addMoney(...))` vứt kết\n'
        + 'quả ngay sau khi kiểm, nên dòng khoe bên dưới không còn gì để dựa vào.');

    // Điều kiện nay xét CẢ HAI trục — xu và EXP — vì `desc_success` khoe cả hai. Bản đầu
    // của cổng này chỉ canh trục xu, nên nửa EXP khoe hụt vẫn lọt qua. Xem
    // `test/thuong_vote_ba_duong_nhu_mot.test.js` để biết đầy đủ.
    assert.match(s, /\(daTra !== true \|\| daExp === null\) \? t\(locale, 'commands\.vote\.payout_unconfirmed'\) : ''/,
        'Thưởng hỏng thì phải nối cảnh báo vào mô tả, không chỉ ghi console.error — và phải\n'
        + 'xét cả hai nửa (xu VÀ EXP), vì chỉ xét một nửa là để nửa kia khoe hụt.');

    assert.doesNotMatch(s, /if \(!await db\.addMoney\(interaction\.user\.id, coins/,
        'Dạng vứt kết quả đã quay lại — đúng lỗi đang chặn.');

    // Cooldown-first là cổng chống nhận đúp. Thử trả lại là phá chính cổng đó.
    const soLanTra = (s.match(/db\.addMoney\(interaction\.user\.id, coins/g) || []).length;
    assert.strictEqual(soLanTra, 1,
        `Có ${soLanTra} lời gọi trả thưởng vote. Chỉ được đúng MỘT: cooldown đặt TRƯỚC khi\n`
        + 'trả tiền chính là cổng chống nhận đúp, nên thử lại sẽ mở lại race đó.');
});

test('vote: chuỗi cảnh báo phải chỉ đường tự kiểm, vì embed không có dòng số dư', () => {
    const s = doc('vote.js');
    assert.doesNotMatch(s, /commands\.vote\.balance_footer/,
        'Nếu nay embed CÓ dòng số dư thật thì sửa lại cổng này và chuỗi i18n cho khớp —\n'
        + 'chuỗi hiện tại đang bảo người dùng tự gõ `/bank balance`.');

    for (const ngu of ['vi', 'en']) {
        const v = require(`../src/locales/${ngu}.json`).commands.vote;
        assert.ok(v.payout_unconfirmed, `${ngu}: thiếu commands.vote.payout_unconfirmed`);
        assert.match(v.payout_unconfirmed, /\/bank balance/,
            `${ngu}: chuỗi phải chỉ rõ cách tự kiểm (\`/bank balance\`). Nói "có trục trặc"\n`
            + 'mà không nói kiểm bằng cách nào thì người dùng vẫn mắc kẹt.');
        // Lượt vote đã được ghi nhận (cooldown đã đặt) — phải trấn an đúng chỗ đó.
        const khongMat = ngu === 'vi' ? /không mất|đã được ghi nhận/i : /nothing is lost|was recorded/i;
        assert.match(v.payout_unconfirmed, khongMat,
            `${ngu}: phải nói rõ LƯỢT VOTE không mất, nếu không người dùng sẽ tưởng phải vote lại.`);
    }
});

test('premium: hỏi tên người ủng hộ SONG SONG, không xếp hàng', () => {
    const s = doc('premium.js');
    assert.doesNotMatch(s, /for \(const s of supporters\)/,
        'Còn vòng lặp tuần tự qua danh sách ủng hộ: mỗi vòng một lần gọi Discord, đủ 10\n'
        + 'người là ~2 giây chờ vô cớ cho những lời hỏi vốn độc lập nhau.');
    assert.match(s, /await Promise\.all\(supporters\.map\(/,
        'Phải gom cả danh sách vào một Promise.all.');
    assert.match(s, /\.catch\(\(\) => s\.user_id\)/,
        'Hỏi không ra tên thì phải lui về ID — đừng để trống một dòng trong bảng vinh danh.');
});

for (const [tep, khoa] of [['status.js', 'id'], ['profile-ctx.js', 'target.id']]) {
    test(`${tep}: đọc user và năng lượng song song`, () => {
        const s = doc(tep);
        const rx = new RegExp(`const \\[user, energy\\] = await Promise\\.all\\(\\[db\\.getUser\\(${khoa.replace('.', '\\.')}\\), db\\.getEnergy\\(${khoa.replace('.', '\\.')}\\)\\]\\)`);
        assert.match(s, rx,
            `${tep}: hai truy vấn này độc lập nhau, phải chạy song song (bớt ~110ms mỗi lượt).`);

        // Đếm LỜI GỌI, không đếm `await db.getEnergy`: gom vào Promise.all xong thì `await`
        // đứng trước `Promise.all` chứ không còn trước `db.getEnergy` — bản đầu của cổng này
        // đếm nhầm như vậy và tự đỏ.
        const soLanGoi = (s.match(/db\.getEnergy\(/g) || []).length;
        assert.strictEqual(soLanGoi, 1,
            `${tep}: có ${soLanGoi} lời gọi \`db.getEnergy\` — phải đúng 1, nằm trong Promise.all.\n`
            + 'Nhiều hơn 1 nghĩa là ai đó đã tách ngược ra thành lời gọi rời.');
        assert.doesNotMatch(s, /await db\.getEnergy\(/,
            `${tep}: còn một \`await db.getEnergy\` rời — đã tách ngược khỏi Promise.all.`);
    });
}
