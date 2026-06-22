const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');

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
        .addSubcommand(s => s.setName('view').setDescription('Xem cấu hình hiện tại')),
    async execute(interaction) {
        // Tự enforce quyền (phòng trường hợp gọi qua prefix)
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Cần quyền **Quản lý Server** để dùng lệnh này nhé~ 🌸'
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
                    description: 'Cậu chưa chọn kênh~ (nhập #kênh)'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            await db.setGuildSetting(gid, 'confession_channel', ch.id);
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: `✅ Đã đặt kênh confession là <#${ch.id}>.`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'ai') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'ai_enabled', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: `✅ Đã **${enabled ? 'BẬT' : 'TẮT'}** trò chuyện AI (@tag Waguri) ở server này.`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'ai-channel') {
            const ch = interaction.options.getChannel('channel');
            await db.setGuildSetting(gid, 'ai_channel', ch ? ch.id : '');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: ch ? `✅ AI giờ chỉ trả lời trong <#${ch.id}>.` : '✅ Đã gỡ giới hạn kênh — AI trả lời ở mọi kênh.'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'pvp') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'pvp', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: `✅ Đã **${enabled ? 'BẬT' : 'TẮT'}** PvP (cướp /rob + trộm heo/cây) ở server này.`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'police-jail') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'police_jail', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: `✅ Đã **${enabled ? 'BẬT' : 'TẮT'}** tạm giam (Discord timeout) khi công an kiểm tra trò may rủi.${enabled ? '' : ' Giờ chỉ phạt tiền, không timeout nữa.'}`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'gambling') {
            const enabled = interaction.options.getBoolean('enabled');
            await db.setGuildSetting(gid, 'gambling', enabled ? '1' : '0');
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: `✅ Đã **${enabled ? 'BẬT' : 'TẮT'}** trò may rủi (bài cào, tài xỉu, xóc đĩa…) ở server này.${enabled ? '' : ' Các lệnh chơi sẽ bị từ chối nhẹ nhàng.'}`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'view') {
            const s = await db.getGuildSettings(gid);
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '⚙️ Cấu hình server',
                fields: [
                    { name: 'Kênh confession', value: s.confession_channel ? `<#${s.confession_channel}>` : '*(chưa đặt)*' },
                    { name: 'AI trò chuyện', value: s.ai_enabled === '0' ? '🔴 Tắt' : '🟢 Bật', inline: true },
                    { name: 'Kênh AI', value: s.ai_channel ? `<#${s.ai_channel}>` : '*(mọi kênh)*', inline: true },
                    { name: 'PvP (cướp/trộm)', value: s.pvp === '0' ? '🔴 Tắt' : '🟢 Bật', inline: true },
                    { name: 'Trò may rủi', value: s.gambling === '0' ? '🔴 Tắt' : '🟢 Bật', inline: true },
                    { name: 'Tạm giam (trò may rủi)', value: s.police_jail === '0' ? '🔴 Tắt' : '🟢 Bật', inline: true }
                ]
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
