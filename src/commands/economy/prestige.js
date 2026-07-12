const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { buildWaguriEmbed } = require('../../lib/embed');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('prestige')
        .setDescription('Chuyển sinh — Khởi đầu mới với đặc quyền tối thượng 🌟'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const user = await db.getUser(userId);

        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: 'Lỗi hệ thống khi tải thông tin người dùng.'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const isEn = locale.startsWith('en');
        const prestigeLvl = user.prestige || 0;
        const currentExp = Number(user.exp || 0);
        const reqExp = config.PRESTIGE.REQ_EXP;

        // 1. Kiểm tra điều kiện sơ bộ
        if (currentExp < reqExp) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: isEn ? 'Prestige Loop' : 'Vòng lặp Chuyển sinh',
                description: isEn
                    ? `You must reach **Level 50** (${fmt(reqExp, locale)} EXP) to prestige!\n\n**Current Progress:** ${fmt(currentExp, locale)} / ${fmt(reqExp, locale)} EXP`
                    : `Cậu cần đạt tối thiểu **Cấp 50** (${fmt(reqExp, locale)} EXP) để tiến hành Chuyển sinh!\n\n**Tiến trình hiện tại:** ${fmt(currentExp, locale)} / ${fmt(reqExp, locale)} EXP`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 2. Hiện cảnh báo & nút xác nhận
        const nextPrestige = prestigeLvl + 1;
        const newMaxEnergy = 100 + nextPrestige * config.PRESTIGE.ENERGY_BUFF_PER_LEVEL;
        const incomeBuffPercent = nextPrestige * config.PRESTIGE.INCOME_BUFF_PER_LEVEL * 100;

        const warningTitle = isEn ? '⚠️ Confirm Prestige Loop' : '⚠️ Xác nhận Chuyển sinh';
        const warningDesc = isEn
            ? `Are you sure you want to prestige to **Prestige ${nextPrestige}**?\n\n` +
              `**Consequences:**\n` +
              `- Level will reset to **1**.\n` +
              `- Wallet coins will be set to **5,000**.\n` +
              `- Bank account will be cleared (**0** coins).\n` +
              `- Current job and work experience will be reset.\n\n` +
              `**Privileges & Rewards:**\n` +
              `- 🌟 **Permanent Income Buff:** +${incomeBuffPercent}% for economic activities.\n` +
              `- ⚡ **Max Energy Boost:** Increased to **${newMaxEnergy}**.\n` +
              `- 👑 **Prestige Badge** equipped to showcase on your profile.\n` +
              `- 🖼️ **Prestige Avatar Frame** unlocked on Web Dashboard.\n\n` +
              `*This action cannot be undone! Click "Confirm" below to proceed.*`
            : `Cậu có chắc chắn muốn tiến hành Chuyển sinh lên **Cấp Chuyển sinh ${nextPrestige}**?\n\n` +
              `**Hậu quả:**\n` +
              `- Cấp độ nhân vật sẽ reset về **Cấp 1**.\n` +
              `- Ví xu ảo sẽ khấu trừ toàn bộ, đặt về **5,000 xu** khởi nghiệp.\n` +
              `- Số dư Ngân hàng sẽ bị xóa hoàn toàn (**0 xu**).\n` +
              `- Công việc và cấp nghề nghiệp hiện tại bị xóa bỏ.\n\n` +
              `**Đặc quyền & Phần thưởng:**\n` +
              `- 🌟 **Tăng thu nhập vĩnh viễn:** +${incomeBuffPercent}% cho mọi lệnh kinh tế.\n` +
              `- ⚡ **Tăng giới hạn năng lượng cực đại:** Tăng lên **${newMaxEnergy} ⚡**.\n` +
              `- 👑 **Huy hiệu Chuyển sinh** tương ứng tự động trang bị trên profile.\n` +
              `- 🖼️ **Khung viền Avatar Chuyển sinh** độc quyền trên trang cá nhân web.\n\n` +
              `*Thao tác này hoàn toàn không thể hoàn tác! Nhấn nút "Xác nhận" bên dưới để thực thi.*`;

        const embed = buildWaguriEmbed(interaction, 'warning', {
            locale,
            title: warningTitle,
            description: warningDesc
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prestige:confirm').setLabel(isEn ? 'Confirm Prestige' : 'Xác nhận Chuyển sinh').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('prestige:cancel').setLabel(isEn ? 'Cancel' : 'Hủy bỏ').setStyle(ButtonStyle.Secondary)
        );

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
        let answered = false;

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) {
                return i.reply({
                    content: isEn ? 'This menu is not for you!' : 'Trình xác nhận này không dành cho cậu!',
                    flags: MessageFlags.Ephemeral
                });
            }
            if (answered) return i.deferUpdate().catch(() => {});
            answered = true;

            if (i.customId === 'prestige:cancel') {
                const cancelEmbed = buildWaguriEmbed(interaction, 'info', {
                    locale,
                    description: isEn ? 'Prestige loop cancelled.' : 'Đã hủy bỏ tiến trình Chuyển sinh.'
                });
                return i.update({ embeds: [cancelEmbed], components: [] });
            }

            const r = await db.prestigeUser(userId, reqExp);
            if (!r) {
                const errEmbed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: isEn ? 'A database error occurred.' : 'Lỗi cơ sở dữ liệu khi Chuyển sinh.'
                });
                return i.update({ embeds: [errEmbed], components: [] });
            }

            if (r.status === 'level_insufficient') {
                const lowEmbed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: isEn 
                        ? 'Your experience is insufficient to prestige!' 
                        : 'Điểm kinh nghiệm của cậu không đủ điều kiện!'
                });
                return i.update({ embeds: [lowEmbed], components: [] });
            }

            if (r.status === 'ok') {
                const successEmbed = buildWaguriEmbed(interaction, 'jackpot', {
                    locale,
                    title: isEn ? '🎉 Prestige Loop Completed!' : '🎉 Chuyển Sinh Thành Công!',
                    description: isEn
                        ? `Congratulations! You have successfully prestiges to **Prestige ${r.new_prestige}**! ` +
                          `Your level has reset, and your privileges are now active!`
                        : `Chúc mừng cậu đã chuyển sinh thành công lên **Chuyển Sinh Cấp ${r.new_prestige}**! ` +
                          `Vòng lặp đã reset cấp độ, và cậu đã nhận đầy đủ đặc quyền tối thượng mới!`
                });
                return i.update({ embeds: [successEmbed], components: [] });
            }
        });
    }
};
