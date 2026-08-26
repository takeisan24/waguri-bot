// ============================================================
// test/staff_ticket_mot_nguon.test.js — "ai là staff" phải có MỘT câu trả lời duy nhất.
//
// VÌ SAO CÓ. `interactionCreate.js` từng trả lời câu đó theo HAI cách khác nhau, cách nhau
// ~120 dòng trong cùng một tệp:
//
//   · `handleTicketOpen` (ai được XEM ticket)  — hai tầng: `/config staff-role` đích danh,
//     rồi lui về quyền `ManageThreads`. Kèm chú thích dài giải thích vì sao bỏ lối dò theo
//     TÊN role.
//   · nút Nhận/Khoá (ai được XỬ LÝ ticket)     — vẫn giữ nguyên regex cũ
//     `/staff|support|mod|admin/i` trên tên role.
//
// HAI HẬU QUẢ, cả hai đều đo được thẳng từ mã:
//   1. `/config staff-role` KHÔNG hề ảnh hưởng tới nút. Admin đặt role `Hỗ trợ` làm staff
//      thì người của họ THẤY được ticket nhưng bấm Nhận bị từ chối — ticket nằm im.
//   2. Chiều ngược lại: role tên `admin-logs` (không phải staff) lại NHẬN được ticket.
//
// Đúng hai chiều hỏng mà chú thích ở `handleTicketOpen` đã mô tả — chỉ là bản vá hôm đó
// chưa với tới hai nút.
//
// Cổng này kiểm HÀNH VI (gọi thật `laStaffTicket` với guild/member giả) chứ không so khớp
// hình dạng chữ, vì thứ cần giữ là câu trả lời, không phải cách viết.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { PermissionsBitField } = require('discord.js');

const ROOT = path.join(__dirname, '..');
const { layRoleStaff, laStaffTicket } = require('../src/events/interactionCreate');

const F = PermissionsBitField.Flags;

/** Role giả. `perms` là mảng cờ quyền. */
const role = (id, name, perms = [], managed = false) => ({
    id, name, managed,
    permissions: { has: f => perms.includes(f) },
});

/** Guild giả với một bộ role. `cache` phải có `.filter().first(n)` và `.get()`. */
function guildGia(roles) {
    const cache = {
        get: id => roles.find(r => r.id === id) || undefined,
        filter(fn) {
            const ds = roles.filter(fn);
            return { first: n => ds.slice(0, n) };
        },
    };
    return { id: 'G', roles: { cache } };
}

/** Member giả: quyền hiệu lực + danh sách role đang mang. */
const member = (perms, roleIds = []) => ({
    permissions: { has: f => perms.includes(f) },
    roles: { cache: { has: id => roleIds.includes(id) } },
});

// `layRoleStaff` đọc `db.getGuildSettings`. Thay bằng bản giả để test không chạm mạng.
//
// PHẢI ghi đè THUỘC TÍNH trên chính object exports, không thay cả `require.cache[...].exports`:
// `interactionCreate.js` đã `require('../database.js')` lúc nạp module và giữ tham chiếu cũ,
// nên đổi cả object chỉ ảnh hưởng những ai require SAU đó. (Bản đầu của cổng này làm vậy và
// hai phép kiểm im lặng đọc phải cấu hình thật.)
const db = require('../src/database.js');
const getGuildSettingsThat = db.getGuildSettings;
const datCauHinh = (settings) => { db.getGuildSettings = async () => settings; };
test.after(() => { db.getGuildSettings = getGuildSettingsThat; });

test('tầng 1: /config staff-role được TÔN TRỌNG ở nút Nhận/Khoá', async () => {
    // Đây là hậu quả #1 của lỗi cũ: khoá cấu hình chỉ có tác dụng ở đường XEM.
    datCauHinh({ staff_role_id: 'R_HOTRO' });
    const g = guildGia([role('R_HOTRO', 'Hỗ trợ')]);

    const nhanVien = member([], ['R_HOTRO']);   // KHÔNG có quyền gì đặc biệt, chỉ mang role
    assert.strictEqual(await laStaffTicket(g, nhanVien, PermissionsBitField), true,
        'Role được admin chỉ đích danh qua `/config staff-role` phải NHẬN được ticket.\n'
        + 'Bản cũ bỏ qua hẳn khoá này ở nút, nên staff thấy ticket mà không xử lý được.');

    const nguoiLa = member([], ['R_KHAC']);
    assert.strictEqual(await laStaffTicket(g, nguoiLa, PermissionsBitField), false,
        'Người không mang role staff đã cấu hình thì không được nhận ticket.');
});

