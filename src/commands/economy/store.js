const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');
const { isItemInSeason, SEASON_LABEL } = require('../../lib/season');
const { handleNewbieQuest } = require('../../lib/newbie');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', property: '🏠', luxury: '💎', misc: '📦' };
const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('Cửa hàng vật phẩm và giao dịch 🏪')
        .addSubcommand(s => s.setName('list').setDescription('Xem cửa hàng vật phẩm'))
        .addSubcommand(s => s.setName('buy').setDescription('Mua vật phẩm từ cửa hàng')
            .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn mua').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1).setRequired(false)))
        .addSubcommand(s => s.setName('sell').setDescription('Bán vật phẩm trong kho đồ (thu về 50% giá)')
            .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn bán').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1).setRequired(false))),

    async autocomplete(interaction) {
        const { getInteractionLanguage, t } = require('../../lib/i18n');
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toLowerCase();

        if (sub === 'buy') {
            const items = await db.getItems();
            const choices = items
                .filter(i => !i.shop_hidden && isItemInSeason(i) && (i.name.toLowerCase().includes(focused) || i.id.includes(focused) || (t(locale, `data.items.${i.id}.name`) || '').toLowerCase().includes(focused)))
                .slice(0, 25)
                .map(i => {
                    const name = t(locale, `data.items.${i.id}.name`) || i.name;
                    return { name: `${name} — ${fmt(i.price, locale)} ${config.CURRENCY}`, value: i.id };
                });
            await interaction.respond(choices);
        } else if (sub === 'sell') {
            const inv = await db.getInventory(interaction.user.id);
            const choices = inv
                .filter(r => (r.items?.name || '').toLowerCase().includes(focused) || r.item_id.includes(focused) || (t(locale, `data.items.${r.item_id}.name`) || '').toLowerCase().includes(focused))
                .slice(0, 25)
                .map(r => {
                    const name = t(locale, `data.items.${r.item_id}.name`) || r.items?.name || r.item_id;
                    return { name: `${name} (x${r.quantity})`, value: r.item_id };
                });
            await interaction.respond(choices);
        }
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            await interaction.deferReply();
            const items = (await db.getItems()).filter(i => !i.shop_hidden && isItemInSeason(i));
            if (!items.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    title: t(locale, 'commands.store.list_empty_title'),
                    description: t(locale, 'commands.store.list_empty_desc')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const lines = items.map(i => {
                const name = t(locale, `data.items.${i.id}.name`) || i.name;
                const desc = t(locale, `data.items.${i.id}.desc`) || i.description;
                return `${TYPE_ICON[i.type] || '📦'} **${name}** — \`${fmt(i.price, locale)}\` ${config.CURRENCY}\n` +
                    `　↳ \`${i.id}\`${desc ? ` · ${desc}` : ''}`;
            });

            await sendPaginated(interaction, {
                title: t(locale, 'commands.store.list_title'),
                color: config.COLORS.INFO,
                lines,
                perPage: 6,
                footerNote: t(locale, 'commands.store.list_footer'),
            });
        }

        if (sub === 'buy') {
            await interaction.deferReply();
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('quantity') || 1;

            const item = await db.getItem(itemId);
            if (!item || item.shop_hidden) {
                const embed = buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.store.buy_title'), description: t(locale, 'commands.store.buy_no_item') });
                return interaction.editReply({ embeds: [embed] });
            }
            if (item.season && !isItemInSeason(item)) {
                const seasonLabel = t(locale, `commands.store.seasons.${item.season}`) || SEASON_LABEL[item.season] || '';
                const name = t(locale, `data.items.${item.id}.name`) || item.name;
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    title: t(locale, 'commands.store.buy_title'),
                    description: t(locale, 'commands.store.buy_season_error', { name, season: seasonLabel })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const result = await db.buyItem(interaction.user.id, itemId, qty);
            const total = (Number(item.price) * qty);
            const name = t(locale, `data.items.${item.id}.name`) || item.name;

            if (result === 'ok') {
                await handleNewbieQuest(interaction, 'buy', 1);
                const u = await db.getUser(interaction.user.id);
                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.store.buy_title'),
                    description: t(locale, 'commands.store.buy_success', { qty, name, total: fmt(total, locale), wallet: fmt(u?.wallet || 0, locale), currency: config.CURRENCY })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const msg = {
                insufficient_funds: t(locale, 'commands.store.buy_error_insufficient', { total: fmt(total, locale), currency: config.CURRENCY }),
                no_item: t(locale, 'commands.store.buy_error_no_item'),
                bad_quantity: t(locale, 'commands.store.buy_error_bad_qty'),
            }[result] || t(locale, 'commands.store.buy_error_generic');

            const embedErr = buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.store.buy_title'), description: msg });
            return interaction.editReply({ embeds: [embedErr] });
        }

        if (sub === 'sell') {
            await interaction.deferReply();
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('quantity') || 1;
            const item = await db.getItem(itemId);
            if (!item) {
                const embed = buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.store.sell_title'), description: t(locale, 'commands.store.sell_no_item') });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.sellItem(interaction.user.id, itemId, qty);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.store.sell_title'), description: t(locale, 'commands.store.sell_error_generic') });
                return interaction.editReply({ embeds: [embed] });
            }
            const name = t(locale, `data.items.${item.id}.name`) || item.name;
            if (r.status !== 'ok') {
                const msg = {
                    no_have: t(locale, 'commands.store.sell_error_no_have', { name }),
                    no_item: t(locale, 'commands.store.buy_error_no_item'),
                    bad_quantity: t(locale, 'commands.store.sell_error_bad_qty'),
                }[r.status] || t(locale, 'commands.store.sell_error_generic');
                const embed = buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.store.sell_title'), description: msg });
                return interaction.editReply({ embeds: [embed] });
            }

            const u = await db.getUser(interaction.user.id);
            const embedSuccess = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.store.sell_title'),
                description: t(locale, 'commands.store.sell_success', { qty, name, gain: fmt(r.gain, locale), wallet: fmt(u?.wallet || 0, locale), currency: config.CURRENCY })
            });
            await interaction.editReply({ embeds: [embedSuccess] });
        }
    },
};
