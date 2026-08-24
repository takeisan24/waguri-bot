const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Chuyển tiền (trong ví) cho người khác')
        .addUserOption(o => o.setName('target').setDescription('Người nhận').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(1)),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const target = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.give.embed_title_warning'),
                description: t(locale, 'commands.give.err_target_missing')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.bot) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.give.embed_title_warning'),
                description: t(locale, 'commands.give.err_bot')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.id === interaction.user.id) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.give.embed_title_warning'),
                description: t(locale, 'commands.give.err_self')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!amount || amount <= 0) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.give.embed_title_warning'),
                description: t(locale, 'commands.give.err_invalid_amount')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const tax = Math.floor(amount * config.GIVE_TAX_PCT);
        const received = amount - tax;

        // BA giá trị: `true` = xong, `false` = không đủ tiền, `null` = KHÔNG BIẾT vì DB lỗi.
        // Gộp hai cái sau là nói sai về số dư của chính người dùng lúc Supabase chập chờn.
        const kq = await db.transferMoneyWithTax(interaction.user.id, target.id, amount, config.GIVE_TAX_PCT);
        if (kq !== true) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.give.embed_title_warning'),
                description: kq === null
                    ? t(locale, 'common.retry_later')
                    : t(locale, 'commands.give.err_poor')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const me = await db.getUser(interaction.user.id);

        let desc;
        if (tax > 0) {
            desc = t(locale, 'commands.give.success_desc', {
                target: target.id,
                taxPct: Math.round(config.GIVE_TAX_PCT * 100),
                tax: fmt(tax, locale),
                received: fmt(received, locale),
                wallet: fmt(me?.wallet || 0, locale),
                currency: config.CURRENCY
            });
        } else {
            desc = t(locale, 'commands.give.success_desc_no_tax', {
                target: target.id,
                received: fmt(received, locale),
                wallet: fmt(me?.wallet || 0, locale),
                currency: config.CURRENCY
            });
        }

        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.give.success_title'),
            description: desc
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
