const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Tạo phòng riêng cho Waguri + hướng dẫn nhanh (cần quyền Quản lý Server)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(o => o.setName('channel').setDescription('Dùng kênh có sẵn thay vì tạo phòng mới').addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.setup.err_no_permission')
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();
        const guild = interaction.guild;
        const me = guild.members.me;

        // Ưu tiên kênh admin chỉ định; nếu không có thì tìm/ tạo kênh waguri-game
        let channel = interaction.options.getChannel('channel');
        if (!channel) {
            channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === 'waguri-game');
        }
        if (!channel) {
            if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    title: t(locale, 'commands.setup.embed_title_setup'),
                    description: t(locale, 'commands.setup.err_missing_manage_channels')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            try {
                channel = await guild.channels.create({
                    name: 'waguri-game',
                    type: ChannelType.GuildText,
                    topic: t(locale, 'commands.setup.channel_topic'),
                    reason: t(locale, 'commands.setup.channel_reason'),
                });
            } catch {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    title: t(locale, 'commands.setup.embed_title_setup'),
                    description: t(locale, 'commands.setup.err_create_channel_failed')
                });
                return interaction.editReply({ embeds: [embed] });
            }
        }

        // Đặt kênh này làm kênh trả lời AI mặc định (gọn gàng, đổi được bằng /config ai-channel)
        await db.setGuildSetting(guild.id, 'ai_channel', channel.id);

        const intro = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.setup.intro_title'),
            description: t(locale, 'commands.setup.intro_desc')
        });
        intro.setFooter({
            text: t(locale, 'commands.setup.intro_footer') + ` • ${intro.data.footer.text}`,
            iconURL: intro.data.footer.icon_url
        });
        await channel.send({ embeds: [intro] }).catch(() => {});

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: t(locale, 'commands.setup.success_title'),
            description: t(locale, 'commands.setup.success_desc', { channelId: channel.id })
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
