const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Bán vật phẩm trong kho (thu về 50% giá)')
        .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn bán').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1).setRequired(false)),

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
        const itemId = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await db.getItem(itemId);
        if (!item) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Bán Vật Phẩm', description: 'Mình không tìm thấy vật phẩm này~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }

        const r = await db.sellItem(interaction.user.id, itemId, qty);
        if (!r) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Bán Vật Phẩm', description: 'Ơ, có lỗi khi bán rồi, cậu thử lại sau nhé~' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (r.status !== 'ok') {
            const msg = {
                no_have: `Cậu không có đủ **${item.name}** trong kho để bán~`,
                no_item: 'Vật phẩm không tồn tại~',
                bad_quantity: 'Số lượng không hợp lệ~',
            }[r.status] || 'Ơ, có lỗi rồi, thử lại sau nhé~';
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Bán Vật Phẩm', description: msg });
            return interaction.editReply({ embeds: [embed] });
        }

        const u = await db.getUser(interaction.user.id);
        const embedSuccess = buildWaguriEmbed(interaction, 'success', {
            title: '🏪・Bán Vật Phẩm',
            description: `💰 Cậu đã bán **${qty}× ${item.name}** và thu về **${fmt(r.gain)}** ${config.CURRENCY}.\n💵 Số dư ví: **${fmt(u?.wallet || 0)}** ${config.CURRENCY}`
        });
        await interaction.editReply({ embeds: [embedSuccess] });
    },
};
