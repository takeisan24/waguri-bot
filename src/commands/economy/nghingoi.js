const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nghingoi')
        .setDescription('Đi ngủ một giấc để hồi đầy năng lượng 😴'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);

        const cd = await db.claimCooldown(interaction.user.id, 'sleep', config.SLEEP_COOLDOWN_SECONDS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: t(locale, 'commands.nghingoi.cooldown_title'),
                description: t(locale, 'commands.nghingoi.cooldown_desc', { time: Math.floor(cd / 1000) })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        // Kiểm kết quả: bản cũ báo "đã hồi đầy năng lượng" vô điều kiện.
        //
        // `claimCooldown` ở trên FAIL-OPEN (database.js: DB lỗi -> trả false = cho qua, và
        // dòng cooldown không hề được ghi). Nên khi DB sập hẳn, người dùng KHÔNG bị khoá 6
        // tiếng — họ chỉ nhận một câu nói sai rồi gõ lại được ngay. Cửa sổ bị khoá thật chỉ
        // nằm ở ca hỏng chớp nhoáng: cooldown ghi được mà `setEnergy` thì không.
        //
        // Vì vậy bản vá đúng là NÓI THẬT, không phải đảo thứ tự: đảo lại sẽ bỏ mất cổng
        // nguyên tử chống spam mà `claimCooldown` đang giữ, để đổi lấy một ca rất hẹp.
        const daHoi = await db.setEnergy(interaction.user.id, config.ENERGY.MAX);
        // Ngủ ngon = hồi cả sức khỏe (đỡ phải tốn viện phí /hospital). +100 sẽ kẹp về 100.
        await db.addHealth(interaction.user.id, 100);

        // Chỉ xét `setEnergy`: đó là thứ lệnh này HỨA. `addHealth` là phần thưởng kèm thêm
        // (đỡ tốn viện phí) và câu thông báo không nêu con số máu, nên hỏng riêng nó thì
        // không có lời nào thành sai.
        if (daHoi !== true) {
            const loi = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.nghingoi.err_save_failed')
            });
            return interaction.editReply({ embeds: [loi] });
        }

        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.nghingoi.success_title'),
            description: t(locale, 'commands.nghingoi.success_desc', { energy: config.ENERGY.MAX })
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
