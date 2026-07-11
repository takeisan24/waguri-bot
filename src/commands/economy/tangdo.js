const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tangdo')
        .setDescription('Tặng vật phẩm trong kho cho người khác (mọi loại: đồ ăn, dụng cụ, xe...) 🎁')
        .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn tặng').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1)),

    async autocomplete(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toLowerCase();
        const inv = await db.getInventory(interaction.user.id);
        const choices = inv
            .filter(r => {
                const name = t(locale, `items.${r.item_id}.name`) || r.items?.name || r.item_id;
                return name.toLowerCase().includes(focused) || r.item_id.includes(focused);
            })
            .slice(0, 25)
            .map(r => {
                const name = t(locale, `items.${r.item_id}.name`) || r.items?.name || r.item_id;
                return { name: `${name} (x${r.quantity})`, value: r.item_id };
            });
        await interaction.respond(choices);
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const target = interaction.options.getUser('user');
        const itemId = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const err = (description) => interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.tangdo.embed_title_warning'),
                description
            })]
        });

        const isWaguri = target.id === interaction.client.user.id;
        if (!target || (target.bot && !isWaguri)) return err(t(locale, 'commands.tangdo.err_target_missing'));
        if (target.id === interaction.user.id) return err(t(locale, 'commands.tangdo.err_self'));
        if (qty < 1) return err(t(locale, 'commands.tangdo.err_invalid_quantity'));

        const item = await db.getItem(itemId);
        if (!item) return err(t(locale, 'commands.tangdo.err_item_not_found'));

        const itemName = t(locale, `items.${item.id}.name`) || item.name;

        if (isWaguri) {
            // Tặng quà cho Waguri
            const gifts = {
                bo_hoa: { gain: 10, msg: t(locale, 'commands.tangdo.gifts.bo_hoa') },
                hop_qua: { gain: 25, msg: t(locale, 'commands.tangdo.gifts.hop_qua') },
                gau_bong: { gain: 50, msg: t(locale, 'commands.tangdo.gifts.gau_bong') }
            };
            const gift = gifts[itemId];
            if (!gift) {
                return err(t(locale, 'commands.tangdo.err_weird_gift', { gift: itemName }));
            }

            const ok = await db.takeItem(interaction.user.id, itemId, qty);
            if (!ok) return err(t(locale, 'commands.tangdo.err_poor_self', { qty, gift: itemName }));

            const totalGain = gift.gain * qty;
            const res = await db.incrAffection(interaction.user.id, totalGain);
            const newAff = res ? res.affection : 0;
            const added = res ? res.added : 0;
            const capped = res ? res.capped : false;

            let desc = `${gift.msg}\n\n`;
            if (added > 0) {
                desc += t(locale, 'commands.tangdo.success_aff_add', { added, newAff });
                if (capped) {
                    desc += `\n` + t(locale, 'commands.tangdo.success_aff_capped');
                }
            } else {
                desc += t(locale, 'commands.tangdo.success_aff_limit', { newAff });
            }

            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.tangdo.waguri_gift_success_title'),
                description: desc
            });
            return interaction.editReply({ embeds: [embed] });
        }

        await db.getUser(target.id); // đảm bảo người nhận có hồ sơ (tự tạo nếu chưa)
        const ok = await db.transferItem(interaction.user.id, target.id, itemId, qty);
        if (!ok) return err(t(locale, 'commands.tangdo.err_poor_player', { qty, gift: itemName }));

        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.tangdo.success_title'),
            description: t(locale, 'commands.tangdo.success_desc', { qty, gift: itemName, target: target.id })
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
