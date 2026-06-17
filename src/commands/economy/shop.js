const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', misc: '📦' };

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

        const embed = new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setTitle('🏪 Cửa Hàng Waguri')
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Mua bằng: /buy <item>' });

        await interaction.editReply({ embeds: [embed] });
    },
};
