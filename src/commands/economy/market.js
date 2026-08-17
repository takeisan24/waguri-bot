// ============================================================
// /market — GỘP BA hệ thống:
//   1. Chợ hệ thống (giá biến động 4h)  : prices · sell
//   2. Chợ giữa người chơi (P2P)         : view · mine · list · buy · cancel
//   3. Đấu giá                            : auctions · auction · bid · cancel-auction
//
// LỊCH SỬ: commit baf61de (feature giá biến động) GHI ĐÈ toàn bộ file này, xoá mất 9
// subcommand của (2) và (3) — trong khi hạ tầng vẫn sống nguyên (RPC market_list/
// market_buy/market_cancel + auctions, 10 helper trong database.js, 46 khoá i18n) và
// index.js vẫn chạy runAuctionResolution() mỗi 60 giây cho hệ thống không ai vào được.
// /help và trang web vẫn quảng cáo đủ 10 subcommand -> người chơi làm theo và bot im lặng.
// File này khôi phục lại đầy đủ.
//
// ĐỔI TÊN: subcommand đăng bán P2P cũ tên `sell`, nay là `list` — vì `sell` giờ mang
// nghĩa "bán cho hệ thống theo giá chợ". Khoá i18n vốn đã tên `title_list`/
// `list_success_*` từ đầu, nên đây là trả lại đúng tên chứ không phải đổi nghĩa.
// ============================================================
const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { getLiveMarketPrices, getNextShiftCountdown, BASE_MARKET_ITEMS } = require('../../lib/market');

