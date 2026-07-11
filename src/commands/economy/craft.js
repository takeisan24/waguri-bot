const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const RECIPES = require('../../data/recipes');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('craft')
        .setDescription('Chế tạo đồ từ nguyên liệu (gỗ/quặng/đá) 🔨')
        .addSubcommand(s => s.setName('list').setDescription('Xem công thức chế tạo'))
        .addSubcommand(s => s.setName('make').setDescription('Chế một món')
            .addStringOption(o => o.setName('recipe').setDescription('Món muốn chế').setRequired(true).setAutocomplete(true))),

    async autocomplete(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toLowerCase();
        await interaction.respond(RECIPES
            .filter(r => {
                const name = t(locale, `items.${r.result}.name`) || r.name;
                return name.toLowerCase().includes(focused) || r.id.includes(focused);
            })
            .slice(0, 25).map(r => {
                const name = t(locale, `items.${r.result}.name`) || r.name;
                return { name, value: r.id };
            }));
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const items = await db.getItems();
        const nameOf = id => {
            const originalName = items.find(i => i.id === id)?.name || id;
            return t(locale, `items.${id}.name`) || originalName;
        };
        const priceOf = id => Number(items.find(i => i.id === id)?.price || 0);
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') {
            const lines = RECIPES.map(r => {
                const mats = Object.entries(r.mats).map(([id, q]) => `${q}× ${nameOf(id)}`).join(' + ');
                const costStr = r.cost > 0 ? t(locale, 'commands.craft.cost_fee', { fee: fmt(r.cost, locale), currency: config.CURRENCY }) : '';
                const recipeName = t(locale, `items.${r.result}.name`) || r.name;
                const resaleVal = fmt(Math.floor(priceOf(r.result) * 0.5), locale);
                return t(locale, 'commands.craft.list_line', {
                    name: recipeName,
                    mats,
                    costStr,
                    resale: resaleVal,
                    currency: config.CURRENCY
                });
            });
            
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.craft.embed_title'),
                description: t(locale, 'commands.craft.embed_desc', { list: lines.join('\n') })
            });
            embed.setFooter({
                text: t(locale, 'commands.craft.footer') + ` • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const id = interaction.options.getString('recipe');
        const recipe = RECIPES.find(r => r.id === id);
        if (!recipe) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.craft.err_recipe_not_found')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const r = await db.craftItem(interaction.user.id, recipe);
        if (!r) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.craft.err_system')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (r.status === 'poor_money') {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.craft.err_poor_money', {
                    cost: fmt(recipe.cost, locale),
                    currency: config.CURRENCY
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (r.status === 'poor_mat') {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.craft.err_poor_mat', {
                    mat: nameOf(r.missing)
                })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const recipeName = t(locale, `items.${recipe.result}.name`) || recipe.name;
        const embed = buildWaguriEmbed(interaction, 'success', {
            description: t(locale, 'commands.craft.success_desc', {
                qty: recipe.qty,
                name: recipeName
            })
        });
        return interaction.editReply({ embeds: [embed] });
    },
};
