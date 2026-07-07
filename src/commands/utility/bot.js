const { SlashCommandBuilder, PermissionFlagsBits, OAuth2Scopes } = require('discord.js');
const { buildWaguriEmbed, pickWaguriImage } = require('../../lib/embed');
const config = require('../../config');
const { version } = require('../../../package.json');
const { getInteractionLanguage, t } = require('../../lib/i18n');

function fmtUptime(ms) {
    let s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    return [d && `${d}d`, h && `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Thông tin, trạng thái và lời mời của bot 🤖')
        .addSubcommand(s => s.setName('ping').setDescription('Kiểm tra độ trễ & trạng thái của bot'))
        .addSubcommand(s => s.setName('about').setDescription('Giới thiệu Waguri & thông tin nhà phát triển 🌸'))
        .addSubcommand(s => s.setName('support').setDescription('Nhận trợ giúp & vào server hỗ trợ Waguri 🛟'))
        .addSubcommand(s => s.setName('invite').setDescription('Mời Waguri về server của cậu 🌸')),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const c = interaction.client;

        if (sub === 'ping') {
            const start = Date.now();
            await interaction.editReply({ content: t(locale, 'commands.bot.ping.measuring') });
            const rtt = Date.now() - start;
            const ws = Math.round(c.ws.ping);

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.bot.ping.title'),
                fields: [
                    { name: t(locale, 'commands.bot.ping.field_api'), value: ws < 0 ? t(locale, 'commands.bot.ping.measuring_api') : `${ws}ms`, inline: true },
                    { name: t(locale, 'commands.bot.ping.field_response'), value: `${rtt}ms`, inline: true },
                    { name: t(locale, 'commands.bot.ping.field_uptime'), value: fmtUptime(c.uptime), inline: true }
                ]
            });
            embed.setFooter({
                text: t(locale, 'commands.bot.ping.footer', { original: embed.data.footer.text }),
                iconURL: embed.data.footer.icon_url
            });
            await interaction.editReply({ content: '', embeds: [embed] });
        }

        if (sub === 'about') {
            const voteUrl = `https://top.gg/bot/${c.user.id}/vote`;
            const support = process.env.SUPPORT_INVITE;

            const links = [
                t(locale, 'commands.bot.about.link_vote', { url: voteUrl }),
                t(locale, 'commands.bot.about.link_invite')
            ];
            if (support) links.push(t(locale, 'commands.bot.about.link_support', { url: support }));

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.bot.about.title'),
                thumbnail: pickWaguriImage('MAIN'),
                description: t(locale, 'commands.bot.about.desc'),
                fields: [
                    { name: t(locale, 'commands.bot.about.field_creator'), value: `**${config.CREATOR}**`, inline: true },
                    { name: t(locale, 'commands.bot.about.field_version'), value: `v${version}`, inline: true },
                    { name: t(locale, 'commands.bot.about.field_guilds'), value: t(locale, 'commands.bot.about.guilds_val', { count: c.guilds.cache.size }), inline: true },
                    { name: t(locale, 'commands.bot.about.field_links'), value: links.join('\n') },
                ],
            });
            embed.setFooter({
                text: t(locale, 'commands.bot.about.footer', { creator: config.CREATOR }),
                iconURL: c.user.displayAvatarURL(),
            });
            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'support') {
            const inv = process.env.SUPPORT_INVITE;
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.bot.support.title'),
                description: inv
                    ? t(locale, 'commands.bot.support.desc', { url: inv })
                    : t(locale, 'commands.bot.support.desc_no_url'),
            });
            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'invite') {
            const url = c.generateInvite({
                scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
                permissions: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AddReactions,
                    PermissionFlagsBits.UseExternalEmojis,
                    PermissionFlagsBits.ModerateMembers,
                    PermissionFlagsBits.ManageChannels,
                ],
            });
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.bot.invite.title'),
                description: t(locale, 'commands.bot.invite.desc', { url })
            });
            embed.setFooter({
                text: t(locale, 'commands.bot.invite.footer', { original: embed.data.footer.text }),
                iconURL: embed.data.footer.icon_url
            });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
