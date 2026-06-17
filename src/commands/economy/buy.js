const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Mua vật phẩm trong cửa hàng')
        .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn mua').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1).setRequired(false)),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const items = await db.getItems();
        const choices = items
            .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
            .slice(0, 25)
            .map(i => ({ name: `${i.name} — ${Number(i.price).toLocaleString('vi-VN')} ${config.CURRENCY}`, value: i.id }));
        await interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();
        const itemId = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;

        const item = await db.getItem(itemId);
        if (!item) return interaction.editReply('Vật phẩm này không tồn tại trong cửa hàng 🤔');

        const result = await db.buyItem(interaction.user.id, itemId, qty);
        const total = (Number(item.price) * qty).toLocaleString('vi-VN');

        if (result === 'ok') {
            const embed = new EmbedBuilder()
                .setColor(config.COLORS.SUCCESS)
                .setDescription(`✅ Đã mua **${qty}× ${item.name}** với giá **${total}** ${config.CURRENCY}.`);
            return interaction.editReply({ embeds: [embed] });
        }

        const msg = {
            insufficient_funds: `Không đủ tiền 💸 — cần **${total}** ${config.CURRENCY} trong ví. Đi /work cày thêm đi!`,
            no_item: 'Vật phẩm không tồn tại.',
            bad_quantity: 'Số lượng không hợp lệ.',
        }[result] || 'Có lỗi xảy ra khi mua, thử lại sau.';
        return interaction.editReply(`💢 ${msg}`);
    },
};
