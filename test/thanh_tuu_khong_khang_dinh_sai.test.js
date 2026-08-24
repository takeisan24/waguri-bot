// ============================================================
// test/thanh_tuu_khong_khang_dinh_sai.test.js — `/achievements` không được mất tiền của
// người chơi, và không được nói họ đã nhận khi thật ra chưa.
//
// VÌ SAO CÓ: `achievements.js` từng mở khoá thành tựu rồi mới cộng tiền, bằng HAI lời gọi
// rời nhau, và bỏ qua giá trị trả về của `db.addMoney`. Thành tựu ĐÃ ghi nhận thì không mở
// lại được, nên chạy `/achievements` lần nữa cũng KHÔNG trao lại — tiền mất VĨNH VIỄN,
// không có đường đòi, trong khi màn hình vẫn khẳng định "đã nhận X xu".
//
// Quy mô: 30 thành tựu, tổng 446.000 xu, mốc lớn nhất 100.000 — gần 1/5 toàn bộ cung tiền
// server lúc đo (505.755 xu). Chưa từng xảy ra (prod 24-08: 6 lượt mở khoá / 4 người, các
// lượt sau khi có `economy_ledger` đều có dòng trả tiền khớp giờ). Nhưng đây là lỗi CÂM.
//
// ---------------------------------------------------------------------------------------
// GHI CHÚ VỀ LẦN VIẾT LẠI (24-08) — ĐỌC TRƯỚC KHI NGHI NGỜ BỊ NỚI TAY
//
// Bản đầu của cổng này (commit `eeeb151`) gác đúng ba tính chất dưới đây, nhưng gác bằng
// cách khớp CHÍNH XÁC hình dạng hai-lời-gọi:
//     assert.match(s, /daTraThuong\s*=\s*reward\s*>\s*0\s*\?\s*await\s+db\.addMoney\(/)
//     assert.ok(s.indexOf('db.unlockAchievements') < s.indexOf('db.addMoney'))
// Bản vá trọn vẹn GỠ BỎ chính hình dạng đó: hai lời gọi nay gộp thành một RPC
// (`unlock_achievements_with_reward`, migration 0141). Giữ nguyên các khẳng định cũ là buộc
// mã nguồn phải mang lại đúng cấu trúc gây ra lỗi.
//
// Nên cổng được viết lại để gác TÍNH CHẤT thay vì HÌNH DẠNG — và gác chặt hơn, không lỏng
// hơn: thứ tự "ghi nhận trước, trả tiền sau" nay nằm trong SQL nên cổng đọc luôn cả migration.
// ---------------------------------------------------------------------------------------
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'achievements.js'), 'utf8'));

/** Nội dung migration chứa RPC gộp — tìm theo TÊN HÀM, không ghim số hiệu tệp. */
function sqlRpc() {
    const dir = path.join(ROOT, 'supabase', 'migrations');
    // Lọc `.sql`: thư mục migrations có cả thư mục con, readFileSync sẽ ném EISDIR.
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        if (t.includes('function public.unlock_achievements_with_reward')) return t;
    }
    return null;
}

