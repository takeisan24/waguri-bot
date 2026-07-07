const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', property: '🏠', luxury: '💎', misc: '📦' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Xem kho đồ')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const target = interaction.options.getUser('target') || interaction.user;

        const inv = await db.getInventory(target.id);
        if (!inv.length) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.inventory.empty_title'),
                description: t(locale, 'commands.inventory.empty_desc', { user: target.username })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const lines = inv.map(r => {
            const name = t(locale, `data.items.${r.item_id}.name`) || r.items?.name || r.item_id;
            return `${TYPE_ICON[r.items?.type] || '📦'} **${name}** ×${r.quantity}`;
        });

        await sendPaginated(interaction, {
            title: t(locale, 'commands.inventory.title', { user: target.username }),
            color: config.COLORS.INFO,
            lines,
            perPage: 12,
            thumbnail: target.displayAvatarURL(),
        });
    },
};
