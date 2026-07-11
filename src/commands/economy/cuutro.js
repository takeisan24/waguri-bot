const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const RELIEF_AMOUNT = 500;
const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cuutro')
        .setDescription('Nhận trợ cấp phá sản từ Waguri khi ví và ngân hàng hết sạch tiền 🌸'),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const userId = interaction.user.id;

        const result = await db.claimBankruptcyRelief(userId, RELIEF_AMOUNT);

        if (result === 'ok') {
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.cuutro.embed_title'),
                description: t(locale, 'commands.cuutro.success_desc', {
                    amount: fmt(RELIEF_AMOUNT, locale),
                    currency: config.CURRENCY
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result === 'not_bankrupt') {
            const user = await db.getUser(userId);
            const bal = Number(user?.wallet || 0) + Number(user?.bank || 0);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.cuutro.embed_title'),
                description: t(locale, 'commands.cuutro.err_not_bankrupt', {
                    bal: fmt(bal, locale),
                    currency: config.CURRENCY
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result === 'cooldown') {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.cuutro.embed_title'),
                description: t(locale, 'commands.cuutro.err_cooldown')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const embedErr = buildWaguriEmbed(interaction, 'error', {
            locale,
            title: t(locale, 'commands.cuutro.embed_title'),
            description: t(locale, 'commands.cuutro.err_system')
        });
        return interaction.editReply({ embeds: [embedErr] });
    }
};
