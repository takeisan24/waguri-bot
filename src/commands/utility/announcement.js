const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { execSync } = require('child_process');
const db = require('../../database.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');
const gemini = require('../../lib/ai/gemini');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Xem hoặc gửi thông báo cập nhật từ nhà phát triển 📢')
        .addSubcommand(s => s.setName('view').setDescription('Xem thông báo cập nhật mới nhất'))
        .addSubcommand(s => s.setName('auto').setDescription('Tự động sinh thông báo từ Git Commit bằng AI (chỉ owner)'))
        .addSubcommand(s => s.setName('send').setDescription('Gửi thông báo mới tới toàn bộ server thủ công (chỉ owner)')
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

        if (sub === 'send' || sub === 'auto') {
            if (!await isOwner(interaction.client, interaction.user.id)) {
                return interaction.reply({ content: 'Chỉ chủ sở hữu bot mới dùng được lệnh này nha~ 🌸', flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            let message = '';
            let currentCommit = '';

            if (sub === 'auto') {
                try {
                    currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
                } catch (e) {
                    return interaction.editReply({ content: 'Không thể lấy commit hiện tại từ Git (kiểm tra xem bạn đã cài đặt Git chưa nhé)!' });
                }

                const s = await db.getGuildSettings('global');
                const lastCommit = s?.latest_announcement_commit;

                if (lastCommit === currentCommit) {
                    return interaction.editReply({ content: 'Không có thay đổi mới nào kể từ lần phát thông báo trước (Commit hiện tại trùng với commit đã thông báo)!' });
                }

                let commits = '';
                try {
                    if (lastCommit) {
                        commits = execSync(`git log ${lastCommit}..HEAD --pretty=format:"- %s"`, { encoding: 'utf8' }).trim();
                    } else {
                        commits = execSync('git log -n 10 --pretty=format:"- %s"', { encoding: 'utf8' }).trim();
                    }
                } catch (err) {
                    try {
                        commits = execSync('git log -n 10 --pretty=format:"- %s"', { encoding: 'utf8' }).trim();
                    } catch (err2) {
                        commits = '';
                    }
                }

                if (!commits || commits.trim() === '') {
                    return interaction.editReply({ content: 'Không tìm thấy thay đổi/commit mới nào để thông báo!' });
                }

                const systemPrompt = `Bạn là Waguri Kaoruko, bạn gái AI ngọt ngào và là quản gia đắc lực của bot game nhập vai Discord Waguri.
Nhiệm vụ của bạn là đọc danh sách các commit kỹ thuật bên dưới và viết thành một bản tin thông báo cập nhật (Changelog) cực kỳ ngọt ngào, dễ thương, truyền cảm hứng và thân thiện bằng tiếng Việt.
Yêu cầu:
- Sử dụng nhiều emoji dễ thương (🌸, ✨, 🎀, 💼, 🐷, 🌱...).
- Tóm tắt và gộp nhóm các thay đổi thành các gạch đầu dòng rõ ràng, dễ hiểu cho người chơi bình thường (không dùng ngôn ngữ quá kỹ thuật của lập trình viên).
- Giữ độ dài vừa phải để gửi trên Discord (dưới 1500 ký tự).
- Tuyệt đối không thêm bất kỳ lời chào đầu hay kết bằng chữ "Waguri:" hay "Model:", hãy bắt đầu trực tiếp bằng tiêu đề thông báo.`;

                try {
                    message = await gemini.chat(systemPrompt, [], `Danh sách commit mới:\n${commits}`);
                } catch (err) {
                    console.error('[AUTO ANNOUNCEMENT AI ERROR]', err);
                    return interaction.editReply({ content: 'Lỗi khi yêu cầu AI tạo thông báo cập nhật!' });
                }
            } else {
                const rawMessage = interaction.options.getString('message');
                message = rawMessage.replace(/\\n/g, '\n');
            }

            // 1. Lưu thông báo vào cấu hình global để người dùng và website có thể đọc được
            await db.setGuildSetting('global', 'latest_announcement', message);
            if (currentCommit) {
                await db.setGuildSetting('global', 'latest_announcement_commit', currentCommit);
            }

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                title: '📢・Thông Báo Cập Nhật Từ Waguri!',
                description: message
            });
            embed.setTimestamp();
            embed.setFooter({
                text: `Hệ thống thông báo Waguri · Gửi tự động bởi ${interaction.user.username} 🌸`,
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