const fmt = (n, locale) => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Chợ nông sản biến động, chợ giữa người chơi & đấu giá 🛒📈')
        // --- 1) Chợ hệ thống: giá biến động 4h ---
        .addSubcommand(s => s.setName('prices')
            .setDescription('Xem biến động giá chợ hiện tại & thời gian đổi giá tiếp theo 📊'))
        .addSubcommand(s => s.setName('sell')
            .setDescription('Bán nông/thủy/khoáng sản cho hệ thống theo giá chợ biến động 💸')
            .addStringOption(o => o.setName('item').setDescription('Loại nông/thủy sản cần bán').setRequired(true)
                .addChoices(
                    // Tên PHẢI khớp `items.name` trong DB. Trước đây chỗ này gọi hoa là
                    // "Cà Chua"/"Dưa Hấu" và quặng sắt là "Đá Siêu Cấp" — người chơi trồng
                    // hoa cúc, thu về thứ mà chợ bảo là cà chua. Xem docs/spec-dot-6-i18n-3-tang.md
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
            .addIntegerOption(o => o.setName('amount').setDescription('Số lượng cần bán (nhập > 0)').setRequired(true).setMinValue(1)))
        // --- 2) Chợ giữa người chơi ---
        .addSubcommand(s => s.setName('view').setDescription('Xem các món người chơi khác đang bán 🛒'))
        .addSubcommand(s => s.setName('mine').setDescription('Xem các món cậu đang bán'))
        .addSubcommand(s => s.setName('list').setDescription('Đăng bán một món trong kho cho người chơi khác')
            .addStringOption(o => o.setName('item').setDescription('Món muốn bán').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('price').setDescription('Giá bán (cả lô)').setRequired(true).setMinValue(config.MARKET.MIN_PRICE))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('buy').setDescription('Mua một món theo mã')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('cancel').setDescription('Gỡ món cậu đang bán (trả về kho)')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1)))
        // --- 3) Đấu giá ---
        .addSubcommand(s => s.setName('auctions').setDescription('Xem các phiên đấu giá đang hoạt động 🔨'))
        .addSubcommand(s => s.setName('auction').setDescription('Tạo một phiên đấu giá vật phẩm 🔨')
            .addStringOption(o => o.setName('item').setDescription('Món muốn đấu giá').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('starting_bid').setDescription('Giá khởi điểm').setRequired(true).setMinValue(config.AUCTION.MIN_STARTING_BID))
            .addIntegerOption(o => o.setName('min_increment').setDescription('Bước giá tối thiểu').setRequired(true).setMinValue(config.AUCTION.MIN_INCREMENT))
            .addIntegerOption(o => o.setName('hours').setDescription('Thời gian đấu giá (giờ)').setRequired(true).setMinValue(1).setMaxValue(48))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng').setMinValue(1)))
        .addSubcommand(s => s.setName('bid').setDescription('Đặt giá cho một phiên đấu giá 💰')
            .addIntegerOption(o => o.setName('id').setDescription('Mã phiên đấu giá (#)').setRequired(true).setMinValue(1))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền đặt giá').setRequired(true).setMinValue(config.AUCTION.MIN_STARTING_BID)))
        .addSubcommand(s => s.setName('cancel-auction').setDescription('Hủy phiên đấu giá của cậu (khi chưa có ai bid) 🔨')
            .addIntegerOption(o => o.setName('id').setDescription('Mã phiên đấu giá (#)').setRequired(true).setMinValue(1))),

    // Autocomplete chỉ áp cho `list` và `auction` (chọn món từ KHO của người chơi).
    // `sell` dùng addChoices cố định nên Discord không gọi autocomplete cho nó.
    async autocomplete(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toLowerCase();
        const inv = await db.getInventory(interaction.user.id);
        await interaction.respond(inv
            .filter(r => {
                const name = t(locale, `data.items.${r.item_id}.name`) || r.items?.name || r.item_id;
                return name.toLowerCase().includes(focused) || r.item_id.includes(focused);
            })
            .slice(0, 25).map(r => {
                const name = t(locale, `data.items.${r.item_id}.name`) || r.items?.name || r.item_id;
                return { name: `${name} (x${r.quantity})`, value: r.item_id };
            }));
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const isEn = locale === 'en';

        // ============================================================
        // 1) CHỢ HỆ THỐNG — giá biến động theo block 4h
        // ============================================================
        if (sub === 'prices') {
            const prices = await getLiveMarketPrices();
            const countdown = getNextShiftCountdown();

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
                    return `${p.emoji} **${name}**: **${fmt(p.currentPrice, locale)}** ${config.CURRENCY} (${icon} \`${pctSign}\`)`;
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

        // ============================================================
        // 2) + 3) CHỢ P2P & ĐẤU GIÁ
        // ============================================================
        // ACK TRƯỚC, truy vấn SAU. Bản cũ gọi db.getItems() rồi mới deferReply() —
        // một lần Supabase chậm (log prod có EAI_AGAIN) là quá 3 giây và interaction
        // chết với 10062. Mọi nhánh dưới đây đều defer nên gom lên một chỗ.
        await interaction.deferReply();
        const items = await db.getItems();
        const nameOf = id => t(locale, `data.items.${id}.name`) || items.find(i => i.id === id)?.name || id;

        if (sub === 'auctions') {
            const rows = await db.getActiveAuctions(50);
            if (!rows.length) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', { locale, description: t(locale, 'commands.market.err_auctions_empty') })],
                });
            }
            const lines = rows.map(r => t(locale, 'commands.market.auction_line', {
                id: r.id,
                qty: r.qty,
                name: nameOf(r.item_id),
                seller: `<@${r.seller_id}>`,
                highest: r.highest_bidder_id
                    ? t(locale, 'commands.market.auction_highest_bidder', { user: `<@${r.highest_bidder_id}>`, bid: fmt(r.current_bid, locale), currency: config.CURRENCY })
                    : t(locale, 'commands.market.auction_no_bids', { starting: fmt(r.starting_bid, locale), currency: config.CURRENCY }),
                ends: new Date(r.ends_at).toLocaleString(isEn ? 'en-US' : 'vi-VN'),
            }));
            return sendPaginated(interaction, {
                title: t(locale, 'commands.market.title_auctions'),
                color: config.COLORS.INFO,
                lines,
                perPage: 10,
                footerNote: t(locale, 'commands.market.paginated_footer'),
            });
        }

        if (sub === 'view' || sub === 'mine') {
            const rows = sub === 'mine' ? await db.marketMine(interaction.user.id) : await db.marketActive(50);
            if (!rows.length) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: sub === 'mine' ? t(locale, 'commands.market.err_mine_empty') : t(locale, 'commands.market.err_view_empty'),
                    })],
                });
            }
            const lines = rows.map(r => {
                const base = t(locale, 'commands.market.view_line', {
                    id: r.id, qty: r.qty, name: nameOf(r.item_id),
                    price: fmt(r.price, locale), currency: config.CURRENCY,
                });
                return base + (sub === 'view' ? t(locale, 'commands.market.view_seller', { user: r.seller_id }) : '');
            });
            return sendPaginated(interaction, {
                title: sub === 'mine' ? t(locale, 'commands.market.title_mine') : t(locale, 'commands.market.title_view'),
                color: config.COLORS.INFO,
                lines,
                perPage: 10,
                footerNote: t(locale, 'commands.market.paginated_footer'),
            });
        }

        // Lỗi hệ thống dùng chung cho mọi nhánh còn lại (helper trả null khi DB lỗi).
        const systemError = () => interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'commands.market.err_system') })],
        });
        const failWith = (title, description) => interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'error', { locale, title, description })],
        });

        if (sub === 'list') {
            const itemId = interaction.options.getString('item');
            const price = interaction.options.getInteger('price');
            const qty = interaction.options.getInteger('qty') || 1;
            const r = await db.marketList(interaction.user.id, itemId, qty, price);
            if (!r) return systemError();
            if (r.status === 'poor_item') {
                return failWith(t(locale, 'commands.market.title_list'), t(locale, 'commands.market.err_poor_item', { qty, name: nameOf(itemId) }));
            }
            // `bad_qty` do migration 0095_audit thêm khi siết market_list (FOR UPDATE + guard).
            // Bản lệnh gốc viết TRƯỚC 0095 nên không biết status này -> rơi thẳng xuống embed
            // THÀNH CÔNG với `id: undefined` dù không có gì được đăng bán. Slash chặn được nhờ
            // setMinValue(1), nhưng đường PREFIX (`w!market list go 500 0`) không qua kiểm tra
            // của Discord — parseOptions chỉ làm Number(raw).
            if (r.status === 'bad_qty') {
                return failWith(t(locale, 'commands.market.title_list'), t(locale, 'commands.store.sell_error_bad_qty'));
            }
            // `bad_price` do migration 0107 thêm khi vá MÁY IN TIỀN qua giá âm:
            // market_buy làm `wallet - v_price where wallet >= v_price`, với v_price âm
            // thì điều kiện luôn đúng và phép trừ thành phép CỘNG cho người mua
            // (đã đo trên test: mua +1.000.000, bán -950.000, ròng +50.000 từ không khí).
            // Slash chặn nhờ setMinValue, đường prefix thì không.
            if (r.status === 'bad_price') {
                return failWith(t(locale, 'commands.market.title_list'), isEn
                    ? '❌ Price must be greater than 0!'
                    : '❌ Giá bán phải lớn hơn 0 nhen~');
            }
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.market.list_success_title'),
                    description: t(locale, 'commands.market.list_success_desc', {
                        qty, name: nameOf(itemId), price: fmt(price, locale),
                        currency: config.CURRENCY, id: r.id,
                        feePct: Math.round(config.MARKET.FEE_PCT * 100),
                    }),
                })],
            });
        }

        if (sub === 'buy') {
            const id = interaction.options.getInteger('id');
            const r = await db.marketBuy(interaction.user.id, id);
            if (!r) return systemError();
            const msg = {
                __proto__: null,
                notfound: t(locale, 'commands.market.err_not_found'),
                gone: t(locale, 'commands.market.err_gone'),
                own: t(locale, 'commands.market.err_own'),
                poor: t(locale, 'commands.market.err_poor', { price: fmt(r.price, locale), currency: config.CURRENCY }),
            }[r.status];
            if (msg) return failWith(t(locale, 'commands.market.title_buy'), msg);
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.market.buy_success_title'),
                    description: t(locale, 'commands.market.buy_success_desc', {
                        qty: r.qty, name: nameOf(r.item), price: fmt(r.price, locale),
                        currency: config.CURRENCY, seller: r.seller,
                    }),
                })],
            });
        }

        if (sub === 'cancel') {
            const id = interaction.options.getInteger('id');
            const r = await db.marketCancel(interaction.user.id, id);
            if (!r) return systemError();
            const msg = {
                __proto__: null,
                notfound: t(locale, 'commands.market.err_not_found'),
                notyours: t(locale, 'commands.market.err_not_yours'),
                gone: t(locale, 'commands.market.err_gone'),
            }[r.status];
            if (msg) return failWith(t(locale, 'commands.market.title_cancel'), msg);
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.market.cancel_success_title'),
                    description: t(locale, 'commands.market.cancel_success_desc', { qty: r.qty, name: nameOf(r.item) }),
                })],
            });
        }

        if (sub === 'auction') {
            const itemId = interaction.options.getString('item');
            const startingBid = interaction.options.getInteger('starting_bid');
            const minIncrement = interaction.options.getInteger('min_increment');
            const hours = interaction.options.getInteger('hours');
            const qty = interaction.options.getInteger('qty') || 1;

            if (startingBid > config.AUCTION.MAX_BID_LIMIT || minIncrement > config.AUCTION.MAX_BID_LIMIT) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'error', {
                        locale,
                        description: t(locale, 'commands.market.err_max_bid_limit', { limit: fmt(config.AUCTION.MAX_BID_LIMIT, locale) }),
                    })],
                });
            }

            const r = await db.createAuction(interaction.user.id, itemId, qty, startingBid, minIncrement, hours, interaction.guildId, interaction.channelId);
            if (!r) return systemError();
            if (r.status === 'poor_item') {
                return failWith(t(locale, 'commands.market.title_auction'), t(locale, 'commands.market.err_poor_item', { qty, name: nameOf(itemId) }));
            }
            if (r.status === 'poor_fee') {
                return failWith(t(locale, 'commands.market.title_auction'), t(locale, 'commands.market.err_poor_fee', { fee: fmt(config.AUCTION.LISTING_FEE, locale), currency: config.CURRENCY }));
            }
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.market.auction_success_title'),
                    description: t(locale, 'commands.market.auction_success_desc', {
                        qty, name: nameOf(itemId),
                        starting: fmt(startingBid, locale), inc: fmt(minIncrement, locale),
                        ends: new Date(Date.now() + hours * 3600_000).toLocaleString(isEn ? 'en-US' : 'vi-VN'),
                        currency: config.CURRENCY, id: r.id, fee: fmt(config.AUCTION.LISTING_FEE, locale),
                    }),
                })],
            });
        }

        if (sub === 'bid') {
            const id = interaction.options.getInteger('id');
            const amount = interaction.options.getInteger('amount');

            if (amount > config.AUCTION.MAX_BID_LIMIT) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'error', {
                        locale,
                        description: t(locale, 'commands.market.err_max_bid_limit', { limit: fmt(config.AUCTION.MAX_BID_LIMIT, locale) }),
                    })],
                });
            }

            const r = await db.placeBid(interaction.user.id, id, amount);
            if (!r) return systemError();
            const msg = {
                __proto__: null,
                notfound: t(locale, 'commands.market.err_not_found'),
                not_active: t(locale, 'commands.market.err_auction_not_active'),
                ended: t(locale, 'commands.market.err_auction_ended'),
                own: t(locale, 'commands.market.err_own_bid'),
                highest: t(locale, 'commands.market.err_highest_bid'),
                low_bid: t(locale, 'commands.market.err_low_bid', { min: fmt(r.min_required, locale), currency: config.CURRENCY }),
                poor: t(locale, 'commands.market.err_poor_bid', { amount: fmt(amount, locale), currency: config.CURRENCY }),
            }[r.status];
            if (msg) return failWith(t(locale, 'commands.market.title_bid'), msg);

            // Báo cho người vừa bị vượt giá — tiền của họ đã được RPC hoàn về ví.
            if (r.previous_bidder_id) {
                try {
                    const prevUser = await interaction.client.users.fetch(r.previous_bidder_id);
                    await prevUser?.send({
                        embeds: [buildWaguriEmbed(interaction, 'warning', {
                            locale,
                            title: isEn ? '🔨 Outbid Notification' : '🔨 Thông báo vượt giá!',
                            description: isEn
                                ? `You have been outbid on auction **#${id}**. Your bid of **${fmt(r.previous_bid_amount, locale)} ${config.CURRENCY}** has been refunded to your wallet.`
                                : `Cậu ơi! Lượt đặt giá **${fmt(r.previous_bid_amount, locale)} ${config.CURRENCY}** của cậu cho phiên đấu giá **#${id}** đã bị người khác vượt qua rồi. Số tiền đã được hoàn trả về ví của cậu nhé!`,
                        })],
                    });
                } catch (e) {
                    console.log(`[DM WARN] Không thể gửi DM outbid cho ${r.previous_bidder_id}: ${e.message}`);
                }
            }

            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.market.bid_success_title'),
                    description: t(locale, 'commands.market.bid_success_desc', { id, amount: fmt(amount, locale), currency: config.CURRENCY }),
                })],
            });
        }

        if (sub === 'cancel-auction') {
            const id = interaction.options.getInteger('id');
            const r = await db.cancelAuction(interaction.user.id, id);
            if (!r) return systemError();
            const msg = {
                __proto__: null,
                notfound: t(locale, 'commands.market.err_not_found'),
                notyours: t(locale, 'commands.market.err_not_yours'),
                not_active: t(locale, 'commands.market.err_auction_not_active'),
                has_bids: t(locale, 'commands.market.err_cancel_auction_has_bids'),
            }[r.status];
            if (msg) return failWith(t(locale, 'commands.market.title_cancel_auction'), msg);
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.market.cancel_auction_success_title'),
                    description: t(locale, 'commands.market.cancel_auction_success_desc', { id, qty: r.qty, name: nameOf(r.item) }),
                })],
            });
        }

        // Không khớp subcommand nào -> KHÔNG được im lặng (đó chính là lỗi
        // "The application did not respond" mà người chơi gặp khi định nghĩa lệnh
        // trên Discord lệch với code, hoặc khi gõ `w!market xyz` qua prefix).
        return interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.invalid_subcommand') })],
        });
    },
};
