const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eat')
        .setDescription('Dùng đồ ăn/uống để hồi năng lượng hoặc nhận buff')
        .addStringOption(o => o.setName('item').setDescription('Món muốn dùng').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1).setMaxValue(50)),

    async autocomplete(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toLowerCase();
        const items = await db.getItems();
        const choices = items
            .filter(i => i.effect_type && i.effect_type !== 'none')
            .filter(i => {
                const name = t(locale, `items.${i.id}.name`) || i.name;
                return name.toLowerCase().includes(focused) || i.id.includes(focused);
            })
            .slice(0, 25)
            .map(i => {
                const name = t(locale, `items.${i.id}.name`) || i.name;
                return { name, value: i.id };
            });
        await interaction.respond(choices);
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const itemId = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await db.getItem(itemId);
        if (!item) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.eat.embed_title'),
                description: t(locale, 'commands.eat.err_item_not_found')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const itemName = t(locale, `items.${item.id}.name`) || item.name;

        // Dùng lần lượt tới khi đủ số lượng hoặc hết đồ trong kho
        let used = 0, lastStatus = 'ok';
        for (let i = 0; i < qty; i++) {
            const r = await db.consumeItem(interaction.user.id, itemId);
            if (r === 'ok') used++;
            else { lastStatus = r; break; }
        }

        if (used === 0) {
            let msg;
            if (lastStatus === 'no_have') {
                msg = t(locale, 'commands.eat.err_no_have', { item: itemName });
            } else if (lastStatus === 'not_consumable') {
                msg = t(locale, 'commands.eat.err_not_consumable', { item: itemName });
            } else if (lastStatus === 'no_item') {
                msg = t(locale, 'commands.eat.err_item_not_found');
            } else if (lastStatus === 'buff_better_exists') {
                msg = t(locale, 'commands.eat.err_buff_better', { item: itemName });
            } else {
                msg = t(locale, 'commands.eat.err_system');
            }

            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.eat.embed_title'),
                description: msg
            });
            return interaction.editReply({ embeds: [embed] });
        }

        let effectText;
        if (item.effect_type === 'energy') {
            const energy = await db.getEnergy(interaction.user.id);
            effectText = t(locale, 'commands.eat.effect_energy', { current: energy, max: config.ENERGY.MAX });
        } else if (item.effect_type === 'health') {
            const u = await db.getUser(interaction.user.id);
            effectText = t(locale, 'commands.eat.effect_health', { value: item.effect_value, current: u?.health ?? '?' });
        } else if (item.effect_type === 'buff') {
            effectText = t(locale, 'commands.eat.effect_buff', { value: item.effect_value, hours: item.effect_duration_hours || 1 });
        } else {
            effectText = t(locale, 'commands.eat.effect_done');
        }
        const note = used < qty ? t(locale, 'commands.eat.effect_shortage_note', { count: used }) : '';

        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.eat.success_title'),
            description: t(locale, 'commands.eat.success_desc', {
                count: used,
                item: itemName,
                effectText,
                note
            })
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
