// ============================================================
// /market — Sàn Giao Dịch Nông Thủy Sản Biến Động Hàng Giờ (Sparklines)
//
// Cơ chế: Giá nông sản, khoáng sản, thủy sản biến động tự động mỗi 4 giờ
// dựa trên bộ trộn tuyết lở MurmurMix32 hash không cần query DB.
// Hiển thị biểu đồ Sparkline Unicode 24h trên Discord và Vector SVG trên Web.
// ============================================================
const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { getLiveMarketPrices, getNextShiftCountdown, BASE_MARKET_ITEMS } = require('../../lib/market');

const fmt = (n, locale) => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Chợ nông thủy sản biến động giá hàng giờ & biểu đồ 🛒📈')
        .setDescriptionLocalizations({
            vi: 'Chợ nông thủy sản biến động giá hàng giờ & biểu đồ 🛒📈',
            'en-US': 'Hourly dynamic commodity market & sparkline trends 🛒📈',
            'en-GB': 'Hourly dynamic commodity market & sparkline trends 🛒📈'
        })
        .addSubcommand(s => s.setName('prices')
            .setDescription('Xem biến động giá chợ hiện tại & thời gian đổi giá tiếp theo 📊')
            .setDescriptionLocalizations({
                vi: 'Xem biến động giá chợ hiện tại & thời gian đổi giá tiếp theo 📊',
                'en-US': 'View current market prices & countdown to next shift 📊',
                'en-GB': 'View current market prices & countdown to next shift 📊'
            }))
        .addSubcommand(s => s.setName('sell')
            .setDescription('Bán nông/thủy/khoáng sản cho hệ thống theo giá chợ biến động 💸')
            .setDescriptionLocalizations({
                vi: 'Bán nông/thủy/khoáng sản cho hệ thống theo giá chợ biến động 💸',
                'en-US': 'Sell agricultural/aquatic goods at current market prices 💸',
                'en-GB': 'Sell agricultural/aquatic goods at current market prices 💸'
            })
            .addStringOption(o => o.setName('item').setDescription('Loại nông/thủy sản cần bán').setRequired(true)
                .setDescriptionLocalizations({
                    vi: 'Loại nông/thủy sản cần bán',
                    'en-US': 'Commodity item to sell',
                    'en-GB': 'Commodity item to sell'
                })
                .addChoices(
                    { name: '🍎 Trái Cây Loại Thường', value: 'trai_1500' },
                    { name: '🍇 Trái Cây Loại Ngon', value: 'trai_2500' },
                    { name: '🌷 Hoa Loại Khá', value: 'hoa_2000' },
                    { name: '🌺 Hoa Hảo Hạng', value: 'hoa_3500' },
                    { name: '🥓 Thịt Heo Loại Khá', value: 'thit_heo_2500' },
                    { name: '🐟 Cá Tươi', value: 'ca_tuoi' },
                    { name: '🐠 Cá Koi Hoàng Gia', value: 'ca_koi_nhat' },
                    { name: '🐉 Cá Rồng Kim Long', value: 'ca_rong_vang' },
                    { name: '🪨 Quặng Sắt', value: 'quang_sat' },
                    { name: '🥇 Vàng Đông Triều', value: 'vang_dong_tren' },
                    { name: '🪵 Gỗ', value: 'go' },
                    { name: '🪵 Kỳ Nam', value: 'ky_nam' }
                ))
            .addIntegerOption(o => o.setName('amount').setDescription('Số lượng cần bán (nhập > 0)').setRequired(true).setMinValue(1)
                .setDescriptionLocalizations({
                    vi: 'Số lượng cần bán (nhập > 0)',
                    'en-US': 'Quantity to sell (> 0)',
                    'en-GB': 'Quantity to sell (> 0)'
                }))),

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const isEn = locale === 'en' || locale?.startsWith('en');

        // 1) prices: Xem giá chợ biến động
        if (sub === 'prices') {
            const prices = await getLiveMarketPrices();
            const countdown = getNextShiftCountdown();

            const embed = new EmbedBuilder()
                .setColor('#f472b6')
                .setTitle(isEn ? '📈 Waguri Live Commodity Market' : '📈 Sàn Giao Dịch Nông Thủy Sản Biến Động Waguri')
                .setDescription(
                    isEn
                        ? `Market prices update dynamically every 4 hours based on global supply & demand!\n⏳ Next market shift in: **${countdown}**\n📊 Sparkline shows 24h price trend (6 blocks: \`[ ▂▃▅▆█]\`).`
                        : `Giá nông sản biến động tự động mỗi 4 giờ dựa trên cung cầu thị trường!\n⏳ Lần đổi giá tiếp theo sau: **${countdown}**\n📊 Biểu đồ Sparkline thể hiện xu hướng 24h qua (6 khối: \`[ ▂▃▅▆█]\`).`
                )
                .setFooter({ text: 'Waguri Market Engine • Real-time Fluctuations & 24h Trend' });

            const catMap = {
                crop: isEn ? '🌾 Crops' : '🌾 Nông Sản',
                pig: isEn ? '🥓 Livestock' : '🥓 Chăn Nuôi',
                fish: isEn ? '🐟 Seafood' : '🐟 Thủy Sản',
                ore: isEn ? '💎 Ores & Gems' : '💎 Khai Thác Mỏ',
                wood: isEn ? '🪵 Forestry' : '🪵 Lâm Nghiệp',
            };

            for (const cat of ['crop', 'pig', 'fish', 'ore', 'wood']) {
                const list = prices.filter(p => BASE_MARKET_ITEMS[p.itemId]?.category === cat);
                if (!list.length) continue;
                const text = list.map(p => {
                    const name = isEn ? p.nameEn : p.nameVi;
                    const icon = p.trend === 'UP' ? '📈' : (p.trend === 'DOWN' ? '📉' : '➡️');
                    const pctSign = p.pctChange > 0 ? `+${p.pctChange}%` : `${p.pctChange}%`;
                    const spark = p.sparkline ? `\`[${p.sparkline}]\`` : '';
                    return `${p.emoji} **${name}**: **${fmt(p.currentPrice, locale)}** ${config.CURRENCY} (${icon} \`${pctSign}\`) ${spark}\n↳ *24h:* \`${fmt(p.low24h, locale)} - ${fmt(p.high24h, locale)}\` ${config.CURRENCY}`;
                }).join('\n');
                embed.addFields({ name: catMap[cat], value: text, inline: false });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel(isEn ? '🌐 View Live Web Chart' : '🌐 Xem Biểu Đồ Web Chi Tiết')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`${config.WEB_URL}/market`)
            );

            return interaction.reply({ embeds: [embed], components: [row] });
        }

        // 2) sell: Bán nông/thủy/khoáng sản theo giá chợ
        if (sub === 'sell') {
            const itemId = interaction.options.getString('item');
            const amount = interaction.options.getInteger('amount');
            await interaction.deferReply();

            const res = await db.sellItemMarket(interaction.user.id, itemId, amount);

            if (!res || !res.success) {
                if (res?.error === 'NOT_ENOUGH_ITEMS') {
                    return interaction.editReply({
                        embeds: [buildWaguriEmbed(interaction, 'warning', {
                            locale,
                            description: isEn
                                ? `❌ You only have **${fmt(res.available, locale)}** units of this item in your inventory!`
                                : `❌ Cậu chỉ có **${fmt(res.available, locale)}** vật phẩm này trong kho đồ thôi nhen!`,
                        })],
                    });
                }
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.generic_error') })],
                });
            }

            const info = BASE_MARKET_ITEMS[itemId] || { emoji: '📦', nameVi: itemId, nameEn: itemId };
            const itemName = isEn ? info.nameEn : info.nameVi;

            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: isEn ? '💸 Market Sale Successful!' : '💸 Bán Nông Sản Thành Công!',
                    description: isEn
                        ? `You sold **${fmt(amount, locale)}x** ${info.emoji} **${itemName}** at market rate **${fmt(res.unit_price, locale)}** ${config.CURRENCY}/unit!\n\n💰 Earned: **+${fmt(res.earned, locale)}** ${config.CURRENCY}\n💳 New Balance: **${fmt(res.new_wallet, locale)}** ${config.CURRENCY}`
                        : `Cậu đã bán **${fmt(amount, locale)}x** ${info.emoji} **${itemName}** theo giá chợ **${fmt(res.unit_price, locale)}** ${config.CURRENCY}/sp!\n\n💰 Thu về: **+${fmt(res.earned, locale)}** ${config.CURRENCY}\n💳 Số dư mới: **${fmt(res.new_wallet, locale)}** ${config.CURRENCY}`,
                })],
            });
        }

        return interaction.reply({
            embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.invalid_subcommand') })],
        });
    },
};
