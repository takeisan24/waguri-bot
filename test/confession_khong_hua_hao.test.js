// ============================================================
// test/confession_khong_hua_hao.test.js — `/confession` không được nói "đã gửi" khi chưa gửi.
//
// VÌ SAO CÓ. Bản cũ chạy đúng thứ tự này:
//     1. đốt cooldown 15 phút   (claimCooldown)
//     2. tra kênh confession
//     3. đốt số thứ tự bài      (nextConfessionNumber)
//     4. ghi log                (logConfession)
//     5. channel.send(...).catch(() => null)      <- NUỐT LỖI
//     6. trả lời "đã gửi thành công"              <- VÔ ĐIỀU KIỆN
//
// Nên khi bot không có quyền gửi ở kênh đó, người dùng đọc "đã gửi", bài thì không hề đăng,
// và họ bị khoá 15 phút cho một lần thử không tạo ra gì cả.
//
// NẶNG HƠN các lỗi tiền cùng lớp đã vá ở lô game: ở đó còn có dòng số dư đọc lại từ DB làm
// trọng tài — người chơi mở ví ra là biết. Confession thì KHÔNG có gì để đối chiếu, mà cả
// tính năng lại bán trên chữ "ẩn danh, đáng tin".
//
// HAI TẦNG SỬA, cố ý khác nhau:
//   · PHÒNG  — dời cửa cooldown xuống SAU khi đã biết kênh tồn tại và bot gửi được. Đây mới
//              là phần chính: nó biến gần hết ca hỏng thành thoát sớm, không tốn lượt nào.
//   · LƯỚI   — vẫn kiểm kết quả `channel.send`, cho khe hở còn lại (quyền bị gỡ ngay giữa
//              lúc kiểm và lúc gửi). Khe này hiếm nhưng có thật, và nói thật thì rẻ.
//
// KHÔNG sửa bằng cách nhả lại cooldown: `claim_cooldown` chỉ có claim, không có clear — thêm
// đường nhả là thêm một migration cho tính năng 2 lượt dùng, sai tỉ lệ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'fun', 'confession.js'), 'utf8'));

test('cooldown chỉ được đốt SAU khi biết chắc gửi được', () => {
    const s = src();

    const iCoolDown = s.indexOf("db.claimCooldown(userId, 'confession'");
    const iKenh = s.indexOf('db.getGuildSettings(gid)');
    const iQuyen = s.indexOf('channel.permissionsFor(');

    assert.ok(iCoolDown > -1, 'không còn thấy lời gọi claimCooldown — tệp đã đổi hình, xem lại cổng.');
    assert.ok(iKenh > -1, 'không còn thấy getGuildSettings.');
    assert.ok(iQuyen > -1, 'thiếu bước kiểm quyền gửi của bot ở kênh confession.');

    assert.ok(iKenh < iCoolDown,
        'Đang đốt cooldown TRƯỚC khi tra kênh. Server chưa cấu hình kênh thì người dùng bị\n'
        + 'khoá 15 phút cho một lần thử không tạo ra gì cả — mà cooldown không có đường nhả.');
    assert.ok(iQuyen < iCoolDown,
        'Đang đốt cooldown TRƯỚC khi kiểm quyền. Bot bị gỡ quyền ở kênh đó thì người dùng\n'
        + 'mất lượt mà bài không đăng. Kiểm quyền là phép ĐỌC, dời lên trước không mất gì.');
});

test('kiểm đủ CẢ HAI quyền, vì bài gửi là embed', () => {
    const s = src();
    assert.match(s, /PermissionsBitField/,
        'phải import PermissionsBitField để kiểm quyền bằng cờ, không phải đoán theo tên role.');
    assert.match(s, /Flags\.SendMessages/, 'thiếu kiểm quyền SendMessages.');
    assert.match(s, /Flags\.EmbedLinks/,
        'thiếu kiểm quyền EmbedLinks. Bài confession là embed — thiếu RIÊNG quyền này thì\n'
        + '`channel.send` vẫn ném lỗi y hệt như thiếu SendMessages, mà cửa trên lại cho qua.');
});

