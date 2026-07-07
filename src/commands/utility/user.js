const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('user')
        .setDescription('Hiển thị thông tin và Avatar của một người dùng')
        .addUserOption(option => 
            option.setName('target')
                  .setDescription('Người dùng bạn muốn xem (để trống: xem chính mình)')
                  .setRequired(false)
        ),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const targetUser = interaction.options.getUser('target') || interaction.user;
        const targetMember = interaction.options.getMember('target') || interaction.member; // member dành riêng trên server này
        
        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.user.title', { user: targetUser.username }),
            image: targetUser.displayAvatarURL({ dynamic: true, size: 1024 }),
            fields: [
                { name: t(locale, 'commands.user.field_id'), value: targetUser.id, inline: true },
                { name: t(locale, 'commands.user.field_bot'), value: targetUser.bot ? t(locale, 'commands.user.bot_yes') : t(locale, 'commands.user.bot_no'), inline: true },
                { name: t(locale, 'commands.user.field_joined_discord'), value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:D>`, inline: false }
            ]
        }).setTimestamp();

        if (targetMember) {
            embed.addFields(
                { name: t(locale, 'commands.user.field_joined_server'), value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:D>`, inline: false }
            );
        }

        embed.setFooter({
            text: t(locale, 'commands.user.requested_by', { user: interaction.user.tag, original: embed.data.footer.text }),
            iconURL: embed.data.footer.icon_url
        });

        await interaction.reply({ embeds: [embed] });
    },
};
