const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hospital')
        .setDescription('🏥 Nhập viện hồi phục sức khỏe toàn diện (Viện phí cố định 3.000 VNĐ)'),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const userId = interaction.user.id;

        const result = await db.hospitalHeal(userId);
        if (!result) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.hospital.err_system')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result.status === 'already_healthy') {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.hospital.embed_title'),
                description: t(locale, 'commands.hospital.err_already_healthy')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result.status === 'insufficient_funds') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.hospital.embed_title'),
                description: t(locale, 'commands.hospital.err_poor', {
                    cost: fmt(result.fee, locale),
                    currency: config.CURRENCY
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (result.status === 'ok') {
            const u = await db.getUser(userId);
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.hospital.embed_title'),
                description: t(locale, 'commands.hospital.success_desc', {
                    fee: fmt(result.fee, locale),
                    wallet: fmt(u?.wallet || 0, locale),
                    bank: fmt(u?.bank || 0, locale),
                    currency: config.CURRENCY
                })
            }).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        const embed = buildWaguriEmbed(interaction, 'error', {
            locale,
            description: t(locale, 'commands.hospital.err_system')
        });
        return interaction.editReply({ embeds: [embed] });
    },
};
