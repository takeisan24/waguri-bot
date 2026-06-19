const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', property: '🏠', luxury: '💎', misc: '📦' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem kho đồ')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;

        const inv = await db.getInventory(target.id);
        if (!inv.length) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: 'backpack・Kho đồ trống',
                description: `Kho của **${target.username}** đang trống nè~ Đi \`/work\` rồi ghé \`/shop\` sắm đồ nhé! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const lines = inv.map(r => `${TYPE_ICON[r.items?.type] || '📦'} **${r.items?.name || r.item_id}** ×${r.quantity}`);

        await sendPaginated(interaction, {
            title: `🎒 Kho đồ của ${target.username}`,
            color: config.COLORS.INFO,
            lines,
            perPage: 12,
            thumbnail: target.displayAvatarURL(),
        });
    },
};
