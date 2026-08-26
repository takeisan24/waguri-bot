// ============================================================
// test/thuong_vote_ba_duong_nhu_mot.test.js — ba đường phát thưởng vote phải cư xử như MỘT.
//
// VÌ SAO CÓ — VÀ ĐÂY LÀ BÀI HỌC CHÍNH. Sáng 25-08 tôi vá lỗi "khoe thưởng khi chưa trả
// được" ở LỆNH `/vote` (`d23cc69`) và coi như xong. Nhưng người dùng gần như không bao giờ
// đi qua lệnh đó: Top.gg và discordbotlist gọi **webhook**. Hai đường webhook vẫn giữ
// nguyên lỗi cũ suốt — tức bản vá hôm đó chỉ chạm đúng đường ít người đi nhất.
//
// Ba đường, ba trạng thái khác nhau trước khi vá:
//   · lệnh `/vote`         — không kiểm, khoe thẳng   (đã vá `d23cc69`)
//   · webhook Top.gg       — không kiểm, DM khoe thẳng
//   · webhook DBL          — CÓ kiểm và ghi log, nhưng DM vẫn khoe vô điều kiện
//
// Cái thứ ba nguy hiểm nhất về mặt đọc mã: nhìn qua tưởng đã xử lý rồi, vì có `console.error`
// ngay đó. Nhưng ghi log là nói với NHÀ PHÁT TRIỂN, không phải với người vừa mất tiền.
//
// Cổng này vì thế không kiểm từng đường riêng lẻ mà đòi CHÚNG GIỐNG NHAU — và đếm số đường,
// để đường thứ tư thêm sau này không lặng lẽ ra đời với lỗi cũ.
//
// KHÔNG SỬA BẰNG CÁCH THỬ TRẢ LẠI ở bất kỳ đường nào: cả ba đều đặt cooldown TRƯỚC khi trả
// tiền, và chính cooldown đó là cổng chống nhận đúp.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

/** Thân một hàm, cắt từ chỗ khai báo tới khai báo `async function` kế tiếp. */
function thanHam(src, ten) {
    const i = src.indexOf(`async function ${ten}(`);
    if (i < 0) return null;
    const sau = src.indexOf('\nasync function ', i + 1);
    return src.slice(i, sau < 0 ? undefined : sau);
}

const DUONG_WEBHOOK = ['grantVoteReward', 'grantDblVoteReward'];

for (const ten of DUONG_WEBHOOK) {
    test(`${ten}: giữ kết quả trả tiền VÀ nói cho người dùng biết`, () => {
        const than = thanHam(doc('src', 'lib', 'voteServer.js'), ten);
        assert.ok(than, `Không tìm thấy hàm ${ten} — tệp đã đổi hình, xem lại cổng.`);

        assert.match(than, /const daTra = await db\.addMoney\(userId, coins, 'wallet'\);/,
            `${ten}: phải GIỮ kết quả cộng tiền vào biến.`);

        // Ghi log là nói với nhà phát triển. Người vừa mất tiền cũng phải được nói.
        assert.match(than, /commands\.vote\.payout_unconfirmed/,
            `${ten}: DM vẫn khoe vô điều kiện. \`console.error\` không phải cách báo cho NGƯỜI\n`
            + 'DÙNG — đó chính là trạng thái mà đường DBL đã ở suốt và nhìn qua tưởng đã xử lý.');

        assert.match(than, /daTra !== true \?/,
            `${ten}: phải rẽ nhánh theo \`daTra\` khi dựng nội dung DM.`);
    });
}

test('cả ba đường dùng CHUNG một chuỗi — đừng chép ra ba bản', () => {
    // Ba bản chép tay là ba cơ hội lệch nhau: sửa câu chữ ở một chỗ, hai chỗ kia ở lại.
    const vs = doc('src', 'lib', 'voteServer.js');
    const cmd = doc('src', 'commands', 'utility', 'vote.js');
    for (const [ten, s] of [['voteServer.js', vs], ['vote.js', cmd]]) {
        assert.match(s, /commands\.vote\.payout_unconfirmed/,
            `${ten}: phải dùng khoá i18n dùng chung \`commands.vote.payout_unconfirmed\`.`);
    }
});

test('đếm số đường phát thưởng vote — đường thứ tư phải làm cổng đỏ', () => {
    // Chốt bằng CON SỐ chứ không chỉ kiểm những đường hôm nay đã biết. Thêm nền tảng vote
    // thứ ba (và hàm grant thứ ba) sẽ làm cổng đỏ, buộc người thêm phải đọc tệp này.
    const vs = doc('src', 'lib', 'voteServer.js');
    const soDuong = (vs.match(/await db\.addMoney\(userId, coins, 'wallet'\)/g) || []).length;
    assert.strictEqual(soDuong, 2,
        `voteServer.js có ${soDuong} đường phát thưởng vote, cổng này đang canh 2 (Top.gg + DBL).\n`
        + 'Nếu vừa thêm một nền tảng vote nữa: cập nhật DUONG_WEBHOOK ở đầu tệp này, và nhớ\n'
        + 'rằng đường mới cũng phải kiểm kết quả + nói cho người dùng, không chỉ ghi log.');
});

test('không đường nào "sửa" bằng cách trả tiền lần nữa', () => {
    const vs = doc('src', 'lib', 'voteServer.js');
    for (const ten of DUONG_WEBHOOK) {
        const than = thanHam(vs, ten);
        const soLanTra = (than.match(/db\.addMoney\(userId, coins/g) || []).length;
        assert.strictEqual(soLanTra, 1,
            `${ten}: có ${soLanTra} lời gọi trả thưởng, phải đúng MỘT. Cooldown được đặt TRƯỚC\n`
            + 'khi trả tiền chính là cổng chống nhận đúp — thử lại là mở lại đúng race đó.');
    }
});

test('cooldown vẫn được đặt TRƯỚC khi trả tiền, ở cả hai đường', () => {
    const vs = doc('src', 'lib', 'voteServer.js');
    for (const ten of DUONG_WEBHOOK) {
        const than = thanHam(vs, ten);
        const iCd = than.indexOf('db.claimCooldown(');
        const iTra = than.indexOf('db.addMoney(userId, coins');
        assert.ok(iCd > -1 && iTra > -1, `${ten}: thiếu một trong hai mốc.`);
        assert.ok(iCd < iTra,
            `${ten}: cooldown phải đặt TRƯỚC khi trả tiền. Đảo lại là mở đường nhận đúp —\n`
            + 'webhook có thể bị gọi lặp, và Top.gg thực tế có gửi lại khi không nhận được 200.');
    }
});
