const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');
const HEX = /^#?[0-9a-fA-F]{6}$/;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cosmetic')
        .setDescription('Trang trí hồ sơ: danh hiệu & màu (flex thôi, không ảnh hưởng gameplay) 🎨')
        .addSubcommand(s => s.setName('title').setDescription('Đặt danh hiệu (20.000 VNĐ)')
            .addStringOption(o => o.setName('text').setDescription('Danh hiệu của cậu').setRequired(true)))
        .addSubcommand(s => s.setName('color').setDescription('Đặt màu hồ sơ (15.000 VNĐ)')
            .addStringOption(o => o.setName('hex').setDescription('Mã màu hex, vd F1C40F hoặc #5865F2').setRequired(true)))
        .addSubcommand(s => s.setName('view').setDescription('Xem cosmetic hiện tại')),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        const replyEmbed = (type, title, desc) => {
            const embed = buildWaguriEmbed(interaction, type, { title, description: desc });
            return interaction.editReply({ embeds: [embed] });
        };

        if (sub === 'view') {
            const u = await db.getUser(userId);
            const color = u?.profile_color && HEX.test(u.profile_color) ? parseInt(u.profile_color.replace('#', ''), 16) : config.COLORS.INFO;
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '🎨・Cosmetic của cậu',
                description:
                    `🏷️ Danh hiệu: ${u?.title ? `**${u.title}**` : '*(chưa có)*'}\n` +
                    `🎨 Màu hồ sơ: ${u?.profile_color ? `**#${u.profile_color.replace('#', '')}**` : '*(mặc định)*'}`
            });
            embed.setColor(color);
            embed.setFooter({
                text: `Đặt: /cosmetic title · /cosmetic color • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'title') {
            // Lọc: vô hiệu @everyone/@here, bỏ mention người/role + ký tự markdown (hiện công khai ở /profile, leaderboard).
            const text = interaction.options.getString('text')
                .replace(/<@[!&]?\d+>/g, '')
                .replace(/@(everyone|here)/gi, '$1')
                .replace(/[`*_~|\\<>@]/g, '')
                .trim();
            if (!text || text.length > config.COSMETIC.MAX_TITLE_LEN) {
                return replyEmbed('error', '🎨・Đổi Danh Hiệu', `Danh hiệu tối đa **${config.COSMETIC.MAX_TITLE_LEN}** ký tự nhé~`);
            }
            if (!await db.setCosmeticWithFee(userId, 'title', text, config.COSMETIC.TITLE_COST)) {
                return replyEmbed('error', '🎨・Đổi Danh Hiệu', `Cần **${fmt(config.COSMETIC.TITLE_COST)}** ${config.CURRENCY} để đổi danh hiệu mà ví chưa đủ (hoặc có lỗi xảy ra)~ 😟`);
            }
            return replyEmbed('success', '🎨・Đổi Danh Hiệu', `Danh hiệu mới của cậu: **${text}** — xem ở \`/profile\` nhé 🏷️`);
        }

        if (sub === 'color') {
            let hex = interaction.options.getString('hex').trim();
            if (!HEX.test(hex)) {
                return replyEmbed('error', '🎨・Đổi Màu Hồ Sơ', 'Mã màu chưa đúng~ Nhập 6 ký tự hex, vd `F1C40F` hoặc `#5865F2`.');
            }
            hex = hex.replace('#', '').toUpperCase();
            if (!await db.setCosmeticWithFee(userId, 'profile_color', hex, config.COSMETIC.COLOR_COST)) {
                return replyEmbed('error', '🎨・Đổi Màu Hồ Sơ', `Cần **${fmt(config.COSMETIC.COLOR_COST)}** ${config.CURRENCY} để đổi màu mà ví chưa đủ (hoặc có lỗi xảy ra)~ 😟`);
            }
            const embedSuccess = buildWaguriEmbed(interaction, 'success', {
                title: '🎨・Đổi Màu Hồ Sơ',
                description: `Màu hồ sơ mới: **#${hex}** — xem ở \`/profile\` nhé 🎨`
            });
            embedSuccess.setColor(parseInt(hex, 16));
            return interaction.editReply({ embeds: [embedSuccess] });
        }
    },
};
