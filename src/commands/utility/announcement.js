const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Xem hoặc gửi thông báo cập nhật từ nhà phát triển 📢')
        .addSubcommand(s => s.setName('view').setDescription('Xem thông báo cập nhật mới nhất'))
        .addSubcommand(s => s.setName('send').setDescription('Gửi thông báo mới tới toàn bộ server (chỉ owner)')
            .addStringOption(o => o.setName('message').setDescription('Nội dung thông báo (hỗ trợ \\n để xuống dòng)').setRequired(true))),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            await interaction.deferReply();
            const s = await db.getGuildSettings('global');
            const message = s?.latest_announcement;

            if (!message) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    title: '📢・Thông Báo Cập Nhật',
                    description: 'Hiện chưa có thông báo cập nhật mới nào từ nhà phát triển~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '📢・Thông Báo Cập Nhật Mới Nhất',
                description: message
            });
            embed.setTimestamp();
            embed.setFooter({
                text: `Xem thông báo cập nhật mới nhất từ nhà phát triển · ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'send') {
            if (!await isOwner(interaction.client, interaction.user.id)) {
                return interaction.reply({ content: 'Chỉ chủ sở hữu bot mới dùng được lệnh này nha~ 🌸', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            const rawMessage = interaction.options.getString('message');
            const message = rawMessage.replace(/\\n/g, '\n');

            // 1. Lưu thông báo vào cấu hình global để người dùng có thể xem lại qua /announcement view
            await db.setGuildSetting('global', 'latest_announcement', message);

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                title: '📢・Thông Báo Cập Nhật Từ Waguri!',
                description: message
            });
            embed.setTimestamp();
            embed.setFooter({
                text: `Hệ thống thông báo Waguri · Gửi bởi ${interaction.user.username} 🌸`,
                iconURL: interaction.client.user.displayAvatarURL()
            });

            const guilds = interaction.client.guilds.cache;
            let sentCount = 0;
            let failCount = 0;

            // 2. Gửi lên kênh thông báo chính thức của Server Support (1517931376865710120)
            const supportChannelId = '1517931376865710120';
            let supportChannel = null;
            try {
                supportChannel = await interaction.client.channels.fetch(supportChannelId).catch(() => null);
            } catch { /* bỏ qua */ }

            if (supportChannel) {
                const ok = await supportChannel.send({ embeds: [embed] }).then(() => true).catch(() => false);
                if (ok) sentCount++;
            }

            // 3. Gửi tới các server khác
            for (const [gid, guild] of guilds) {
                // Không gửi trùng nếu guild này chính là Guild chứa supportChannel
                if (supportChannel && supportChannel.guild.id === gid) continue;

                try {
                    const s = await db.getGuildSettings(gid);
                    let channel = null;

                    if (s?.announcement_channel) {
                        channel = await guild.channels.fetch(s.announcement_channel).catch(() => null);
                    } else if (guild.systemChannel && guild.members.me.permissionsIn(guild.systemChannel).has(PermissionFlagsBits.SendMessages)) {
                        // Chỉ fallback duy nhất vào systemChannel của server, không tự tiện gửi vào chat tổng
                        channel = guild.systemChannel;
                    }

                    if (channel) {
                        await channel.send({ embeds: [embed] });
                        sentCount++;
                    } else {
                        failCount++;
                    }
                } catch (err) {
                    console.error(`[ANNOUNCEMENT ERROR] Guild ID: ${gid}`, err);
                    failCount++;
                }
            }

            const resEmbed = buildWaguriEmbed(interaction, 'success', {
                title: '📢 Gửi thông báo thành công!',
                description: `Đã phát thông báo cập nhật tới **${sentCount}** server/kênh và đã lưu trữ thông báo để xem qua \`/announcement view\`.\n❌ Thất bại: **${failCount}** server.`
            });
            await interaction.editReply({ embeds: [resEmbed] });
        }
    },
};
