// test/bakery_nut_het_han_phai_mo.test.js — nút đã chết thì không được để SÁNG mời bấm.
//
// VÌ SAO CÓ. `/bakery view` vẽ hai nút (`bk_btn_collect`, `bk_btn_orders`) rồi gắn một
// collector 60 giây. Nhánh `collect` gọi `collector.stop('acted')` sau cú bấm ĐẦU TIÊN, còn
// nhánh `end` chỉ làm mờ nút khi `reason !== 'acted'`. Hệ quả: bấm một cái là collector
// chết, mà nút vẫn SÁNG NGUYÊN trên tin nhắn — không còn ai lắng nghe nữa.
//
// Nút sống sót được qua lượt cập nhật vì `subThu`/`subDonhang` chỉ `editReply` phần
// `embeds`, và Discord GIỮ NGUYÊN field nào không được gửi. Người chơi bấm tiếp thì gặp
// "The application did not respond" — không phải vì bot chậm, mà vì không còn handler nào.
//
// Đo trên log prod 24-10: `nút bk_btn_orders` ba lần liên tiếp 05:55 → 05:57, cùng một
// người, mỗi lần cách nhau đúng một phút — dấu của người bấm lại vì tưởng mình bấm hụt.
// `/bakery` là lệnh đông thứ tư của bot và có tỷ lệ lỗi cao nhất trong nhóm có lưu lượng
// thật: 6/146 = 4,1% trong 7 ngày.
//
// ĐỪNG MỞ RỘNG CỔNG NÀY RA `farm.js`/`loan.js` — tôi đã suýt làm và đó là báo đỏ OAN.
// Hai tệp đó có y nguyên khuôn `if (reason !== 'acted')`, nhưng nhánh `collect` của chúng
// gửi `editReply({ embeds: [...], components: [] })`, tức XOÁ HẲN nút ngay tại cú bấm. Khi
// collector dừng thì chẳng còn gì để làm mờ, nên cửa `reason` ở đó là ĐÚNG. Khác biệt nằm ở
// `components: []`, không nằm ở khuôn chữ của nhánh `end` — một cổng quét theo khuôn chữ sẽ
// báo 3 chỗ mà 2 chỗ sai, đúng cái bẫy `lib/canhAck.js` đã ghi.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TEP = path.join(__dirname, '..', 'src', 'commands', 'economy', 'bakery.js');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = () => boCmt(fs.readFileSync(TEP, 'utf8'));

/** Lát mã của nhánh `collector.on('end', ...)` trong `/bakery view`. */
function nhanhEnd(s) {
    const i = s.indexOf("collector.on('end'");
    assert.ok(i > -1, "Không tìm thấy `collector.on('end'` trong bakery.js — cổng cần cập nhật.");
    // Cắt tới hết lời gọi `editReply` của nhánh đó, không cắt theo số ký tự cố định.
    const j = s.indexOf('editReply', i);
    assert.ok(j > -1, 'Nhánh end không còn gọi editReply — nút sẽ không bao giờ được làm mờ.');
    return s.slice(i, j + 200);
}

test('bakery: làm mờ nút VÔ ĐIỀU KIỆN, không xét `reason`', () => {
    const nhanh = nhanhEnd(doc());

    assert.doesNotMatch(nhanh, /reason\s*!==\s*['"]acted['"]/,
        'Nhánh `end` đang xét `reason !== "acted"`. Bấm một cái là `stop("acted")` chạy,\n'
        + 'nhánh này bỏ qua, và nút Ở LẠI SÁNG trong khi collector đã chết. Đây đúng là\n'
        + 'trạng thái đã sinh ra 3 lần "did not respond" liên tiếp trên prod ngày 24-10.\n'
        + 'Hai hàm sub chỉ editReply phần `embeds` nên nút KHÔNG tự biến mất như ở farm/loan.');

    assert.match(nhanh, /setDisabled\(true\)/,
        'Nhánh `end` phải làm mờ nút (`setDisabled(true)`).');
});

test('bakery: nút được làm mờ ở MỌI đường collector dừng, kể cả bấm rồi', () => {
    const s = doc();

    // `stop('acted')` vẫn được giữ (bấm một lượt rồi đóng nút) — nhưng chính vì nó tồn tại
    // mà nhánh `end` KHÔNG được phép bỏ qua lượt dừng đó.
    assert.match(s, /collector\.stop\(\s*['"]acted['"]\s*\)/,
        'Cổng này giả định `/bakery view` vẫn dừng collector sau cú bấm đầu. Nếu đã đổi cách\n'
        + 'làm thì đọc lại cả cổng chứ đừng chỉ xoá dòng assert này.');

    // Hai hàm sub chỉ gửi `embeds` -> nút sống sót qua editReply. Đây là TIỀN ĐỀ của lỗi;
    // nếu sau này ai cho chúng gửi `components: []` như farm/loan thì cổng phải được đọc lại
    // (lúc đó cửa `reason` sẽ lại hợp lệ), nên khoá tiền đề này luôn.
    const iSubThu = s.indexOf('async function subThu');
    const iSubSau = s.indexOf('async function subThue');
    assert.ok(iSubThu > -1 && iSubSau > iSubThu, 'không khoanh được thân hàm subThu.');
    assert.doesNotMatch(s.slice(iSubThu, iSubSau), /components\s*:\s*\[\s*\]/,
        '`subThu` nay gửi `components: []` — nút tự biến mất, nên tiền đề của cổng này đã\n'
        + 'đổi. Đọc lại phần "ĐỪNG MỞ RỘNG CỔNG NÀY" ở đầu tệp rồi quyết, đừng sửa mù.');
});

test('bakery: không để lại núm cấu hình không bao giờ với tới được', () => {
    const s = doc();
    const i = s.indexOf('createMessageComponentCollector');
    assert.ok(i > -1, 'không tìm thấy collector của /bakery view.');
    const optTho = s.slice(i, s.indexOf('}', i));

    // `max: 2` từng nằm đây cùng với `stop('acted')` sau cú bấm đầu — tức hạn mức 2 lượt
    // không bao giờ với tới được. Núm giả còn tệ hơn thiếu núm: người đọc sau sẽ tin
    // collector nhận hai lượt rồi suy luận sai từ đó.
    assert.doesNotMatch(optTho, /max\s*:/,
        'Collector của /bakery view đặt `max` trong khi nhánh collect luôn `stop("acted")`\n'
        + 'sau cú bấm đầu — hạn mức đó không bao giờ với tới được.');
});
