// ============================================================
// events/roleDelete.js — Lưới an toàn chống nuke cho việc xoá role (F9).
//
// Cặp với `channelDelete.js`: cả hai chỉ hoạt động khi bot KHÔNG có quyền View Audit
// Log — tức là khi `guildAuditLogEntryCreate` im lặng và ta mù về thủ phạm.
//
// Mù thủ phạm thì KHÔNG trừng phạt ai. Đoán bừa rồi ban nhầm một admin còn tệ hơn là
// không làm gì: hệ này sẽ khoá server và hét lên để người thật vào xử lý.
// `xuLyMatAuditLog` tự kiểm tra quyền, nên khi bot ĐÃ có quyền thì file này là no-op
// (nếu không sẽ đếm hai lần cùng một hành vi).
// ============================================================
const antinuke = require('../lib/antinuke');

module.exports = {
    name: 'roleDelete',
    async execute(role) {
        if (!role?.guild) return;
        antinuke.xuLyMatAuditLog(role.guild, 'role_delete').catch(() => {});
    },
};
