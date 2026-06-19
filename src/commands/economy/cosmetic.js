const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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

        if (sub === 'view') {
            const u = await db.getUser(userId);
            const color = u?.profile_color && HEX.test(u.profile_color) ? parseInt(u.profile_color.replace('#', ''), 16) : config.COLORS.INFO;
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(color)
                .setTitle('🎨 Cosmetic của cậu')
                .setDescription(
                    `🏷️ Danh hiệu: ${u?.title ? `**${u.title}**` : '*(chưa có)*'}\n` +
                    `🎨 Màu hồ sơ: ${u?.profile_color ? `**#${u.profile_color.replace('#', '')}**` : '*(mặc định)*'}`)
                .setFooter({ text: 'Đặt: /cosmetic title · /cosmetic color' })] });
        }

        if (sub === 'title') {
            const text = interaction.options.getString('text').trim();
            if (!text || text.length > config.COSMETIC.MAX_TITLE_LEN) {
                return interaction.editReply(`Danh hiệu tối đa **${config.COSMETIC.MAX_TITLE_LEN}** ký tự nhé~`);
            }
            if (!await db.addMoney(userId, -config.COSMETIC.TITLE_COST, 'wallet')) {
                return interaction.editReply(`Cần **${fmt(config.COSMETIC.TITLE_COST)}** ${config.CURRENCY} để đổi danh hiệu mà ví chưa đủ~ 😟`);
            }
            await db.setCosmetic(userId, 'title', text);
            return interaction.editReply(`✅ Danh hiệu mới của cậu: **${text}** — xem ở \`/profile\` nhé 🏷️`);
        }

        if (sub === 'color') {
            let hex = interaction.options.getString('hex').trim();
            if (!HEX.test(hex)) {
                return interaction.editReply('Mã màu chưa đúng~ Nhập 6 ký tự hex, vd `F1C40F` hoặc `#5865F2`.');
            }
            hex = hex.replace('#', '').toUpperCase();
            if (!await db.addMoney(userId, -config.COSMETIC.COLOR_COST, 'wallet')) {
                return interaction.editReply(`Cần **${fmt(config.COSMETIC.COLOR_COST)}** ${config.CURRENCY} để đổi màu mà ví chưa đủ~ 😟`);
            }
            await db.setCosmetic(userId, 'profile_color', hex);
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(parseInt(hex, 16))
                .setDescription(`✅ Màu hồ sơ mới: **#${hex}** — xem ở \`/profile\` nhé 🎨`)] });
        }
    },
};
