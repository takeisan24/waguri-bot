const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Chợ mua bán đồ giữa người chơi 🛒')
        .addSubcommand(s => s.setName('view').setDescription('Xem các món đang bán'))
        .addSubcommand(s => s.setName('mine').setDescription('Xem các món cậu đang bán'))
        .addSubcommand(s => s.setName('sell').setDescription('Đăng bán một món trong kho')
            .addStringOption(o => o.setName('item').setDescription('Món muốn bán').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('price').setDescription('Giá bán (cả lô)').setRequired(true).setMinValue(config.MARKET.MIN_PRICE))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('buy').setDescription('Mua một món theo mã')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('cancel').setDescription('Gỡ món cậu đang bán (trả về kho)')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1))),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const inv = await db.getInventory(interaction.user.id);
        await interaction.respond(inv
            .filter(r => (r.items?.name || '').toLowerCase().includes(focused) || r.item_id.includes(focused))
            .slice(0, 25).map(r => ({ name: `${r.items?.name || r.item_id} (x${r.quantity})`, value: r.item_id })));
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const items = await db.getItems();
        const nameOf = id => items.find(i => i.id === id)?.name || id;

        if (sub === 'view' || sub === 'mine') {
            await interaction.deferReply();
            const rows = sub === 'mine' ? await db.marketMine(interaction.user.id) : await db.marketActive(50);
            if (!rows.length) return interaction.editReply(sub === 'mine' ? 'Cậu chưa đăng bán món nào~' : 'Chợ đang vắng, chưa ai bán gì cả~ 🌸');
            const lines = rows.map(r => `\`#${r.id}\` **${r.qty}× ${nameOf(r.item_id)}** — **${fmt(r.price)}** ${config.CURRENCY}${sub === 'view' ? ` · <@${r.seller_id}>` : ''}`);
            return sendPaginated(interaction, {
                title: sub === 'mine' ? '🛒 Món cậu đang bán' : '🛒 Chợ — đang bán',
                color: config.COLORS.INFO, lines, perPage: 10, footerNote: 'Mua: /market buy <mã>',
            });
        }

        await interaction.deferReply();
        if (sub === 'sell') {
            const itemId = interaction.options.getString('item');
            const price = interaction.options.getInteger('price');
            const qty = interaction.options.getInteger('qty') || 1;
            const r = await db.marketList(interaction.user.id, itemId, qty, price);
            if (!r) return interaction.editReply('Ơ, có lỗi khi đăng bán, thử lại sau nhé~');
            if (r.status === 'poor_item') return interaction.editReply(`Cậu không có đủ **${qty}× ${nameOf(itemId)}** trong kho~`);
            return interaction.editReply(`✅ Đã đăng bán **${qty}× ${nameOf(itemId)}** giá **${fmt(price)}** ${config.CURRENCY} (mã \`#${r.id}\`).\nNgười khác mua bằng \`/market buy ${r.id}\` · chợ thu phí ${Math.round(config.MARKET.FEE_PCT * 100)}% khi bán được.`);
        }
        if (sub === 'buy') {
            const id = interaction.options.getInteger('id');
            const r = await db.marketBuy(interaction.user.id, id);
            if (!r) return interaction.editReply('Ơ, có lỗi khi mua, thử lại sau nhé~');
            const msg = { notfound: 'Không tìm thấy món này~', gone: 'Món này đã bán/gỡ mất rồi 😢', own: 'Đây là món của chính cậu mà~ 😄', poor: `Cậu cần **${fmt(r.price)}** ${config.CURRENCY} để mua~ 😟` }[r.status];
            if (msg) return interaction.editReply(msg);
            return interaction.editReply(`✅ Cậu đã mua **${r.qty}× ${nameOf(r.item)}** với **${fmt(r.price)}** ${config.CURRENCY} từ <@${r.seller}>! Đồ đã vào kho 🎒`);
        }
        if (sub === 'cancel') {
            const id = interaction.options.getInteger('id');
            const r = await db.marketCancel(interaction.user.id, id);
            if (!r) return interaction.editReply('Ơ, có lỗi, thử lại sau nhé~');
            const msg = { notfound: 'Không tìm thấy món này~', notyours: 'Đây không phải món cậu đăng bán~', gone: 'Món này đã bán/gỡ rồi~' }[r.status];
            if (msg) return interaction.editReply(msg);
            return interaction.editReply(`✅ Đã gỡ **${r.qty}× ${nameOf(r.item)}** khỏi chợ, đồ trả về kho rồi nhé~`);
        }
    },
};
