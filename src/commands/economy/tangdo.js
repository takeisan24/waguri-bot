const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tangdo')
        .setDescription('Tặng vật phẩm trong kho cho người khác (hoa, thịt, đồ ăn...) 🎁')
        .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn tặng').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1)),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const inv = await db.getInventory(interaction.user.id);
        const choices = inv
            .filter(r => (r.items?.name || '').toLowerCase().includes(focused) || r.item_id.includes(focused))
            .slice(0, 25)
            .map(r => ({ name: `${r.items?.name || r.item_id} (x${r.quantity})`, value: r.item_id }));
        await interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('user');
        const itemId = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const err = (description) => interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🎁・Tặng vật phẩm', description })] });

        if (!target || target.bot) return err('Cậu muốn tặng cho ai? Gắn @người (không phải bot) nhé~ 🌸');
        if (target.id === interaction.user.id) return err('Tặng cho chính mình thì hơi kỳ á~ 😅');
        if (qty < 1) return err('Số lượng phải lớn hơn 0 nhé~');

        const item = await db.getItem(itemId);
        if (!item) return err('Mình không tìm thấy vật phẩm này~');

        await db.getUser(target.id); // đảm bảo người nhận có hồ sơ (tự tạo nếu chưa)
        const ok = await db.transferItem(interaction.user.id, target.id, itemId, qty);
        if (!ok) return err(`Cậu không có đủ **${item.name}** trong kho để tặng~`);

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '🎁・Tặng vật phẩm thành công',
            description: `Cậu đã tặng **${qty}× ${item.name}** cho <@${target.id}>. Tử tế và dễ thương ghê~ 🌸`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
