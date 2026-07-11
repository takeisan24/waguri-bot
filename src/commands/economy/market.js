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
        .setDescription('Chợ mua bán đồ giữa người chơi 🛒')
        .addSubcommand(s => s.setName('view').setDescription('Xem các món đang bán'))
        .addSubcommand(s => s.setName('mine').setDescription('Xem các món cậu đang bán'))
        .addSubcommand(s => s.setName('sell').setDescription('Đăng bán một món trong kho')
            .addStringOption(o => o.setName('item').setDescription('Món muốn bán').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('price').setDescription('Giá bán (cả lô)').setRequired(true).setMinValue(config.MARKET.MIN_PRICE))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('buy').setDescription('Mua một món theo mã')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('cancel').setDescription('Gỡ món cậu đang bán (trả về kho)')
            .addIntegerOption(o => o.setName('id').setDescription('Mã món (#)').setRequired(true).setMinValue(1))),

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
    },
};
