const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../database');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('claim-support')
        .setDescription('Nhận phần quà 10,000 xu độc quyền khi gia nhập Server Support 🎁')
        .setDescriptionLocalizations({
            vi: 'Nhận phần quà 10,000 xu độc quyền khi gia nhập Server Support 🎁',
            'en-US': 'Claim exclusive 10,000 coins gift for joining the Support Server 🎁',
            'en-GB': 'Claim exclusive 10,000 coins gift for joining the Support Server 🎁'
        }),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;

        // 1. Kiểm tra cấu hình Server Support
        const supportGuildId = config.ROLE_REWARDS.SUPPORT_GUILD_ID;
        const inviteUrl = config.ROLE_REWARDS.SUPPORT_INVITE;
        if (!supportGuildId || !inviteUrl) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: locale.startsWith('en')
                    ? 'This feature is currently not configured by the administrator.'
                    : 'Chức năng này hiện chưa được cấu hình bởi quản trị viên.'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 2. Kiểm tra xem người dùng có trong Server Support hay không
        let supportGuild = interaction.client.guilds.cache.get(supportGuildId);
        if (!supportGuild) {
            try {
                supportGuild = await interaction.client.guilds.fetch(supportGuildId);
            } catch {
                // Bỏ qua lỗi fetch
            }
        }

        if (!supportGuild) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: locale.startsWith('en')
                    ? 'Could not connect to the Support Server. Please try again later.'
                    : 'Không thể kết nối đến Server Support. Vui lòng thử lại sau.'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const member = await supportGuild.members.fetch(userId).catch(() => null);
        if (!member) {
            // Không thuộc server support -> Trả về lỗi kèm lời mời gia nhập
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.claim_support.err_not_member', { url: inviteUrl })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 3. Thực thi nhận quà qua RPC Postgres (an toàn race conditions)
        const giftCoins = config.ROLE_REWARDS.GIFT_COINS;
        const res = await db.claimSupportGift(userId, giftCoins);

        if (res === null) {
            // Lỗi hệ thống/database
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: locale.startsWith('en')
                    ? 'A database error occurred. Please try again later.'
                    : 'Đã xảy ra lỗi cơ sở dữ liệu. Vui lòng thử lại sau.'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (res === false) {
            // Đã nhận rồi
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.claim_support.err_already_claimed')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 4. Đồng bộ thêm role cấp độ nếu họ chưa có (hỗ trợ trường hợp join xong claim quà)
        try {
            const user = await db.getUser(userId);
            if (user) {
                const { getLevelFromExp } = require('../../lib/leveling');
                const level = getLevelFromExp(Number(user.exp || 0));
                const { syncSupportGuildRoles } = require('../../lib/supportReward');
                await syncSupportGuildRoles(member, level);
            }
        } catch { /* bỏ qua lỗi gán role, không làm hỏng phản hồi quà */ }

        // Thành công!
        const fmtCoins = giftCoins.toLocaleString(locale.startsWith('en') ? 'en-US' : 'vi-VN');
        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            description: t(locale, 'commands.claim_support.success', { coins: fmtCoins })
        });
        return interaction.editReply({ embeds: [embed] });
    }
};
