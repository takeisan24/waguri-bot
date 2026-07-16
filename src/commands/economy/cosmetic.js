const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const HEX = /^#?[0-9a-fA-F]{6}$/;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cosmetic')
        .setDescription('Trang trí hồ sơ: danh hiệu & màu (flex thôi, không ảnh hưởng gameplay) 🎨')
        .addSubcommand(s => s.setName('title').setDescription('Đặt danh hiệu (20.000 VNĐ)')
            .addStringOption(o => o.setName('text').setDescription('Danh hiệu của cậu').setRequired(true)))
        .addSubcommand(s => s.setName('color').setDescription('Đặt màu hồ sơ (15.000 VNĐ)')
            .addStringOption(o => o.setName('hex').setDescription('Mã màu hex, vd F1C40F hoặc #5865F2').setRequired(true)))
        .addSubcommand(s => s.setName('view').setDescription('Xem cosmetic hiện tại'))
        .addSubcommand(s => s.setName('badge-buy').setDescription('Mua huy hiệu trưng bày')
            .addStringOption(o => o.setName('badge').setDescription('Chọn huy hiệu').setRequired(true)
                .addChoices(
                    { name: '💰 Triệu Phú Gekka (100.000 VNĐ)', value: 'rich' },
                    { name: '💖 Trái Tim Ấm Áp (50.000 VNĐ)', value: 'heart' },
                    { name: '👑 Thành Viên Hoàng Gia (200.000 VNĐ)', value: 'vip' },
                    { name: '🍰 Vua Bánh Gekka (80.000 VNĐ)', value: 'baker' }
                )))
        .addSubcommand(s => s.setName('badge-equip').setDescription('Trưng bày huy hiệu lên profile')
            .addStringOption(o => o.setName('badge').setDescription('Chọn huy hiệu').setRequired(true)
                .addChoices(
                    { name: '💰 Triệu Phú Gekka', value: 'rich' },
                    { name: '💖 Trái Tim Ấm Áp', value: 'heart' },
                    { name: '👑 Thành Viên Hoàng Gia', value: 'vip' },
                    { name: '🍰 Vua Bánh Gekka', value: 'baker' },
                    { name: '⭐ Chuyển Sinh I', value: 'prestige_1' },
                    { name: '🌟 Chuyển Sinh II', value: 'prestige_2' },
                    { name: '✨ Chuyển Sinh III', value: 'prestige_3' }
                ))
            .addIntegerOption(o => o.setName('slot').setDescription('Vị trí trưng bày (1..6)').setRequired(true).setMinValue(1).setMaxValue(6))),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        const replyEmbed = (type, title, desc) => {
            const embed = buildWaguriEmbed(interaction, type, { locale, title, description: desc });
            return interaction.editReply({ embeds: [embed] });
        };

        if (sub === 'view') {
            const u = await db.getUser(userId);
            const color = u?.profile_color && HEX.test(u.profile_color) ? parseInt(u.profile_color.replace('#', ''), 16) : config.COLORS.INFO;

            const titleVal = u?.title
                ? `**${t(locale, 'titles.' + u.title) || u.title}**`
                : t(locale, 'commands.cosmetic.val_none');

            const colorVal = u?.profile_color
                ? `**#${u.profile_color.replace('#', '')}**`
                : t(locale, 'commands.cosmetic.val_default');

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.cosmetic.view_title'),
                description: t(locale, 'commands.cosmetic.view_desc', { title: titleVal, color: colorVal })
            });
            embed.setColor(color);
            embed.setFooter({
                text: t(locale, 'commands.cosmetic.view_footer') + ` • ${embed.data.footer.text}`,
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
                return replyEmbed('error', t(locale, 'commands.cosmetic.title_success_title'), t(locale, 'commands.cosmetic.title_err_len', { max: config.COSMETIC.MAX_TITLE_LEN }));
            }
            if (!await db.setCosmeticWithFee(userId, 'title', text, config.COSMETIC.TITLE_COST)) {
                return replyEmbed('error', t(locale, 'commands.cosmetic.title_success_title'), t(locale, 'commands.cosmetic.title_err_poor', { cost: fmt(config.COSMETIC.TITLE_COST, locale), currency: config.CURRENCY }));
            }
            return replyEmbed('success', t(locale, 'commands.cosmetic.title_success_title'), t(locale, 'commands.cosmetic.title_success_desc', { text }));
        }

        if (sub === 'color') {
            let hex = interaction.options.getString('hex').trim();
            if (!HEX.test(hex)) {
                return replyEmbed('error', t(locale, 'commands.cosmetic.color_success_title'), t(locale, 'commands.cosmetic.color_err_format'));
            }
            hex = hex.replace('#', '').toUpperCase();
            if (!await db.setCosmeticWithFee(userId, 'profile_color', hex, config.COSMETIC.COLOR_COST)) {
                return replyEmbed('error', t(locale, 'commands.cosmetic.color_success_title'), t(locale, 'commands.cosmetic.color_err_poor', { cost: fmt(config.COSMETIC.COLOR_COST, locale), currency: config.CURRENCY }));
            }
            const embedSuccess = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.cosmetic.color_success_title'),
                description: t(locale, 'commands.cosmetic.color_success_desc', { hex })
            });
            embedSuccess.setColor(parseInt(hex, 16));
            return interaction.editReply({ embeds: [embedSuccess] });
        }

        if (sub === 'badge-buy') {
            const badgeId = interaction.options.getString('badge');
            const badgeConf = config.COSMETIC.BADGES?.[badgeId];
            if (!badgeConf || badgeConf.cost <= 0) {
                return replyEmbed('error', 'Lỗi / Error', 'Huy hiệu không hợp lệ hoặc không bán.');
            }
            
            const u = await db.getUser(userId);
            if (!u) return replyEmbed('error', 'Lỗi / Error', t(locale, 'common.db_error'));
            
            if (Number(u.wallet) < badgeConf.cost) {
                return replyEmbed('error', 'Không đủ tiền / Insufficient Coins', `Cậu cần **${fmt(badgeConf.cost, locale)} xu** để mua huy hiệu này.`);
            }
            
            const owned = await db.getUserBadges(userId);
            if (owned.some(b => b.badge_id === badgeId)) {
                return replyEmbed('warning', 'Đã sở hữu / Already Owned', 'Cậu đã sở hữu huy hiệu này rồi.');
            }
            
            // Trừ tiền nguyên tử TRƯỚC + kiểm return -> không cấp badge free nếu guard chặn (không đủ tiền).
            if (!await db.addMoney(userId, -badgeConf.cost, 'wallet')) {
                return replyEmbed('error', 'Không đủ tiền / Insufficient Coins', `Cậu cần **${fmt(badgeConf.cost, locale)} xu** để mua huy hiệu này.`);
            }
            const isNew = await db.unlockBadge(userId, badgeId);
            if (!isNew) {
                // Đã sở hữu (mua trùng / đua đồng thời) -> hoàn tiền, không tính phí lần 2.
                await db.addMoney(userId, badgeConf.cost, 'wallet');
                return replyEmbed('warning', 'Đã sở hữu / Already Owned', 'Cậu đã sở hữu huy hiệu này rồi.');
            }
            
            const badgeName = locale === 'en' ? badgeConf.name_en : badgeConf.name_vi;
            return replyEmbed('success', 'Mua thành công / Purchase Success', `Cậu đã mua thành công huy hiệu **${badgeConf.emoji} ${badgeName}**! Hãy dùng \`/cosmetic badge-equip\` để trưng bày.`);
        }

        if (sub === 'badge-equip') {
            const badgeId = interaction.options.getString('badge');
            const slot = interaction.options.getInteger('slot');
            
            const owned = await db.getUserBadges(userId);
            if (!owned.some(b => b.badge_id === badgeId)) {
                return replyEmbed('error', 'Chưa sở hữu / Not Owned', 'Cậu chưa sở hữu huy hiệu này.');
            }
            
            const r = await db.equipBadge(userId, badgeId, slot);
            if (r === 'ok') {
                const badgeConf = config.COSMETIC.BADGES?.[badgeId];
                const badgeName = badgeConf ? `${badgeConf.emoji} ${locale === 'en' ? badgeConf.name_en : badgeConf.name_vi}` : badgeId;
                return replyEmbed('success', 'Trang bị thành công / Equip Success', `Huy hiệu **${badgeName}** đã được trưng bày ở slot **#${slot}**.`);
            } else {
                return replyEmbed('error', 'Lỗi / Error', 'Không thể trang bị huy hiệu.');
            }
        }
    },
};
