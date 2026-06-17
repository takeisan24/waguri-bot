const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', property: '🏠', luxury: '💎', misc: '📦' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Xem cửa hàng vật phẩm'),
    async execute(interaction) {
        await interaction.deferReply();

        const items = await db.getItems();
        if (!items.length) return interaction.editReply('Cửa hàng đang trống trơn... 🕸️');

        const lines = items.map(i =>
            `${TYPE_ICON[i.type] || '📦'} **${i.name}** — \`${Number(i.price).toLocaleString('vi-VN')}\` ${config.CURRENCY}\n` +
            `　↳ \`${i.id}\`${i.description ? ` · ${i.description}` : ''}`
        );

        await sendPaginated(interaction, {
            title: '🏪 Cửa Hàng Waguri',
            color: config.COLORS.INFO,
            lines,
            perPage: 6,
            footerNote: 'Mua: /buy <item>',
        });
    },
};
