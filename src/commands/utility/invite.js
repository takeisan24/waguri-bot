const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, OAuth2Scopes } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Mời Waguri về server của cậu 🌸'),
    async execute(interaction) {
        await interaction.deferReply();
        // Quyền tối thiểu để bot chạy đủ tính năng (kể cả tạm giam = Moderate Members)
        const url = interaction.client.generateInvite({
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
            permissions: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AddReactions,
                PermissionFlagsBits.UseExternalEmojis,
                PermissionFlagsBits.ModerateMembers, // tạm giam (timeout) khi bị công an bắt
                PermissionFlagsBits.ManageChannels,   // /setup tạo phòng riêng
                // ManageRoles: bỏ tới khi có tính năng role-reward (least privilege; tránh admin ngại add bot)
            ],
        });
        const embed = buildWaguriEmbed(interaction, 'info', {
            title: '🌸・Mời Waguri về server',
            description: `[**Bấm vào đây để mời mình nha~**](${url})\n\nMình sẽ mang cả nền kinh tế, minigame và những cuộc trò chuyện dễ thương tới server của cậu! 💕`
        });
        embed.setFooter({
            text: `Cảm ơn cậu đã yêu mến Waguri! • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
