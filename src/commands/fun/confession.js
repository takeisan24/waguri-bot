const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confession')
        .setDescription('Gửi confession ẩn danh (nên dùng /slash để ẩn danh)')
        .addStringOption(o => o.setName('message').setDescription('Điều cậu muốn gửi').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const locale = await getInteractionLanguage(interaction);
        const content = interaction.options.getString('message');
        const gid = interaction.guild?.id;
        if (!gid) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.confession.err_server_only')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 1. Chặn Mentions/Pings (User, Role, Everyone, Here)
        const hasEveryone = content.includes('@everyone') || content.includes('@here');
        const hasUserOrRoleMention = /<@&?\d+>|<@!\d+>/.test(content);
        if (hasEveryone || hasUserOrRoleMention) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.confession.err_mentions')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 2. Kiểm tra và đặt Cooldown (15 phút = 900 giây)
        const userId = interaction.user.id;
        const cooldownUntil = await db.claimCooldown(userId, 'confession', 900);
        if (cooldownUntil) {
            const remainSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
            const min = Math.floor(remainSec / 60);
            const sec = remainSec % 60;
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.confession.err_cooldown', { min, sec })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const s = await db.getGuildSettings(gid);
        if (!s.confession_channel) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.confession.err_not_configured')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const channel = interaction.guild.channels.cache.get(s.confession_channel)
            || await interaction.guild.channels.fetch(s.confession_channel).catch(() => null);
        if (!channel) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.confession.err_channel_deleted')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const num = await db.nextConfessionNumber(gid);

        // 3. Ghi log lưu vết confession ẩn danh cho admin
        await db.logConfession(gid, userId, num, content);

        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.confession.embed_title', { num }),
            description: content.slice(0, 4000)
        }).setTimestamp();

        embed.setFooter({
            text: t(locale, 'commands.confession.embed_footer') + ` • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });

        await channel.send({ embeds: [embed] }).catch(() => null);
        const successEmbed = buildWaguriEmbed(interaction, 'success', {
            description: t(locale, 'commands.confession.success_reply')
        });
        return interaction.editReply({ embeds: [successEmbed] });
    },
};