test('không còn dò theo TÊN role — cả hai chiều', async () => {
    datCauHinh({});   // chưa cấu hình -> rơi xuống tầng 2 (theo QUYỀN)
    const g = guildGia([
        role('R_LOG', 'admin-logs'),                 // tên khớp regex cũ, KHÔNG có quyền gì
        role('R_VN', 'Nhân viên', [F.ManageThreads]), // tên tiếng Việt, CÓ quyền thật
    ]);

    // Chiều dương tính giả: `admin-logs` từng lọt qua regex `/admin/i`.
    const gia = member([], ['R_LOG']);
    assert.strictEqual(await laStaffTicket(g, gia, PermissionsBitField), false,
        'Role tên `admin-logs` không phải staff — regex cũ cho nó nhận ticket, tức lộ quyền\n'
        + 'xử lý ticket riêng tư cho người không được trao quyền.');

    // Chiều âm tính giả: role tiếng Việt có quyền thật nhưng tên không khớp regex tiếng Anh.
    const that = member([], ['R_VN']);
    assert.strictEqual(await laStaffTicket(g, that, PermissionsBitField), true,
        'Role `Nhân viên` CÓ quyền ManageThreads nên là staff thật. Regex tiếng Anh bỏ sót\n'
        + 'nó — mà đây là bot tiếng Việt, nên đó mới là chiều hỏng phổ biến.');
});

test('nhận CẢ ManageThreads lẫn ManageChannels (không siết nhầm người đang dùng được)', async () => {
    datCauHinh({});
    const g = guildGia([]);
    for (const [ten, quyen] of [['ManageThreads', F.ManageThreads], ['ManageChannels', F.ManageChannels]]) {
        assert.strictEqual(await laStaffTicket(g, member([quyen]), PermissionsBitField), true,
            `Người có ${ten} phải là staff. Đường XEM cấp quyền theo ManageThreads, còn bản cũ\n`
            + 'của nút xét ManageChannels — chấp nhận cả hai để không ai đang bấm được mà mất quyền.');
    }
    assert.strictEqual(await laStaffTicket(g, member([]), PermissionsBitField), false,
        'Không quyền, không role staff -> không phải staff.');
});

test('layRoleStaff: tầng 1 thay hẳn tầng 2, và bỏ role managed', async () => {
    datCauHinh({ staff_role_id: 'R_CAUHINH' });
    const g = guildGia([
        role('R_CAUHINH', 'Staff'),
        role('R_KHAC', 'Mod', [F.ManageThreads]),
    ]);
    const ds = await layRoleStaff(g, PermissionsBitField);
    assert.deepStrictEqual(ds.map(r => r.id), ['R_CAUHINH'],
        'Cấu hình đích danh phải THAY hẳn lối tự dò, không phải gộp thêm.');

    datCauHinh({});
    const g2 = guildGia([
        role('G', '@everyone', [F.ManageThreads]),          // chính là guild.id -> bỏ
        role('R_BOT', 'BotRole', [F.ManageThreads], true),  // managed -> bỏ
        role('R_OK', 'Mod', [F.ManageThreads]),
    ]);
    const ds2 = await layRoleStaff(g2, PermissionsBitField);
    assert.deepStrictEqual(ds2.map(r => r.id), ['R_OK'],
        '@everyone và role `managed` (role tích hợp của bot) không được tính là staff.');
});

test('mã không còn lối dò theo tên, và mọi nút đều đi qua một cửa', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'events', 'interactionCreate.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');   // bỏ chú thích

    assert.doesNotMatch(s, /\/staff\|support\|mod\|admin\/i/,
        'Regex dò theo TÊN role đã quay lại. Nó hỏng cả hai chiều — xem chú thích đầu tệp này.');

    const soCua = (s.match(/await laStaffTicket\(/g) || []).length;
    assert.strictEqual(soCua, 2,
        `Có ${soCua} nút xét quyền staff, cổng đang canh 2 (Nhận + Khoá). Thêm nút thứ ba mà\n`
        + 'không đi qua `laStaffTicket` là mở lại đúng lối lệch vừa vá.');
});