test('mở khoá và trả thưởng phải nằm trong MỘT giao dịch', () => {
    const s = src();
    assert.match(s, /db\.unlockAchievementsWithReward\(/,
        'Phải dùng RPC gộp. Hai lời gọi rời nhau thì chết ở giữa là mất tiền vĩnh viễn.');
    assert.doesNotMatch(s, /await\s+db\.addMoney\(/,
        'Còn gọi db.addMoney riêng ở đây nghĩa là đã tách lại thành hai bước — đúng lỗi đã vá.');
    assert.doesNotMatch(s, /await\s+db\.unlockAchievements\(/,
        'Còn gọi db.unlockAchievements riêng nghĩa là ghi nhận tách khỏi trả thưởng.');
});

test('LỖI DB phải phân biệt được với "không có thành tựu mới"', () => {
    const s = src();
    // Hàm bọc trả `null` khi DB lỗi, `{unlocked: [], paid: 0}` khi không có gì mới. Gộp hai
    // thứ đó lại chính là lớp lỗi gốc: `false`/rỗng vừa nghĩa "không đủ điều kiện" vừa
    // nghĩa "DB hỏng".
    assert.match(s, /if\s*\(\s*!\s*kq\s*\)/,
        'Phải kiểm kết quả RPC là null (lỗi DB) TRƯỚC khi đọc kq.unlocked/kq.paid.');
    assert.match(s, /daTraThuong\s*=\s*false/,
        'Lỗi DB phải hạ cờ daTraThuong để nhánh thông báo biết mà không khoe tiền.');
});

test('thông báo lấy số tiền theo KẾT QUẢ THẬT, không theo số dự tính', () => {
    const s = src();
    assert.match(s, /reward\s*=\s*Number\(\s*kq\.paid/,
        'Số tiền phải lấy từ `kq.paid` — số RPC đã cộng THẬT, không phải số mình tự tính.');
    assert.match(s, /reward:\s*fmt\(\s*daTraThuong\s*\?\s*reward\s*:\s*0\s*,/,
        'Ô `reward` trong thông báo phải phụ thuộc `daTraThuong`. In thẳng `reward` là khẳng\n'
        + 'định người chơi đã nhận một con số mà ví họ không hề tăng.');
    assert.match(s, /if\s*\(\s*!daTraThuong\s*\)\s*lines\.push\(/,
        'Khi trả thưởng hỏng phải có thêm một dòng báo cho người chơi biết có trục trặc.');
    assert.match(s, /!daTraThuong\s*&&\s*!newly\.length/,
        'Lỗi DB làm `newly` rỗng nên khối thông báo chính không chạy. Thiếu nhánh riêng thì\n'
        + 'người chơi TUYỆT ĐỐI không được biết gì — quay lại đúng lỗi mà eeeb151 đã vá.');
});

test('RPC: ghi nhận TRƯỚC, cộng tiền SAU — đảo lại là máy in tiền', () => {
    const sql = sqlRpc();
    assert.ok(sql, 'Không tìm thấy migration khai báo unlock_achievements_with_reward.');

    const iGhi = sql.indexOf('insert into achievements');
    const iTra = sql.indexOf('update users set wallet');
    assert.ok(iGhi > -1, 'RPC phải chèn vào bảng achievements.');
    assert.ok(iTra > -1, 'RPC phải cộng tiền vào ví.');
    assert.ok(iGhi < iTra,
        'RPC đang cộng tiền TRƯỚC khi ghi nhận. Nếu ghi nhận hỏng, người chơi chạy lại và\n'
        + 'nhận tiền lần nữa — máy in tiền, tệ hơn hẳn lỗi đang vá.');
});

test('RPC: chỉ trả thưởng cho thành tựu THỰC SỰ vừa chèn', () => {
    const sql = sqlRpc();
    assert.match(sql, /on conflict[\s\S]{0,80}do nothing[\s\S]{0,120}returning\s+achievement_id/i,
        'Phải lấy danh sách id từ `on conflict do nothing ... returning` — chỉ dòng THỰC SỰ\n'
        + 'chèn được mới tính. Hai lời gọi /achievements đua nhau sẽ trao thưởng trùng nếu\n'
        + 'cộng theo danh sách ứng viên gửi lên.');
    assert.match(sql, /sum\(\(p_rewards->>a\)::bigint\)[\s\S]{0,60}unnest\(v_new\)/i,
        'Tổng thưởng phải cộng theo `v_new` (id vừa chèn), không theo toàn bộ `p_rewards`.');
});

test('RPC: chặn thưởng ÂM và khoá quyền gọi', () => {
    const sql = sqlRpc();
    // Phía gọi truyền số tiền xuống, nên RPC là biên tin cậy duy nhất.
    assert.match(sql, /v_am\s*<\s*0[\s\S]{0,120}raise exception/i,
        'Thưởng âm sẽ TRỪ ví người chơi khi họ vừa đạt thành tựu. Phải chặn trong RPC.');
    assert.match(sql, /revoke all on function public\.unlock_achievements_with_reward/i,
        'Postgres mặc định cho PUBLIC quyền EXECUTE. Thiếu REVOKE là khoá công khai trong\n'
        + 'bundle web gọi được hàm ghi tiền — đúng lỗ hổng 0137/0138 vừa bịt.');
    assert.match(sql, /grant execute on function public\.unlock_achievements_with_reward[\s\S]{0,40}service_role/i,
        'Phải GRANT lại cho service_role, nếu không bot cũng không gọi được.');
});