test('kết quả channel.send phải được GIỮ, không nuốt', () => {
    const s = src();

    assert.doesNotMatch(s, /channel\.send\([\s\S]{0,60}?\)\.catch\(\(\) => null\)/,
        'Đã quay lại `.catch(() => null)` — nuốt lỗi gửi rồi vẫn khoe thành công. Đúng lỗi đang chặn.');
    assert.match(s, /const daGui = await channel\.send\([\s\S]{0,80}?\.catch\(\(\) => false\)/,
        'Phải giữ kết quả gửi vào `daGui` (true/false), không được bỏ đi.');
    assert.match(s, /if \(!daGui\)/, 'Phải có nhánh xử lý khi gửi hụt.');
});

test('câu "đã gửi" chỉ chạy khi thật sự đã gửi', () => {
    const s = src();
    const iNhanhHong = s.indexOf('if (!daGui)');
    const iKhoe = s.indexOf('commands.confession.success_reply');
    assert.ok(iNhanhHong > -1 && iKhoe > -1, 'thiếu một trong hai mốc.');
    assert.ok(iNhanhHong < iKhoe,
        'Câu "đã gửi thành công" phải nằm SAU nhánh `if (!daGui)` — tức chỉ tới được khi\n'
        + 'nhánh hỏng đã `return`. Đặt trước là lại khoe vô điều kiện như bản cũ.');
});

test('mọi thứ có TÁC DỤNG PHỤ vẫn nằm sau cửa cooldown', () => {
    const s = src();
    // Dời phép ĐỌC lên trước cooldown thì vô hại. Nhưng nếu ai đó lỡ dời cả phần đốt số thứ
    // tự / ghi log lên theo, thì spam lệnh sẽ đốt số thứ tự vô hạn — mở ra đúng đường lạm
    // dụng mà cửa cooldown sinh ra để chặn.
    const iCoolDown = s.indexOf("db.claimCooldown(userId, 'confession'");
    for (const [ten, mau] of [['nextConfessionNumber', 'db.nextConfessionNumber('],
                              ['logConfession', 'db.logConfession('],
                              ['channel.send', 'await channel.send(']]) {
        const i = s.indexOf(mau);
        assert.ok(i > -1, `không thấy ${ten}.`);
        assert.ok(i > iCoolDown,
            `${ten} đang chạy TRƯỚC cửa cooldown. Mọi thứ có tác dụng phụ phải nằm SAU nó,\n`
            + 'nếu không thì spam lệnh sẽ đốt tài nguyên mà không bị chặn.');
    }
});

test('hai chuỗi mới phải nói rõ là bài CHƯA đăng, ở cả hai ngôn ngữ', () => {
    for (const ngu of ['vi', 'en']) {
        const c = require(`../src/locales/${ngu}.json`).commands.confession;

        for (const k of ['err_no_permission', 'err_send_failed']) {
            assert.ok(c[k], `${ngu}: thiếu commands.confession.${k}`);
        }
        // Người đọc phải hiểu ngay hai điều: bài KHÔNG đăng, và phải làm gì tiếp.
        const chuaDang = ngu === 'vi' ? /chưa (được )?đăng|gửi hụt|chưa đăng được/i : /didn't go up|did \*\*not\*\* go up|failed to post/i;
        for (const k of ['err_no_permission', 'err_send_failed']) {
            assert.match(c[k], chuaDang,
                `${ngu}/${k}: chưa nói rõ rằng bài KHÔNG được đăng. Người dùng sẽ tưởng nó đã lên.`);
        }
        assert.match(c.err_no_permission, /\{channel\}/,
            `${ngu}: err_no_permission phải cắm ô {channel} — nói "thiếu quyền" mà không nói ở\n`
            + 'kênh nào thì admin không biết đường sửa.');
    }
});
