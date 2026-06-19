const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
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
        if (!item) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Mua Vật Phẩm', description: 'Vật phẩm này không tồn tại trong cửa hàng 🤔' });
            return interaction.editReply({ embeds: [embed] });
        }

        const result = await db.buyItem(interaction.user.id, itemId, qty);
        const total = (Number(item.price) * qty).toLocaleString('vi-VN');

        if (result === 'ok') {
            const u = await db.getUser(interaction.user.id);
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🏪・Mua Vật Phẩm',
                description: `Đã mua **${qty}× ${item.name}** với giá **${total}** ${config.CURRENCY}.\n💵 Số dư ví: **${Number(u?.wallet || 0).toLocaleString('vi-VN')}** ${config.CURRENCY}`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const msg = {
            insufficient_funds: `Ví cậu chưa đủ tiền rồi 😟 — cần **${total}** ${config.CURRENCY}. Làm thêm vài việc với \`/work\` là mua được thôi mà!`,
            no_item: 'Mình không tìm thấy vật phẩm này trong cửa hàng~',
            bad_quantity: 'Số lượng chưa hợp lệ nè, cậu nhập lại giúp mình nhé~',
        }[result] || 'Ơ, có lỗi khi mua rồi, cậu thử lại sau nhé~';

        const embedErr = buildWaguriEmbed(interaction, 'error', { title: '🏪・Mua Vật Phẩm', description: msg });
        return interaction.editReply({ embeds: [embedErr] });
    },
};
