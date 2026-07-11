const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Cấu hình bot cho server (cần quyền Quản lý Server)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(s => s.setName('confession-channel').setDescription('Đặt kênh đăng confession')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText).setRequired(true)))
        .addSubcommand(s => s.setName('ai').setDescription('Bật/tắt trò chuyện AI (khi @tag Waguri)')
            .addBooleanOption(o => o.setName('enabled').setDescription('Bật AI?').setRequired(true)))
        .addSubcommand(s => s.setName('ai-channel').setDescription('Giới hạn AI chỉ trả lời ở 1 kênh (bỏ trống = mọi kênh)')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh (bỏ trống để gỡ giới hạn)').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('pvp').setDescription('Bật/tắt PvP: cướp /rob + trộm heo/cây')
            .addBooleanOption(o => o.setName('enabled').setDescription('Bật PvP?').setRequired(true)))
        .addSubcommand(s => s.setName('police-jail').setDescription('Bật/tắt tạm giam (Discord timeout) khi công an kiểm tra trò may rủi')
            .addBooleanOption(o => o.setName('enabled').setDescription('Bật tạm giam?').setRequired(true)))
        .addSubcommand(s => s.setName('gambling').setDescription('Bật/tắt trò may rủi (bài cào, tài xỉu, xóc đĩa…)')
            .addBooleanOption(o => o.setName('enabled').setDescription('Bật trò may rủi?').setRequired(true)))
        .addSubcommand(s => s.setName('welcome-channel').setDescription('Đặt kênh chào mừng thành viên mới (bỏ trống để tắt)')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('welcome-role').setDescription('Đặt role tự động gán khi có người tham gia (bỏ trống để tắt)')
            .addRoleOption(o => o.setName('role').setDescription('Role gán tự động')))
        .addSubcommand(s => s.setName('announcement-channel').setDescription('Đặt kênh nhận thông báo cập nhật tự động của Waguri (bỏ trống để tắt)')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('language').setDescription('Đặt ngôn ngữ hiển thị cho bot (Set server language)')
            .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ / Language').setRequired(true)
                .addChoices(
                    { name: 'Tiếng Việt 🇻🇳', value: 'vi' },
                    { name: 'English 🇬🇧', value: 'en' }
                )))
        .addSubcommand(s => s.setName('view').setDescription('Xem cấu hình hiện tại')),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        // Tự enforce quyền (phòng trường hợp gọi qua prefix)
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.config.err_no_permission')
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();
        const gid = interaction.guild.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'confession-channel') {
            const ch = interaction.options.getChannel('channel');
            if (!ch) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.config.confession_err_channel_missing')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            await db.setGuildSetting(gid, 'confession_channel', ch.id);
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: t(locale, 'commands.config.confession_success', { channelId: ch.id })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'ai') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'ai_enabled', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: t(locale, 'commands.config.ai_success', {
                    status: enabled ? t(locale, 'commands.config.status_on') : t(locale, 'commands.config.status_off')
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'ai-channel') {
            const ch = interaction.options.getChannel('channel');
            await db.setGuildSetting(gid, 'ai_channel', ch ? ch.id : '');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: ch ? t(locale, 'commands.config.ai_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.ai_channel_removed')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'pvp') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'pvp', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: t(locale, 'commands.config.pvp_success', {
                    status: enabled ? t(locale, 'commands.config.status_on') : t(locale, 'commands.config.status_off')
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'police-jail') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'police_jail', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: enabled ? t(locale, 'commands.config.police_jail_on') : t(locale, 'commands.config.police_jail_off')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'gambling') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'gambling', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: enabled ? t(locale, 'commands.config.gambling_on') : t(locale, 'commands.config.gambling_off')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'welcome-channel') {
            const ch = interaction.options.getChannel('channel');
            await db.setGuildSetting(gid, 'welcome_channel', ch ? ch.id : '');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: ch ? t(locale, 'commands.config.welcome_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.welcome_channel_removed')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'welcome-role') {
            const role = interaction.options.getRole('role');
            await db.setGuildSetting(gid, 'welcome_role', role ? role.id : '');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: role ? t(locale, 'commands.config.welcome_role_set', { roleId: role.id }) : t(locale, 'commands.config.welcome_role_removed')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'announcement-channel') {
            const ch = interaction.options.getChannel('channel');
            await db.setGuildSetting(gid, 'announcement_channel', ch ? ch.id : '');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: ch ? t(locale, 'commands.config.announcement_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.announcement_channel_removed')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'language') {
            const lang = interaction.options.getString('lang');
            await db.setGuildSetting(gid, 'language', lang);
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: lang === 'en'
                    ? t(locale, 'commands.config.language_success_en')
                    : t(locale, 'commands.config.language_success_vi')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'view') {
            const s = await db.getGuildSettings(gid);
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.config.view_title'),
                fields: [
                    { name: t(locale, 'commands.config.field_confession_channel'), value: s.confession_channel ? `<#${s.confession_channel}>` : t(locale, 'commands.config.val_not_set') },
                    { name: t(locale, 'commands.config.field_ai_enabled'), value: s.ai_enabled === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_ai_channel'), value: s.ai_channel ? `<#${s.ai_channel}>` : t(locale, 'commands.config.val_all_channels'), inline: true },
                    { name: t(locale, 'commands.config.field_pvp'), value: s.pvp === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_gambling'), value: s.gambling === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_police_jail'), value: s.police_jail === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_welcome_channel'), value: s.welcome_channel ? `<#${s.welcome_channel}>` : t(locale, 'commands.config.val_disabled_welcome'), inline: true },
                    { name: t(locale, 'commands.config.field_welcome_role'), value: s.welcome_role ? `<@&${s.welcome_role}>` : t(locale, 'commands.config.val_disabled_role'), inline: true },
                    { name: t(locale, 'commands.config.field_language'), value: s.language === 'en' ? '🇬🇧 English' : '🇻🇳 Tiếng Việt', inline: true },
                    { name: t(locale, 'commands.config.field_announcement_channel'), value: s.announcement_channel ? `<#${s.announcement_channel}>` : t(locale, 'commands.config.val_disabled_announcement'), inline: false }
                ]
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
