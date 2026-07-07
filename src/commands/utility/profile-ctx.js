// Context menu (chuột phải user -> Apps -> "Xem hồ sơ Waguri") — xem nhanh hồ sơ người khác.
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getProgress } = require('../../lib/leveling');
const { createWaguriBar, buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Xem hồ sơ Waguri')
        .setType(ApplicationCommandType.User),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const target = interaction.targetUser;
        if (target.bot) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: t(locale, 'commands.profile_ctx.err_bot')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const user = await db.getUser(target.id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.profile_ctx.err_no_data')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const p = getProgress(Number(user.exp));
        const energy = await db.getEnergy(target.id);
        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            fields: [
                { name: t(locale, 'commands.profile_ctx.wallet'), value: `${Number(user.wallet).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile_ctx.bank'), value: `${Number(user.bank).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile_ctx.energy'), value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: t(locale, 'commands.profile_ctx.level'), value: `Lv.${p.level}`, inline: true },
                { name: t(locale, 'commands.profile_ctx.exp_progress', { current: p.expIntoLevel, max: p.expForNextLevel }), value: createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12), inline: false },
            ],
        });
        embed.setAuthor({ name: t(locale, 'commands.profile_ctx.author_title', { user: target.username }), iconURL: target.displayAvatarURL() });
        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
