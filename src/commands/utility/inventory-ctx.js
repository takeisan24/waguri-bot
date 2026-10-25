// Context menu (chuột phải user -> Apps -> "View Inventory") — xem nhanh kho đồ người khác.
//
// Chỉ là lối vào cho `/inventory`, cùng kiểu với `profile-ctx.js` (đọc chú thích ở đó: tên
// tiếng Anh + dịch chữ hiển thị qua `CONTEXT_MENU_NAMES`, và vì sao không tự vẽ embed riêng).
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const inventory = require('../economy/inventory');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('View Inventory')
        .setType(ApplicationCommandType.User),
    execute: (interaction) => inventory.execute(interaction),
};
