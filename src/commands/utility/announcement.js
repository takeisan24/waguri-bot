const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { execSync } = require('child_process');
const db = require('../../database.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');
const gemini = require('../../lib/ai/gemini');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Xem hoặc gửi thông báo cập nhật từ nhà phát triển 📢')
        .addSubcommand(s => s.setName('view').setDescription('Xem thông báo cập nhật mới nhất'))
        .addSubcommand(s => s.setName('auto').setDescription('Tự động sinh thông báo từ Git Commit bằng AI (chỉ owner)'))
        .addSubcommand(s => s.setName('send').setDescription('Gửi thông báo mới tới toàn bộ server thủ công (chỉ owner)')
            .addStringOption(o => o.setName('message').setDescription('Nội dung thông báo (hỗ trợ \\n để xuống dòng)').setRequired(true))),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            await interaction.deferReply();
            const s = await db.getGuildSettings('global');
            const message = s?.latest_announcement;

            if (!message) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    title: t(locale, 'commands.announcement.title_latest'),
                    description: t(locale, 'commands.announcement.no_announcement')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.announcement.title_latest'),
                description: message
            });
            embed.setTimestamp();
            embed.setFooter({
                text: t(locale, 'commands.announcement.footer_view', { original: embed.data.footer.text }),
                iconURL: embed.data.footer.icon_url
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'send' || sub === 'auto') {
            if (!await isOwner(interaction.client, interaction.user.id)) {
                return interaction.reply({ content: t(locale, 'commands.announcement.err_owner'), flags: MessageFlags.Ephemeral });
            }

            await interaction.deferReply();
            let message = '';
            let currentCommit = '';

            if (sub === 'auto') {
                try {
                    currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
                } catch (e) {
                    return interaction.editReply({ content: t(locale, 'commands.announcement.git_err') });
                }

                const s = await db.getGuildSettings('global');
                const lastCommit = s?.latest_announcement_commit;

                if (lastCommit === currentCommit) {
                    return interaction.editReply({ content: t(locale, 'commands.announcement.commit_dup') });
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
                    return interaction.editReply({ content: t(locale, 'commands.announcement.no_commits') });
                }

                const systemPrompt = t(locale, 'commands.announcement.ai_prompt');

                try {
                    message = await gemini.chat(systemPrompt, [], `List of new commits:\n${commits}`);
                } catch (err) {
                    console.error('[AUTO ANNOUNCEMENT AI ERROR]', err);
                    return interaction.editReply({ content: t(locale, 'commands.announcement.ai_err') });
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
                locale,
                title: t(locale, 'commands.announcement.title_main'),
                description: message
            });
            embed.setTimestamp();
            embed.setFooter({
                text: t(locale, 'commands.announcement.footer_sent', { user: interaction.user.username }),
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
                locale,
                title: t(locale, 'commands.announcement.success_title'),
                description: t(locale, 'commands.announcement.success_desc', { sent: sentCount, fail: failCount })
            });
            await interaction.editReply({ embeds: [resEmbed] });
        }
    },
};
