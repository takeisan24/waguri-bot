const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eat')
        .setDescription('Dùng đồ ăn/uống để hồi năng lượng hoặc nhận buff')
        .addStringOption(o => o.setName('item').setDescription('Món muốn dùng').setRequired(true).setAutocomplete(true)),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const items = await db.getItems();
        const choices = items
            .filter(i => i.effect_type && i.effect_type !== 'none')
            .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
            .slice(0, 25)
            .map(i => ({ name: i.name, value: i.id }));
        await interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();
        const itemId = interaction.options.getString('item');
        const item = await db.getItem(itemId);
        if (!item) return interaction.editReply('Mình không tìm thấy món này~ 🌸');

        const result = await db.consumeItem(interaction.user.id, itemId);
        if (result !== 'ok') {
            const msg = {
                no_have: `Cậu chưa có **${item.name}** trong kho. Ghé \`/shop\` mua trước nhé~`,
                not_consumable: `**${item.name}** không phải đồ ăn/uống, không dùng kiểu này được đâu~`,
                no_item: 'Mình không tìm thấy món này~',
            }[result] || 'Ơ, có lỗi rồi, cậu thử lại sau nhé~';
            return interaction.editReply(`🌸 ${msg}`);
        }

        let effectText;
        if (item.effect_type === 'energy') {
            const energy = await db.getEnergy(interaction.user.id);
            effectText = `hồi **+${item.effect_value}** năng lượng (giờ ${energy}/${config.ENERGY.MAX} ⚡)`;
        } else if (item.effect_type === 'buff') {
            effectText = `nhận buff **+${item.effect_value}% thu nhập** trong 1 giờ 🍗`;
        } else {
            effectText = 'xong!';
        }

        const embed = new EmbedBuilder()
            .setColor(config.COLORS.SUCCESS)
            .setDescription(`😋 Cậu đã dùng **${item.name}** — ${effectText}`);
        await interaction.editReply({ embeds: [embed] });
    },
};
