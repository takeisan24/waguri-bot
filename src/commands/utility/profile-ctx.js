// Context menu (chuột phải user -> Apps -> "View Waguri Profile") — xem nhanh hồ sơ người khác.
//
// TÊN ĐỔI SANG TIẾNG ANH 2026-10-23, và ĐÂY LÀ NGOẠI LỆ DUY NHẤT của luật "tên lệnh không
// đổi theo ngôn ngữ": với lệnh slash, tên là thứ người ta GÕ nên phải cố định; với context
// menu, tên CHÍNH LÀ chữ hiển thị trong menu chuột phải — không ai gõ nó. Trước đây nó là
// "Xem hồ sơ Waguri" cho mọi locale, nên người dùng tiếng Anh click chuột phải cũng đọc
// tiếng Việt. `commandLocalizer` có bảng `CONTEXT_MENU_NAMES` riêng cho nhóm này.
const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getProgress } = require('../../lib/leveling');
const { createWaguriBar, buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('View Waguri Profile')
        .setType(ApplicationCommandType.User),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const target = interaction.targetUser;
        if (target.bot) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: t(locale, 'commands.profile_ctx.err_bot')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Song song vì hai truy vấn độc lập nhau — xem chú thích cùng kiểu ở `status.js`.
        const [user, energy] = await Promise.all([db.getUser(target.id), db.getEnergy(target.id)]);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.profile_ctx.err_no_data')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const p = getProgress(Number(user.exp));
        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            fields: [
                { name: t(locale, 'commands.profile_ctx.wallet'), value: `${Number(user.wallet).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile_ctx.bank'), value: `${Number(user.bank).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile_ctx.energy'), value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: t(locale, 'commands.profile_ctx.level'), value: `Lv.${p.level}`, inline: true },
                { name: t(locale, 'commands.profile_ctx.exp_progress', { current: p.expIntoLevel, max: p.expForNextLevel }), value: createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12), inline: false },
            ],
        });
        embed.setAuthor({ name: t(locale, 'commands.profile_ctx.author_title', { user: target.username }), iconURL: target.displayAvatarURL() });
        embed.setTimestamp();
        await interaction.editReply({ embeds: [embed] });
    },
};
