// Context menu (chuột phải user -> Apps -> "View Waguri Profile") — xem nhanh hồ sơ người khác.
//
// TÊN ĐỔI SANG TIẾNG ANH 2026-10-23, và ĐÂY LÀ NGOẠI LỆ DUY NHẤT của luật "tên lệnh không
// đổi theo ngôn ngữ": với lệnh slash, tên là thứ người ta GÕ nên phải cố định; với context
// menu, tên CHÍNH LÀ chữ hiển thị trong menu chuột phải — không ai gõ nó. Trước đây nó là
// "Xem hồ sơ Waguri" cho mọi locale, nên người dùng tiếng Anh click chuột phải cũng đọc
// tiếng Việt. `commandLocalizer` có bảng `CONTEXT_MENU_NAMES` riêng cho nhóm này.
//
// CHỈ LÀ LỐI VÀO, không tự vẽ gì: trước 2026-10-23 tệp này dựng embed riêng và là bản
// `/profile` bị cắt (thiếu nghề, chuyển sinh, tổng tài sản, huy hiệu, người yêu, link web) —
// chuột phải ra hồ sơ nghèo hơn gõ lệnh, và hai nơi cùng vẽ một hồ sơ thì sửa chỗ này quên
// chỗ kia. `/profile` đọc người được chọn từ `interaction.targetUser`.
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const profile = require('../economy/profile');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('View Waguri Profile')
        .setType(ApplicationCommandType.User),
    execute: (interaction) => profile.execute(interaction),
};
