// ============================================================
// test/thanh_tuu_khong_khang_dinh_sai.test.js — `/achievements` không được nói người chơi
// đã nhận thưởng khi việc cộng tiền thất bại.
//
// VÌ SAO CÓ: `achievements.js` mở khoá thành tựu rồi mới cộng tiền, bằng HAI lời gọi rời
// nhau. Bản cũ bỏ qua giá trị trả về của `db.addMoney` — mà hàm đó trả boolean
// (`data !== null`, và `false` khi DB lỗi), nên hỏng là hoàn toàn phát hiện được.
//
// Vì sao nặng hơn các chỗ nuốt lỗi khác trong repo: thành tựu ĐÃ ghi nhận và không mở lại
// được, nên chạy `/achievements` lần nữa cũng KHÔNG trao lại. Tiền mất VĨNH VIỄN, không có
// đường đòi — trong khi màn hình vẫn khẳng định "đã nhận X xu".
//
// Quy mô: 30 thành tựu, tổng 446.000 xu, mốc lớn nhất 100.000 — gần 1/5 toàn bộ cung tiền
// của server lúc đo (505.755 xu).
//
// Chưa từng xảy ra (đo prod 2026-08-24: 6 lượt mở khoá / 4 người; 3 lượt sau khi
// `economy_ledger` ra đời đều có dòng trả tiền khớp giờ ±2 phút). Nhưng đây là lỗi CÂM —
// nếu xảy ra thì không ai biết, kể cả người mất tiền.
//
// CỔNG NÀY KHÔNG KHẲNG ĐỊNH ĐÃ VÁ XONG. Sửa trọn vẹn cần một RPC làm cả hai việc trong MỘT
// giao dịch; ở đây mới chỉ ngừng nói dối.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'achievements.js'), 'utf8'));

test('kết quả cộng tiền thưởng phải được GIỮ LẠI, không bỏ đi', () => {
    const s = src();
    assert.doesNotMatch(s, /^\s*if\s*\(\s*reward\s*>\s*0\s*\)\s*await\s+db\.addMoney\([^)]*\);\s*$/m,
        'Giá trị trả về của db.addMoney đang bị bỏ. Hàm đó trả `false` khi DB lỗi, và thành\n'
        + 'tựu thì đã ghi nhận không mở lại được — tiền mất vĩnh viễn mà màn hình vẫn báo đã nhận.');
    assert.match(s, /daTraThuong\s*=\s*reward\s*>\s*0\s*\?\s*await\s+db\.addMoney\(/,
        'Phải giữ kết quả db.addMoney vào một biến để nhánh dựng thông báo đọc được.');
});

test('thông báo lấy số tiền theo KẾT QUẢ THẬT, không theo số dự tính', () => {
    const s = src();
    assert.match(s, /reward:\s*fmt\(\s*daTraThuong\s*\?\s*reward\s*:\s*0\s*,/,
        'Ô `reward` trong thông báo phải phụ thuộc `daTraThuong`. In thẳng `reward` nghĩa là\n'
        + 'khẳng định người chơi đã nhận một con số mà ví họ không hề tăng.');
    assert.match(s, /if\s*\(\s*!daTraThuong\s*\)\s*lines\.push\(/,
        'Khi cộng tiền hỏng phải có thêm một dòng báo cho người chơi biết có trục trặc.');
});

test('KHÔNG được đảo thành trả-tiền-trước-ghi-nhận-sau', () => {
    const s = src();
    const iTra = s.indexOf('db.addMoney');
    const iGhi = s.indexOf('db.unlockAchievements');
    assert.ok(iGhi > -1 && iTra > -1, 'Không thấy đủ hai lời gọi.');
    assert.ok(iGhi < iTra,
        'Đang trả tiền TRƯỚC khi ghi nhận thành tựu. Nếu ghi nhận hỏng, người chơi chạy lại\n'
        + 'và nhận tiền lần nữa — máy in tiền, tệ hơn hẳn lỗi đang vá. Giữ thứ tự: ghi nhận\n'
        + 'trước, trả tiền sau.');
});

test('chỉ trao thưởng cho thành tựu THỰC SỰ vừa được chèn', () => {
    const s = src();
    // Chốt chống đua đã có sẵn từ trước; cổng này giữ nó khỏi bị gỡ khi ai đó dọn code.
    assert.match(s, /const\s+inserted\s*=\s*new\s+Set\(\s*await\s+db\.unlockAchievements\(/,
        'Phải dùng danh sách id RPC THỰC SỰ chèn được.');
    assert.match(s, /inserted\.has\(a\.id\)\s*\?\s*s\s*\+\s*\(a\.reward/,
        'Tiền thưởng phải cộng theo `inserted`, không theo danh sách ứng viên `newly` — hai\n'
        + 'lần gọi /achievements đua nhau sẽ trao thưởng trùng.');
});
