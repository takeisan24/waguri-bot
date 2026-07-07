const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('Hiển thị thông tin tổng quan về Server này'),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const guild = interaction.guild;
        
        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.server.title', { name: guild.name }),
            thumbnail: guild.iconURL({ dynamic: true }) || undefined,
            fields: [
                { name: t(locale, 'commands.server.owner'), value: `<@${guild.ownerId}>`, inline: true },
                { name: t(locale, 'commands.server.members'), value: `${guild.memberCount}`, inline: true },
                { name: t(locale, 'commands.server.created_at'), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: false }
            ]
        }).setTimestamp();

        embed.setFooter({
            text: t(locale, 'commands.server.requested_by', { user: interaction.user.tag, original: embed.data.footer.text }),
            iconURL: embed.data.footer.icon_url
        });

        await interaction.reply({ embeds: [embed] });
    },
};
