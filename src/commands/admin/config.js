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
        .addSubcommand(s => s.setName('levelup').setDescription('Bật/tắt báo lên cấp khi trò chuyện')
            .addBooleanOption(o => o.setName('enabled').setDescription('Bật báo lên cấp?').setRequired(true)))
        .addSubcommand(s => s.setName('welcome-channel').setDescription('Đặt kênh chào mừng thành viên mới (bỏ trống để tắt)')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('welcome-role').setDescription('Đặt role tự động gán khi có người tham gia (bỏ trống để tắt)')
            .addRoleOption(o => o.setName('role').setDescription('Role gán tự động')))
        .addSubcommand(s => s.setName('goodbye-channel').setDescription('Đặt kênh tạm biệt thành viên rời server (bỏ trống để tắt)')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('announcement-channel').setDescription('Đặt kênh nhận thông báo cập nhật')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('language').setDescription('Đặt ngôn ngữ hiển thị cho bot (Set server language)')
            .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ / Language').setRequired(true)
                .addChoices(
                    { name: 'Tiếng Việt 🇻🇳', value: 'vi' },
                    { name: 'English 🇬🇧', value: 'en' }
                )))
        .addSubcommand(s => s.setName('staff-role').setDescription('Đặt role Staff được xem ticket hỗ trợ (bỏ trống để tự dò theo quyền)')
            .addRoleOption(o => o.setName('role').setDescription('Role Staff / Support role')))
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

        // MỘT CỬA GHI CẤU HÌNH.
        //
        // Bản cũ có 13 nhánh, mỗi nhánh tự gọi `db.setGuildSetting(...)` rồi tự dựng embed
        // 'success' — và KHÔNG nhánh nào kiểm kết quả ghi. `setGuildSetting` trả `false` khi
        // DB lỗi, nên lúc Supabase chập chờn admin đọc "✅ Đã tắt trò may rủi" trong khi
        // thật ra chưa tắt gì cả. Họ rời đi và tin rằng server đã được cấu hình xong.
        //
        // Đây KHÔNG phải bài học mới của repo: `antinuke.js:96` đã ghi đúng lý do này —
        // "báo đã bật lá chắn trong khi DB từ chối là kiểu thất bại tệ nhất của cả tính
        // năng". Chỉ là lúc đó áp cho antinuke mà quên config.
        //
        // Gom về một cửa thay vì chép `if` 13 lần: 13 bản sao là 13 chỗ có thể quên lại.
        const ghiCauHinh = async (khoa, giaTri, moTaOk) => {
            const daGhi = await db.setGuildSetting(gid, khoa, giaTri);
            return buildWaguriEmbed(interaction, daGhi ? 'success' : 'error', {
                locale,
                description: daGhi ? moTaOk : t(locale, 'commands.config.err_save_failed'),
            });
        };

        if (sub === 'confession-channel') {
            const ch = interaction.options.getChannel('channel');
            if (!ch) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.config.confession_err_channel_missing')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            return interaction.editReply({ embeds: [await ghiCauHinh('confession_channel', ch.id,
                t(locale, 'commands.config.confession_success', { channelId: ch.id }))] });
        }

        if (sub === 'ai') {
            const enabled = interaction.options.getBoolean('enabled');
            return interaction.editReply({ embeds: [await ghiCauHinh('ai_enabled', enabled ? '1' : '0',
                t(locale, 'commands.config.ai_success', {
                    status: enabled ? t(locale, 'commands.config.status_on') : t(locale, 'commands.config.status_off')
                }))] });
        }

        if (sub === 'ai-channel') {
            const ch = interaction.options.getChannel('channel');
            return interaction.editReply({ embeds: [await ghiCauHinh('ai_channel', ch ? ch.id : '',
                ch ? t(locale, 'commands.config.ai_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.ai_channel_removed'))] });
        }

        if (sub === 'pvp') {
            const enabled = interaction.options.getBoolean('enabled');
            return interaction.editReply({ embeds: [await ghiCauHinh('pvp', enabled ? '1' : '0',
                t(locale, 'commands.config.pvp_success', {
                    status: enabled ? t(locale, 'commands.config.status_on') : t(locale, 'commands.config.status_off')
                }))] });
        }

        if (sub === 'police-jail') {
            const enabled = interaction.options.getBoolean('enabled');
            return interaction.editReply({ embeds: [await ghiCauHinh('police_jail', enabled ? '1' : '0',
                enabled ? t(locale, 'commands.config.police_jail_on') : t(locale, 'commands.config.police_jail_off'))] });
        }

        if (sub === 'gambling') {
            const enabled = interaction.options.getBoolean('enabled');
            return interaction.editReply({ embeds: [await ghiCauHinh('gambling', enabled ? '1' : '0',
                enabled ? t(locale, 'commands.config.gambling_on') : t(locale, 'commands.config.gambling_off'))] });
        }

        if (sub === 'levelup') {
            const enabled = interaction.options.getBoolean('enabled');
            return interaction.editReply({ embeds: [await ghiCauHinh('levelup', enabled ? '1' : '0',
                t(locale, 'commands.config.levelup_success', {
                    status: enabled ? t(locale, 'commands.config.status_on') : t(locale, 'commands.config.status_off')
                }))] });
        }

        if (sub === 'welcome-channel') {
            const ch = interaction.options.getChannel('channel');
            return interaction.editReply({ embeds: [await ghiCauHinh('welcome_channel', ch ? ch.id : '',
                ch ? t(locale, 'commands.config.welcome_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.welcome_channel_removed'))] });
        }

        if (sub === 'welcome-role') {
            const role = interaction.options.getRole('role');
            return interaction.editReply({ embeds: [await ghiCauHinh('welcome_role', role ? role.id : '',
                role ? t(locale, 'commands.config.welcome_role_set', { roleId: role.id }) : t(locale, 'commands.config.welcome_role_removed'))] });
        }

        if (sub === 'goodbye-channel') {
            const ch = interaction.options.getChannel('channel');
            return interaction.editReply({ embeds: [await ghiCauHinh('goodbye_channel', ch ? ch.id : '',
                ch ? t(locale, 'commands.config.goodbye_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.goodbye_channel_removed'))] });
        }

        if (sub === 'announcement-channel') {
            const ch = interaction.options.getChannel('channel');
            return interaction.editReply({ embeds: [await ghiCauHinh('announcement_channel', ch ? ch.id : '',
                ch ? t(locale, 'commands.config.announcement_channel_set', { channelId: ch.id }) : t(locale, 'commands.config.announcement_channel_removed'))] });
        }

        if (sub === 'language') {
            const lang = interaction.options.getString('lang');
            return interaction.editReply({ embeds: [await ghiCauHinh('language', lang,
                lang === 'en'
                    ? t(locale, 'commands.config.language_success_en')
                    : t(locale, 'commands.config.language_success_vi'))] });
        }

        if (sub === 'staff-role') {
            // Bỏ trống = xoá cấu hình -> quay về tự dò theo QUYỀN `ManageThreads`, chứ không
            // phải dò theo tên role (cách cũ hỏng cả hai chiều, xem interactionCreate.js).
            const role = interaction.options.getRole('role');
            return interaction.editReply({ embeds: [await ghiCauHinh('staff_role_id', role ? role.id : null,
                role
                    ? t(locale, 'commands.config.staff_role_success', { role: role.id })
                    : t(locale, 'commands.config.staff_role_cleared'))] });
        }

        if (sub === 'view') {
            const s = await db.getGuildSettings(gid);
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.config.view_title'),
                fields: [
                    { name: t(locale, 'commands.config.field_confession_channel'), value: s.confession_channel ? `<#${s.confession_channel}>` : t(locale, 'commands.config.val_not_set') },
                    { name: t(locale, 'commands.config.field_ai_enabled'), value: s.ai_enabled === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_levelup'), value: s.levelup === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_ai_channel'), value: s.ai_channel ? `<#${s.ai_channel}>` : t(locale, 'commands.config.val_all_channels'), inline: true },
                    { name: t(locale, 'commands.config.field_pvp'), value: s.pvp === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_gambling'), value: s.gambling === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_police_jail'), value: s.police_jail === '0' ? t(locale, 'commands.config.status_disabled_emoji') : t(locale, 'commands.config.status_enabled_emoji'), inline: true },
                    { name: t(locale, 'commands.config.field_welcome_channel'), value: s.welcome_channel ? `<#${s.welcome_channel}>` : t(locale, 'commands.config.val_disabled_welcome'), inline: true },
                    { name: t(locale, 'commands.config.field_welcome_role'), value: s.welcome_role ? `<@&${s.welcome_role}>` : t(locale, 'commands.config.val_disabled_role'), inline: true },
                    { name: t(locale, 'commands.config.field_goodbye_channel'), value: s.goodbye_channel ? `<#${s.goodbye_channel}>` : t(locale, 'commands.config.val_disabled_goodbye'), inline: true },
                    { name: t(locale, 'commands.config.field_language'), value: s.language === 'en' ? '🇬🇧 English' : '🇻🇳 Tiếng Việt', inline: true },
                    { name: t(locale, 'commands.config.field_announcement_channel'), value: s.announcement_channel ? `<#${s.announcement_channel}>` : t(locale, 'commands.config.val_disabled_announcement'), inline: false }
                ]
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
