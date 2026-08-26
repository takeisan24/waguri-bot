// ============================================================
// test/ticket_khong_khoa_nguoi_dung.test.js — đóng ticket không được khoá người ta khỏi
// việc mở ticket sau này.
//
// VÌ SAO CÓ. `tkt:confirm_close` chạy `await db.closeTicket(channel.id)` rồi XOÁ KÊNH vô
// điều kiện sau 5 giây. `closeTicket` trả `false` khi DB lỗi. Khi đó:
//
//   1. bản ghi ticket ở lại trạng thái OPEN/CLAIMED
//   2. kênh vẫn bị xoá
//   3. `getActiveTicket` vẫn thấy bản ghi đó
//   4. `handleTicketOpen` từ chối: "cậu đang có ticket ở <#kênh-đã-bị-xoá>"
//
// -> Người đó bị KHOÁ VĨNH VIỄN khỏi hệ thống hỗ trợ, trỏ vào một kênh không còn tồn tại,
// và không có đường nào tự thoát. Với một hệ thống mà mục đích duy nhất là để người ta kêu
// cứu, đây là kiểu hỏng tệ nhất.
//
// ĐÁNG CHÚ Ý: `handleTicketOpen` ngay phía trên đã làm ĐÚNG chuyện này từ chiều ngược lại —
// ghi DB hỏng thì dọn kênh vừa tạo, kèm chú thích giải thích vì sao không đảo được thứ tự.
// Bài học có sẵn trong cùng một tệp, chỉ là chưa với tới đường đóng.
//
// HAI CHIỀU CỦA BẢN VÁ, cần cả hai:
//   · CHẶN NGUYÊN NHÂN — không xoá kênh khi chưa ghi được DB.
//   · TỰ CHỮA          — ai đã dính lỗi cũ thì hiện đang bị khoá, mà bản vá ở đường đóng
//                        không cứu được họ. Phải dọn bản ghi mồ côi ở đường mở.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'events', 'interactionCreate.js'), 'utf8'));

test('xoá kênh phải PHỤ THUỘC vào việc ghi DB thành công', () => {
    const s = src();

    assert.match(s, /const daDong = await db\.closeTicket\(channel\.id\);/,
        'Phải GIỮ kết quả `closeTicket`. Bản cũ bỏ qua nó và xoá kênh vô điều kiện.');
    assert.match(s, /if \(!daDong\) \{/,
        'Phải có nhánh xử lý khi ghi DB hỏng.');

    // Xoá kênh là bước KHÔNG ĐẢO NGƯỢC ĐƯỢC -> nó phải nằm sau cửa kiểm.
    const iKiem = s.indexOf('if (!daDong)');
    const iXoa = s.indexOf("channel.delete('Đóng ticket')");
    assert.ok(iKiem > -1 && iXoa > -1, 'thiếu một trong hai mốc.');
    assert.ok(iKiem < iXoa,
        'Lệnh xoá kênh đang đứng TRƯỚC cửa kiểm. Xoá kênh không đảo ngược được, nên nó phải\n'
        + 'phụ thuộc vào bước có thể hỏng đứng trước nó.');
});

test('ghi DB hỏng thì GIỮ kênh lại và nói với staff', () => {
    const s = src();
    // Cắt ĐÚNG tới hết nhánh hỏng (`return;` đầu tiên), không cắt theo số ký tự: nhánh
    // thành công nằm ngay dưới và có `channel.delete`, nên lát rộng sẽ nuốt nhầm nó vào rồi
    // báo lỗi oan. (Bản đầu của cổng này cắt 400 ký tự và tự đỏ vì đúng lý do đó.)
    const iKiem = s.indexOf('if (!daDong)');
    const iHetNhanh = s.indexOf('return;', iKiem);
    assert.ok(iKiem > -1 && iHetNhanh > -1, 'không tìm thấy nhánh xử lý ghi hỏng.');
    const nhanh = s.slice(iKiem, iHetNhanh + 'return;'.length);

    assert.match(nhanh, /commands\.ticket\.err_close_db/,
        'Nhánh hỏng phải nói cho staff biết — họ là người vừa bấm nút, im lặng ở đây nghĩa là\n'
        + 'họ tưởng đã đóng xong.');
    assert.match(nhanh, /return;/,
        'Nhánh hỏng phải `return` — chạy tiếp là rơi vào đúng lệnh xoá kênh cần tránh.');
    assert.doesNotMatch(nhanh, /channel\.delete/,
        'Nhánh hỏng TUYỆT ĐỐI không được xoá kênh. Thà để một kênh cần đóng tay còn hơn khoá\n'
        + 'người ta khỏi mọi ticket sau này.');
});

test('đường MỞ tự chữa bản ghi mồ côi (cứu người đã dính lỗi cũ)', () => {
    const s = src();

    assert.match(s, /const kenhCu = guild\.channels\.cache\.get\(String\(active\.channel_id\)\);/,
        'Phải đối chiếu bản ghi với kênh THẬT. Đọc cache là 0 vòng API.');
    assert.match(s, /await db\.closeTicket\(active\.channel_id\)/,
        'Kênh không còn -> bản ghi là rác, phải đóng nó rồi cho mở ticket mới.');

    // Chỉ từ chối khi kênh CÒN THẬT.
    const iKenh = s.indexOf('const kenhCu =');
    const iTuChoi = s.indexOf('commands.ticket.err_already_open');
    assert.ok(iKenh > -1 && iTuChoi > -1 && iKenh < iTuChoi,
        'Câu từ chối "cậu đang có ticket ở ..." phải nằm SAU khi đã xác nhận kênh còn tồn tại.\n'
        + 'Từ chối trước là lặp lại đúng lỗi: trỏ người dùng vào một kênh đã bị xoá.');
});

test('chuỗi mới nói rõ HẬU QUẢ, không chỉ "có lỗi"', () => {
    for (const ngu of ['vi', 'en']) {
        const s = require(`../src/locales/${ngu}.json`).commands.ticket.err_close_db;
        assert.ok(s, `${ngu}: thiếu commands.ticket.err_close_db`);

        // Staff cần hiểu VÌ SAO kênh còn đó, nếu không họ sẽ tự tay xoá và tái tạo đúng lỗi.
        const giuKenh = ngu === 'vi' ? /giữ nguyên kênh|chưa xoá/i : /keeping this channel|instead of deleting/i;
        assert.match(s, giuKenh,
            `${ngu}: phải nói rõ là ĐANG GIỮ kênh lại — không thì staff tưởng bot hỏng và xoá tay.`);

        const biKet = ngu === 'vi' ? /bị kẹt|không mở được/i : /lock|never open/i;
        assert.match(s, biKet,
            `${ngu}: phải nói rõ hậu quả nếu xoá — đó là lý do duy nhất khiến việc giữ kênh lại\n`
            + 'là hợp lý, và staff cần hiểu để không tự tay phá.');
    }
});
