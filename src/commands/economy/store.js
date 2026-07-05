const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { sendPaginated } = require('../../lib/paginate');
const { isItemInSeason, SEASON_LABEL } = require('../../lib/season');
const { handleNewbieQuest } = require('../../lib/newbie');

const TYPE_ICON = { tool: '🛠️', vehicle: '🛵', consumable: '🍞', property: '🏠', luxury: '💎', misc: '📦' };
const fmt = n => Number(n).toLocaleString('vi-VN');

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
        const sub = interaction.options.getSubcommand();
        const focused = interaction.options.getFocused().toLowerCase();

        if (sub === 'buy') {
            const items = await db.getItems();
            const choices = items
                .filter(i => !i.shop_hidden && isItemInSeason(i) && (i.name.toLowerCase().includes(focused) || i.id.includes(focused)))
                .slice(0, 25)
                .map(i => ({ name: `${i.name} — ${fmt(i.price)} ${config.CURRENCY}`, value: i.id }));
            await interaction.respond(choices);
        } else if (sub === 'sell') {
            const inv = await db.getInventory(interaction.user.id);
            const choices = inv
                .filter(r => (r.items?.name || '').toLowerCase().includes(focused) || r.item_id.includes(focused))
                .slice(0, 25)
                .map(r => ({ name: `${r.items?.name || r.item_id} (x${r.quantity})`, value: r.item_id }));
            await interaction.respond(choices);
        }
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            await interaction.deferReply();
            const items = (await db.getItems()).filter(i => !i.shop_hidden && isItemInSeason(i));
            if (!items.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    title: '🏪・Cửa Hàng Trống',
                    description: 'Cửa hàng đang trống trơn... 🕸️'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const lines = items.map(i =>
                `${TYPE_ICON[i.type] || '📦'} **${i.name}** — \`${fmt(i.price)}\` ${config.CURRENCY}\n` +
                `　↳ \`${i.id}\`${i.description ? ` · ${i.description}` : ''}`
            );

            await sendPaginated(interaction, {
                title: '🏪 Cửa Hàng Waguri',
                color: config.COLORS.INFO,
                lines,
                perPage: 6,
                footerNote: 'Mua: /store buy <item>',
            });
        }

        if (sub === 'buy') {
            await interaction.deferReply();
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('quantity') || 1;

            const item = await db.getItem(itemId);
            if (!item || item.shop_hidden) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Mua Vật Phẩm', description: 'Vật phẩm này không bán trong cửa hàng 🤔' });
                return interaction.editReply({ embeds: [embed] });
            }
            if (item.season && !isItemInSeason(item)) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    title: '🏪・Mua Vật Phẩm',
                    description: `**${item.name}** là đồ giới hạn mùa **${SEASON_LABEL[item.season] || ''}** — giờ chưa tới mùa nên Waguri chưa bán được nha~ Đợi đúng dịp ghé lại nhé 🌸`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const result = await db.buyItem(interaction.user.id, itemId, qty);
            const total = (Number(item.price) * qty);

            if (result === 'ok') {
                await handleNewbieQuest(interaction, 'buy', 1);
                const u = await db.getUser(interaction.user.id);
                const embed = buildWaguriEmbed(interaction, 'success', {
                    title: '🏪・Mua Vật Phẩm',
                    description: `Đã mua **${qty}× ${item.name}** với giá **${fmt(total)}** ${config.CURRENCY}.\n💵 Số dư ví: **${fmt(u?.wallet || 0)}** ${config.CURRENCY}`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const msg = {
                insufficient_funds: `Ví cậu chưa đủ tiền rồi 😟 — cần **${fmt(total)}** ${config.CURRENCY}. Làm thêm vài việc với \`/work\` là mua được thôi mà!`,
                no_item: 'Mình không tìm thấy vật phẩm này trong cửa hàng~',
                bad_quantity: 'Số lượng chưa hợp lệ nè, cậu nhập lại giúp mình nhé~',
            }[result] || 'Ơ, có lỗi khi mua rồi, cậu thử lại sau nhé~';

            const embedErr = buildWaguriEmbed(interaction, 'error', { title: '🏪・Mua Vật Phẩm', description: msg });
            return interaction.editReply({ embeds: [embedErr] });
        }

        if (sub === 'sell') {
            await interaction.deferReply();
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('quantity') || 1;
            const item = await db.getItem(itemId);
            if (!item) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Bán Vật Phẩm', description: 'Mình không tìm thấy vật phẩm này~ 🌸' });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.sellItem(interaction.user.id, itemId, qty);
            if (!r) {
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Bán Vật Phẩm', description: 'Ơ, có lỗi khi bán rồi, cậu thử lại sau nhé~' });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r.status !== 'ok') {
                const msg = {
                    no_have: `Cậu không có đủ **${item.name}** trong kho để bán~`,
                    no_item: 'Vật phẩm không tồn tại~',
                    bad_quantity: 'Số lượng không hợp lệ~',
                }[r.status] || 'Ơ, có lỗi rồi, thử lại sau nhé~';
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🏪・Bán Vật Phẩm', description: msg });
                return interaction.editReply({ embeds: [embed] });
            }

            const u = await db.getUser(interaction.user.id);
            const embedSuccess = buildWaguriEmbed(interaction, 'success', {
                title: '🏪・Bán Vật Phẩm',
                description: `💰 Cậu đã bán **${qty}× ${item.name}** và thu về **${fmt(r.gain)}** ${config.CURRENCY}.\n💵 Số dư ví: **${fmt(u?.wallet || 0)}** ${config.CURRENCY}`
            });
            await interaction.editReply({ embeds: [embedSuccess] });
        }
    },
};
