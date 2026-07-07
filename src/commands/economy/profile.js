const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getProgress } = require('../../lib/leveling');
const { createWaguriBar, getWaguriFooter, buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem hồ sơ tổng quan')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const target = interaction.options.getUser('target') || interaction.user;
        const user = await db.getUser(target.id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.db_error')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const energy = await db.getEnergy(target.id);
        const job = user.job_id ? await db.getJob(user.job_id) : null;
        const p = getProgress(Number(user.exp));
        const wallet = Number(user.wallet), bank = Number(user.bank);
        const networth = wallet + bank;

        const HEX = /^[0-9a-fA-F]{6}$/;
        const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();

        const numFmt = locale === 'en' ? 'en-US' : 'vi-VN';
        const jobName = job ? (t(locale, `data.jobs.${job.id}.name`) || job.name) : t(locale, 'commands.profile.no_job');

        const embed = buildWaguriEmbed(interaction, premium ? 'jackpot' : 'info', {
            locale,
            title: t(locale, 'commands.profile.title', { user: target.username }) + (premium ? ' 💎' : ''),
            description: user.title ? `🏷️ *${user.title}*` : undefined,
            thumbnail: target.displayAvatarURL(),
            fields: [
                { name: t(locale, 'commands.profile.fields.job'), value: jobName, inline: true },
                { name: t(locale, 'commands.profile.fields.level'), value: `Lv.${p.level}`, inline: true },
                { name: t(locale, 'commands.profile.fields.energy'), value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: t(locale, 'commands.profile.fields.wallet'), value: `${wallet.toLocaleString(numFmt)} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile.fields.bank'), value: `${bank.toLocaleString(numFmt)} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile.fields.networth'), value: `${networth.toLocaleString(numFmt)} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile.fields.progress', { current: p.expIntoLevel, total: p.expForNextLevel }), value: `${createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12)}`, inline: false },
            ],
        });
        // Màu hồ sơ tuỳ chỉnh (cosmetic) ghi đè màu theo type
        if (user.profile_color && HEX.test(user.profile_color)) embed.setColor(parseInt(user.profile_color, 16));

        if (user.partner_id) {
            embed.addFields({ name: t(locale, 'commands.profile.fields.partner'), value: t(locale, 'commands.profile.partner_desc', { user: user.partner_id, score: Number(user.love || 0) }), inline: false });
        }

        // Link hồ sơ web (share được)
        const isSelf = target.id === interaction.user.id;
        const isPublic = user.profile_public !== false;
        if (isPublic) {
            embed.addFields({ name: t(locale, 'commands.profile.fields.web_profile'), value: `[waguri-bot.vercel.app/u/${target.id}](https://waguri-bot.vercel.app/u/${target.id})`, inline: false });
        } else if (isSelf) {
            embed.addFields({ name: t(locale, 'commands.profile.fields.web_profile'), value: t(locale, 'commands.profile.web_profile_hidden'), inline: false });
        }

        const footerObj = getWaguriFooter(interaction.client, locale);
        if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
            const pct = Math.round((Number(user.buff_mult) - 1) * 100);
            footerObj.text = t(locale, 'commands.profile.buff_active', { pct }) + ' · ' + footerObj.text;
        }
        embed.setFooter(footerObj).setTimestamp();

        // Chủ hồ sơ được nút bật/tắt hiển thị web
        const components = isSelf
            ? [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('profile:toggle')
                    .setLabel(isPublic ? t(locale, 'commands.profile.btn_hide') : t(locale, 'commands.profile.btn_show'))
                    .setStyle(ButtonStyle.Secondary))]
            : [];

        await interaction.editReply({ embeds: [embed], components });
    },
};
