const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', misc: '📦' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem kho đồ')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;

        const inv = await db.getInventory(target.id);

        const embed = new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setAuthor({ name: `Kho đồ của ${target.username}`, iconURL: target.displayAvatarURL() });

        if (!inv.length) {
            embed.setDescription('Trống trơn... đi /work kiếm tiền rồi /shop mua đồ đi! 💢');
        } else {
            embed.setDescription(inv
                .map(r => `${TYPE_ICON[r.items?.type] || '📦'} **${r.items?.name || r.item_id}** ×${r.quantity}`)
                .join('\n'));
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
