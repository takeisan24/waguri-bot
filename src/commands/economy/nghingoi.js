const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nghingoi')
        .setDescription('Đi ngủ một giấc để hồi đầy năng lượng 😴'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);

        const cd = await db.claimCooldown(interaction.user.id, 'sleep', config.SLEEP_COOLDOWN_SECONDS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: t(locale, 'commands.nghingoi.cooldown_title'),
                description: t(locale, 'commands.nghingoi.cooldown_desc', { time: Math.floor(cd / 1000) })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        await db.setEnergy(interaction.user.id, config.ENERGY.MAX);
        // Ngủ ngon = hồi cả sức khỏe (đỡ phải tốn viện phí /hospital). +100 sẽ kẹp về 100.
        await db.addHealth(interaction.user.id, 100);

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: t(locale, 'commands.nghingoi.success_title'),
            description: t(locale, 'commands.nghingoi.success_desc', { energy: config.ENERGY.MAX })
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
