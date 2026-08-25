const { SlashCommandBuilder, MessageFlags, PermissionsBitField } = require('discord.js');
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

        // 2. Xác định kênh đích và QUYỀN GỬI trước, cooldown sau.
        //
        // Bản cũ đốt cooldown 15 phút ngay tại đây — trước khi biết có gửi được hay không.
        // Nên trên server chưa cấu hình kênh, hoặc bot vừa bị gỡ quyền ở kênh đó, người dùng
        // vừa không gửi được vừa bị khoá 15 phút cho một lần thử không tạo ra gì cả.
        //
        // `claim_cooldown` KHÔNG có đường nhả (xem database.js: chỉ có claim, không có clear),
        // nên đổi thứ tự là cách sửa duy nhất không phải thêm migration.
        //
        // Đổi thứ tự KHÔNG mở ra đường lạm dụng: mọi thứ có tác dụng phụ — đốt số thứ tự, ghi
        // log, gửi bài — vẫn nằm SAU cửa cooldown. Phần chuyển lên trước chỉ toàn phép đọc.
        const userId = interaction.user.id;
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

        // Hỏi trước còn hơn đốt lượt rồi mới biết. Cần cả EmbedLinks vì bài gửi là embed —
        // thiếu riêng quyền đó thì `send` vẫn ném lỗi y như thiếu SendMessages.
        const quyen = channel.permissionsFor(interaction.guild.members.me);
        if (!quyen?.has(PermissionsBitField.Flags.SendMessages) || !quyen?.has(PermissionsBitField.Flags.EmbedLinks)) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.confession.err_no_permission', { channel: channel.id })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 3. Tới đây lần gửi này mới thật sự có cơ hội thành công -> giờ mới đốt cooldown.
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

        // Lưới cuối cho khe hở còn lại: quyền có thể bị gỡ, hoặc kênh bị xoá, ngay giữa lúc
        // kiểm ở trên và lúc gửi ở đây. Bản cũ `.catch(() => null)` nuốt lỗi rồi vẫn khoe "đã
        // gửi" — mà số thứ tự đã đốt, log đã ghi, cooldown đã tiêu. Người gửi tin rằng bài đã
        // đăng, và khác mọi lỗi tiền, ở đây KHÔNG có dòng số dư nào để họ đối chiếu sự thật.
        const daGui = await channel.send({ embeds: [embed] }).then(() => true).catch(() => false);
        if (!daGui) {
            const embedHong = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.confession.err_send_failed')
            });
            return interaction.editReply({ embeds: [embedHong] });
        }

        const successEmbed = buildWaguriEmbed(interaction, 'success', {
            locale,
            description: t(locale, 'commands.confession.success_reply')
        });
        return interaction.editReply({ embeds: [successEmbed] });
    },
};
