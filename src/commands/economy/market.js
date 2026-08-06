const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { logError } = require('../../lib/logger');
const { getLiveMarketPrices, getNextShiftCountdown, BASE_MARKET_ITEMS } = require('../../lib/market');
const db = require('../../database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Thị trường & Chợ Nông Thủy Sản Biến Động Waguri 📈')
        .addSubcommand(sub =>
            sub.setName('prices')
                .setDescription('Xem biến động giá chợ hiện tại & thời gian biến động tiếp theo 📊')
        )
        .addSubcommand(sub =>
            sub.setName('sell')
                .setDescription('Bán nông/thủy/khoáng sản theo giá chợ biến động 💸')
                .addStringOption(opt =>
                    opt.setName('item')
                        .setDescription('Loại nông/thủy sản cần bán')
                        .setRequired(true)
                        .addChoices(
                            { name: '🌾 Lúa Nước', value: 'lua_nuoc' },
                            { name: '🍅 Cà Chua', value: 'ca_chua' },
                            { name: '🥔 Khoai Tây', value: 'khoai_tay' },
                            { name: '🍉 Dưa Hấu', value: 'dua_hau' },
                            { name: '🥓 Thịt Heo', value: 'thit_heo_2500' },
                            { name: '🐟 Cá Tươi', value: 'ca_tuoi' },
                            { name: '🐠 Cá Koi', value: 'ca_koi' },
                            { name: '🐉 Cá Rồng Vàng', value: 'ca_rong' },
                            { name: '💎 Đá Siêu Cấp', value: 'sieu_cap_gem' },
                            { name: '🥇 Vàng Đông Triều', value: 'vang_dong_trieu' },
                            { name: '🪵 Gỗ Rắn', value: 'go_ram' },
                            { name: '🪵 Kỳ Nam', value: 'ky_nam' }
                        )
                )
                .addIntegerOption(opt =>
                    opt.setName('amount')
                        .setDescription('Số lượng cần bán (nhập > 0)')
                        .setRequired(true)
                        .setMinValue(1)
                )
        ),

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();
        const { user } = interaction;
        const fmt = n => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

        if (subcommand === 'prices') {
            const prices = await getLiveMarketPrices();
            const countdown = getNextShiftCountdown();

            const isEn = locale === 'en';
            const embed = new EmbedBuilder()
                .setColor('#f472b6')
                .setTitle(isEn ? '📈 Waguri Live Commodity Market' : '📈 Sàn Giao Dịch Nông Thủy Sản Biến Động Waguri')
                .setDescription(
                    isEn
                        ? `Market prices update dynamically every 4 hours based on global supply & demand!\n⏳ Next market shift in: **${countdown}**`
                        : `Giá nông sản biến động tự động mỗi 4 giờ dựa trên cung cầu thị trường!\n⏳ Lần đổi giá tiếp theo sau: **${countdown}**`
                )
                .setFooter({ text: 'Waguri Market Engine • Real-time Fluctuations' });

            const catMap = {
                crop: isEn ? '🌾 Crops' : '🌾 Nông Sản Cultivation',
                pig: isEn ? '🥓 Livestock' : '🥓 Chăn Nuôi Heo',
                fish: isEn ? '🐟 Seafood' : '🐟 Thủy Sản Câu Cá',
                ore: isEn ? '💎 Ores & Gems' : '💎 Khai Thác Đào Mỏ',
                wood: isEn ? '🪵 Forestry' : '🪵 Khai Thác Lâm Nghiệp',
            };

            const categories = ['crop', 'pig', 'fish', 'ore', 'wood'];

            for (const cat of categories) {
                const items = prices.filter(p => BASE_MARKET_ITEMS[p.itemId]?.category === cat);
                if (items.length > 0) {
                    const text = items.map(p => {
                        const name = isEn ? p.nameEn : p.nameVi;
                        const icon = p.trend === 'UP' ? '📈' : (p.trend === 'DOWN' ? '📉' : '➡️');
                        const pctSign = p.pctChange > 0 ? `+${p.pctChange}%` : `${p.pctChange}%`;
                        return `${p.emoji} **${name}**: **${fmt(p.currentPrice)}** ${config.CURRENCY} (${icon} \`${pctSign}\`)`;
                    }).join('\n');

                    embed.addFields({ name: catMap[cat], value: text, inline: false });
                }
            }

            const webBtn = new ButtonBuilder()
                .setLabel(isEn ? '🌐 View Live Web Chart' : '🌐 Xem Biểu Đồ Web Chi Tiết')
                .setStyle(ButtonStyle.Link)
                .setURL('https://waguri-bot.vercel.app/market');

            const row = new ActionRowBuilder().addComponents(webBtn);

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        if (subcommand === 'sell') {
            const itemId = interaction.options.getString('item');
            const amount = interaction.options.getInteger('amount');

            await interaction.deferReply();

            const res = await db.sellItemMarket(user.id, itemId, amount);

            if (!res || !res.success) {
                if (res?.error === 'NOT_ENOUGH_ITEMS') {
                    const errEmbed = buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: locale === 'en'
                            ? `❌ You only have **${fmt(res.available)}** units of this item in your inventory!`
                            : `❌ Cậu chỉ có **${fmt(res.available)}** vật phẩm này trong kho đồ thôi nhen!`
                    });
                    return interaction.editReply({ embeds: [errEmbed] });
                }

                const errEmbed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'common.generic_error')
                });
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const itemInfo = BASE_MARKET_ITEMS[itemId] || { emoji: '📦', nameVi: itemId, nameEn: itemId };
            const itemName = locale === 'en' ? itemInfo.nameEn : itemInfo.nameVi;

            const successEmbed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: locale === 'en' ? '💸 Market Sale Successful!' : '💸 Bán Nông Sản Thành Công!',
                description: locale === 'en'
                    ? `Cậu đã bán **${fmt(amount)}x** ${itemInfo.emoji} **${itemName}** theo giá chợ **${fmt(res.unit_price)}** ${config.CURRENCY}/sp!\n\n💰 Thu về: **+${fmt(res.earned)}** ${config.CURRENCY}\n💳 Số dư mới: **${fmt(res.new_wallet)}** ${config.CURRENCY}`
                    : `Cậu đã bán **${fmt(amount)}x** ${itemInfo.emoji} **${itemName}** theo giá chợ **${fmt(res.unit_price)}** ${config.CURRENCY}/sp!\n\n💰 Thu về: **+${fmt(res.earned)}** ${config.CURRENCY}\n💳 Số dư mới: **${fmt(res.new_wallet)}** ${config.CURRENCY}`
            });

            return interaction.editReply({ embeds: [successEmbed] });
        }
    },
};
