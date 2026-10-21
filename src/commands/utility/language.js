const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

// Ngôn ngữ CÁ NHÂN — thắng cả `/config language` của server (thứ tự ở lib/i18n.js).
//
// VÌ SAO CÓ (feedback 2026-10-21): người Việt để app Discord bằng tiếng Anh thì bot nói
// tiếng Anh, và trước lệnh này họ không có cách nào tự đổi — chỉ admin đổi được cho CẢ server.
module.exports = {
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('Chọn ngôn ngữ Waguri nói với riêng cậu 🌐')
        .addStringOption(o => o.setName('lang').setDescription('Ngôn ngữ / Language').setRequired(true)
            .addChoices(
                { name: 'Tiếng Việt 🇻🇳', value: 'vi' },
                { name: 'English 🇬🇧', value: 'en' },
                { name: 'Tự động theo app Discord', value: 'auto' }
            )),
    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const lua = interaction.options.getString('lang');
        const ok = await db.setUserLocaleChoice(interaction.user.id, lua);

        // Trả lời bằng ngôn ngữ MỚI để người dùng thấy ngay kết quả. Cache đã bị xoá trong
        // helper nên lần tra này đọc lại từ DB.
        const locale = await getInteractionLanguage(interaction);
        if (!ok) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                locale, description: t(locale, 'common.generic_error'),
            })] });
        }
        const khoa = lua === 'auto' ? 'success_auto' : 'success_set';
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.language.title'),
            description: t(locale, `commands.language.${khoa}`),
        })] });
    },
};
