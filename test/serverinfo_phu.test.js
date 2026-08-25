// ============================================================
// test/serverinfo_phu.test.js — `/serverinfo` phải báo ĐỦ mọi mục mà `/config` đặt được.
//
// VÌ SAO CÓ: `/serverinfo` là công cụ RÀ SOÁT — chủ server chạy nó để biết server đang
// cấu hình thế nào. Nhưng nó chỉ in 6 trong 13 mục: bảy mục welcome_channel,
// goodbye_channel, welcome_role, announcement_channel, staff_role_id, language, levelup
// không xuất hiện ở đâu cả.
//
// Hậu quả thật, ngày 21-08-2026: chủ dự án xuất báo cáo /serverinfo của server support để
// nhờ rà soát. Không ai trả lời được "kênh chào mừng đã cấu hình chưa" — không phải vì
// thiếu dữ liệu, mà vì công cụ không hỏi. Một lượt polish server bị chặn ở đó.
//
// Kiểu drift này tái diễn rất dễ: thêm `/config <mục mới>` là xong việc, chẳng ai nhớ
// phải cập nhật cả lệnh rà soát. `/config goodbye-channel` ra ở v2.5.0 chính là ví dụ —
// ra đời đã không được báo cáo.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', 'src', 'commands', 'admin');
const srcConfig = fs.readFileSync(path.join(GOC, 'config.js'), 'utf8');
const srcInfo = fs.readFileSync(path.join(GOC, 'serverinfo.js'), 'utf8');

/** Khoá guild_settings mà `/config` GHI.
 *
 * Bắt CẢ HAI hình dạng, vì `config.js` nay gom mọi lần ghi về một cửa chung:
 *   · `setGuildSetting(gid, 'khoa'` — lối gọi thẳng (còn dùng ở `setup.js`, `announcement.js`)
 *   · `ghiCauHinh('khoa'`          — cửa chung có KIỂM kết quả ghi
 *
 * Cửa chung ra đời vì bản cũ có 13 nhánh đều bỏ qua kết quả `setGuildSetting`, nên admin
 * đọc "✅ đã lưu" trong khi DB từ chối. Giữ cả hai mẫu ở đây để cổng vẫn đếm đủ 13 mục dù
 * sau này có nhánh viết theo lối nào.
 */
const khoaGhi = () => new Set([
    ...[...srcConfig.matchAll(/setGuildSetting\([^,]+,\s*'([a-z_]+)'/g)].map(m => m[1]),
    ...[...srcConfig.matchAll(/ghiCauHinh\('([a-z_]+)'/g)].map(m => m[1]),
]);

/** Khoá mà `/serverinfo` ĐỌC (biến `s` là object settings trong buildReport). */
const khoaDoc = () => new Set(
    [...srcInfo.matchAll(/\bs\.([a-z_]+)/g)].map(m => m[1]));

test('serverinfo: báo đủ MỌI mục mà /config đặt được', () => {
    const ghi = khoaGhi();
    const doc = khoaDoc();

    assert.ok(ghi.size >= 13,
        `Chỉ trích được ${ghi.size} khoá từ config.js — cách /config ghi setting đã đổi, cập nhật test.`);

    const sot = [...ghi].filter(k => !doc.has(k));
    assert.deepStrictEqual(sot, [],
        'Có mục /config đặt được mà /serverinfo KHÔNG báo: ' + sot.join(', ') + '\n' +
        'Chủ server không có cách nào rà soát những mục này. Thêm dòng push() tương ứng ' +
        'trong buildReport(). Báo cáo xuất ra file .md nên không vướng trần 1024 của embed.');
});

test('serverinfo: cảnh báo khi role thưởng cấp không tồn tại', () => {
    // `supportReward.js` làm `roles.cache.get(id)` rồi `if (role && …)`. Role không có ->
    // bỏ qua IM LẶNG, không lỗi, không log. Ngày 21-08 cả 5 role đều thiếu ở server
    // support và hệ thưởng theo cấp chưa từng chạy — không ai biết vì nó không kêu.
    // /serverinfo là chỗ duy nhất có thể phơi chuyện đó ra.
    assert.match(srcInfo, /ROLE_REWARDS/,
        '/serverinfo không còn kiểm role thưởng cấp — role thiếu sẽ lại chết câm.');
    assert.match(srcInfo, /MILESTONES/,
        '/serverinfo không duyệt MILESTONES nữa.');
    assert.match(srcInfo, /roles\.cache\.has/,
        '/serverinfo không còn kiểm sự tồn tại của role — chỉ liệt kê tên thì vô dụng.');
});

test('serverinfo: mục chưa đặt phải HIỆN RA, không được ẩn đi', () => {
    // Ẩn mục rỗng là cái bẫy: người đọc tưởng đã cấu hình xong. Mục chưa đặt mới là
    // thứ cần thấy nhất trong một bản rà soát.
    assert.match(srcInfo, /chưa đặt/,
        'Không còn nhãn "(chưa đặt)" — mục rỗng sẽ biến mất khỏi báo cáo thay vì hiện ra.');
    assert.match(srcInfo, /\(not set\)/,
        'Thiếu nhãn tiếng Anh tương ứng.');
});
