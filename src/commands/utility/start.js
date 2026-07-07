const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Bắt đầu cùng Waguri — nhận quà chào mừng & hướng dẫn 🌸'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const user = await db.getUser(interaction.user.id);
        const onboarded = !!user?.onboarded;

        const bonusText = onboarded
            ? t(locale, 'commands.start.onboarded_msg')
            : t(locale, 'commands.start.claim_prompt', { bonus: fmt(config.WELCOME.BONUS, locale), currency: config.CURRENCY });

        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.start.title'),
            description: t(locale, 'commands.start.desc', { bonus: bonusText })
        });

        const components = onboarded ? [] : [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('start:claim')
                    .setLabel(t(locale, 'commands.start.btn_label'))
                    .setStyle(ButtonStyle.Success)
            )
        ];
        await interaction.editReply({ embeds: [embed], components });
    },
};
