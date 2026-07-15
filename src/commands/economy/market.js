const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Chợ mua bán & đấu giá đồ giữa người chơi 🛒')
        .addSubcommand(s => s.setName('view').setDescription('Xem các món đang bán'))
        .addSubcommand(s => s.setName('mine').setDescription('Xem các món cậu đang bán'))
        .addSubcommand(s => s.setName('sell').setDescription('Đăng bán một món trong kho')
            .addStringOption(o => o.setName('item').setDescription('Món muốn bán').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('price').setDescription('Giá bán (cả lô)').setRequired(true).setMinValue(config.MARKET.MIN_PRICE))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('buy').setDescription('Mua một món theo mã')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('cancel').setDescription('Gỡ món cậu đang bán (trả về kho)')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1)))
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

    async autocomplete(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toLowerCase();
        const inv = await db.getInventory(interaction.user.id);
        await interaction.respond(inv
            .filter(r => {
                const name = t(locale, `items.${r.item_id}.name`) || r.items?.name || r.item_id;
                return name.toLowerCase().includes(focused) || r.item_id.includes(focused);
            })
            .slice(0, 25).map(r => {
                const name = t(locale, `items.${r.item_id}.name`) || r.items?.name || r.item_id;
                return { name: `${name} (x${r.quantity})`, value: r.item_id };
            }));
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const items = await db.getItems();
        const nameOf = id => {
            const originalName = items.find(i => i.id === id)?.name || id;
            return t(locale, `items.${id}.name`) || originalName;
        };

        if (sub === 'auctions') {
            await interaction.deferReply();
            const rows = await db.getActiveAuctions(50);
            if (!rows.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.market.err_auctions_empty')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const lines = rows.map(r => {
                const endsAtTime = new Date(r.ends_at).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
                const highestBidderStr = r.highest_bidder_id
                    ? t(locale, 'commands.market.auction_highest_bidder', { user: `<@${r.highest_bidder_id}>`, bid: fmt(r.current_bid, locale), currency: config.CURRENCY })
                    : t(locale, 'commands.market.auction_no_bids', { starting: fmt(r.starting_bid, locale), currency: config.CURRENCY });

                return t(locale, 'commands.market.auction_line', {
                    id: r.id,
                    qty: r.qty,
                    name: nameOf(r.item_id),
                    seller: `<@${r.seller_id}>`,
                    highest: highestBidderStr,
                    ends: endsAtTime
                });
            });
            return sendPaginated(interaction, {
                title: t(locale, 'commands.market.title_auctions'),
                color: config.COLORS.INFO,
                lines,
                perPage: 10,
                footerNote: t(locale, 'commands.market.paginated_footer'),
            });
        }

        if (sub === 'view' || sub === 'mine') {
            await interaction.deferReply();
            const rows = sub === 'mine' ? await db.marketMine(interaction.user.id) : await db.marketActive(50);
            if (!rows.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: sub === 'mine' ? t(locale, 'commands.market.err_mine_empty') : t(locale, 'commands.market.err_view_empty')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const lines = rows.map(r => {
                const baseStr = t(locale, 'commands.market.view_line', {
                    id: r.id,
                    qty: r.qty,
                    name: nameOf(r.item_id),
                    price: fmt(r.price, locale),
                    currency: config.CURRENCY
                });
                const sellerStr = sub === 'view' ? t(locale, 'commands.market.view_seller', { user: r.seller_id }) : '';
                return baseStr + sellerStr;
            });
            return sendPaginated(interaction, {
                title: sub === 'mine' ? t(locale, 'commands.market.title_mine') : t(locale, 'commands.market.title_view'),
                color: config.COLORS.INFO,
                lines,
                perPage: 10,
                footerNote: t(locale, 'commands.market.paginated_footer'),
            });
        }

        await interaction.deferReply();
        if (sub === 'sell') {
            const itemId = interaction.options.getString('item');
            const price = interaction.options.getInteger('price');
            const qty = interaction.options.getInteger('qty') || 1;
            const r = await db.marketList(interaction.user.id, itemId, qty, price);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r.status === 'poor_item') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_list'),
                    description: t(locale, 'commands.market.err_poor_item', { qty, name: nameOf(itemId) })
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.market.list_success_title'),
                description: t(locale, 'commands.market.list_success_desc', {
                    qty,
                    name: nameOf(itemId),
                    price: fmt(price, locale),
                    currency: config.CURRENCY,
                    id: r.id,
                    feePct: Math.round(config.MARKET.FEE_PCT * 100)
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'buy') {
            const id = interaction.options.getInteger('id');
            const r = await db.marketBuy(interaction.user.id, id);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            let msg;
            if (r.status === 'notfound') {
                msg = t(locale, 'commands.market.err_not_found');
            } else if (r.status === 'gone') {
                msg = t(locale, 'commands.market.err_gone');
            } else if (r.status === 'own') {
                msg = t(locale, 'commands.market.err_own');
            } else if (r.status === 'poor') {
                msg = t(locale, 'commands.market.err_poor', { price: fmt(r.price, locale), currency: config.CURRENCY });
            }

            if (msg) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_buy'),
                    description: msg
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.market.buy_success_title'),
                description: t(locale, 'commands.market.buy_success_desc', {
                    qty: r.qty,
                    name: nameOf(r.item),
                    price: fmt(r.price, locale),
                    currency: config.CURRENCY,
                    seller: r.seller
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'cancel') {
            const id = interaction.options.getInteger('id');
            const r = await db.marketCancel(interaction.user.id, id);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            let msg;
            if (r.status === 'notfound') {
                msg = t(locale, 'commands.market.err_not_found');
            } else if (r.status === 'notyours') {
                msg = t(locale, 'commands.market.err_not_yours');
            } else if (r.status === 'gone') {
                msg = t(locale, 'commands.market.err_gone');
            }

            if (msg) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_cancel'),
                    description: msg
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.market.cancel_success_title'),
                description: t(locale, 'commands.market.cancel_success_desc', {
                    qty: r.qty,
                    name: nameOf(r.item)
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'auction') {
            const itemId = interaction.options.getString('item');
            const startingBid = interaction.options.getInteger('starting_bid');
            const minIncrement = interaction.options.getInteger('min_increment');
            const hours = interaction.options.getInteger('hours');
            const qty = interaction.options.getInteger('qty') || 1;

            if (startingBid > config.AUCTION.MAX_BID_LIMIT || minIncrement > config.AUCTION.MAX_BID_LIMIT) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_max_bid_limit', { limit: fmt(config.AUCTION.MAX_BID_LIMIT, locale) })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.createAuction(interaction.user.id, itemId, qty, startingBid, minIncrement, hours, interaction.guildId, interaction.channelId);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            if (r.status === 'poor_item') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_auction'),
                    description: t(locale, 'commands.market.err_poor_item', { qty, name: nameOf(itemId) })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            if (r.status === 'poor_fee') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_auction'),
                    description: t(locale, 'commands.market.err_poor_fee', { fee: fmt(config.AUCTION.LISTING_FEE, locale), currency: config.CURRENCY })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const endsAtTime = new Date(Date.now() + hours * 3600_000).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.market.auction_success_title'),
                description: t(locale, 'commands.market.auction_success_desc', {
                    qty,
                    name: nameOf(itemId),
                    starting: fmt(startingBid, locale),
                    inc: fmt(minIncrement, locale),
                    ends: endsAtTime,
                    currency: config.CURRENCY,
                    id: r.id,
                    fee: fmt(config.AUCTION.LISTING_FEE, locale)
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'bid') {
            const id = interaction.options.getInteger('id');
            const amount = interaction.options.getInteger('amount');

            if (amount > config.AUCTION.MAX_BID_LIMIT) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_max_bid_limit', { limit: fmt(config.AUCTION.MAX_BID_LIMIT, locale) })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.placeBid(interaction.user.id, id, amount);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            let msg;
            if (r.status === 'notfound') {
                msg = t(locale, 'commands.market.err_not_found');
            } else if (r.status === 'not_active') {
                msg = t(locale, 'commands.market.err_auction_not_active');
            } else if (r.status === 'ended') {
                msg = t(locale, 'commands.market.err_auction_ended');
            } else if (r.status === 'own') {
                msg = t(locale, 'commands.market.err_own_bid');
            } else if (r.status === 'highest') {
                msg = t(locale, 'commands.market.err_highest_bid');
            } else if (r.status === 'low_bid') {
                msg = t(locale, 'commands.market.err_low_bid', { min: fmt(r.min_required, locale), currency: config.CURRENCY });
            } else if (r.status === 'poor') {
                msg = t(locale, 'commands.market.err_poor_bid', { amount: fmt(amount, locale), currency: config.CURRENCY });
            }

            if (msg) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_bid'),
                    description: msg
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Gửi DM thông báo outbid cho người đặt giá trước đó nếu có
            if (r.previous_bidder_id) {
                try {
                    const prevUser = await interaction.client.users.fetch(r.previous_bidder_id);
                    if (prevUser) {
                        const outbidEmbed = buildWaguriEmbed(interaction, 'warning', {
                            locale,
                            title: locale.startsWith('en') ? '🔨 Outbid Notification' : '🔨 Thông báo vượt giá!',
                            description: locale.startsWith('en')
                                ? `You have been outbid on auction **#${id}**. Your bid of **${fmt(r.previous_bid_amount, locale)} ${config.CURRENCY}** has been refunded to your wallet.`
                                : `Cậu ơi! Lượt đặt giá **${fmt(r.previous_bid_amount, locale)} ${config.CURRENCY}** của cậu cho phiên đấu giá **#${id}** đã bị người khác vượt qua rồi. Số tiền đã được hoàn trả về ví của cậu nhé!`
                        });
                        await prevUser.send({ embeds: [outbidEmbed] });
                    }
                } catch (e) {
                    console.log(`[DM WARN] Không thể gửi DM outbid cho ${r.previous_bidder_id}: ${e.message}`);
                }
            }

            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.market.bid_success_title'),
                description: t(locale, 'commands.market.bid_success_desc', {
                    id,
                    amount: fmt(amount, locale),
                    currency: config.CURRENCY
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'cancel-auction') {
            const id = interaction.options.getInteger('id');
            const r = await db.cancelAuction(interaction.user.id, id);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.market.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            let msg;
            if (r.status === 'notfound') {
                msg = t(locale, 'commands.market.err_not_found');
            } else if (r.status === 'notyours') {
                msg = t(locale, 'commands.market.err_not_yours');
            } else if (r.status === 'not_active') {
                msg = t(locale, 'commands.market.err_auction_not_active');
            } else if (r.status === 'has_bids') {
                msg = t(locale, 'commands.market.err_cancel_auction_has_bids');
            }

            if (msg) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.market.title_cancel_auction'),
                    description: msg
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.market.cancel_auction_success_title'),
                description: t(locale, 'commands.market.cancel_auction_success_desc', {
                    id,
                    qty: r.qty,
                    name: nameOf(r.item)
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
