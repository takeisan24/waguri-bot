const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eat')
        .setDescription('Dùng đồ ăn/uống để hồi năng lượng hoặc nhận buff')
        .addStringOption(o => o.setName('item').setDescription('Món muốn dùng').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1).setMaxValue(50)),

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
        const qty = interaction.options.getInteger('quantity') || 1;
        const item = await db.getItem(itemId);
        if (!item) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                title: '😋・Sử dụng vật phẩm',
                description: 'Mình không tìm thấy món này~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Dùng lần lượt tới khi đủ số lượng hoặc hết đồ trong kho
        let used = 0, lastStatus = 'ok';
        for (let i = 0; i < qty; i++) {
            const r = await db.consumeItem(interaction.user.id, itemId);
            if (r === 'ok') used++;
            else { lastStatus = r; break; }
        }

        if (used === 0) {
            const msg = {
                no_have: `Cậu chưa có **${item.name}** trong kho. Ghé \`/shop\` mua trước nhé~`,
                not_consumable: `**${item.name}** không phải đồ ăn/uống, không dùng kiểu này được đâu~`,
                no_item: 'Mình không tìm thấy món này~',
            }[lastStatus] || 'Ơ, có lỗi rồi, cậu thử lại sau nhé~';
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '😋・Sử dụng vật phẩm',
                description: msg
            });
            return interaction.editReply({ embeds: [embed] });
        }

        let effectText;
        if (item.effect_type === 'energy') {
            const energy = await db.getEnergy(interaction.user.id);
            effectText = `năng lượng giờ là **${energy}/${config.ENERGY.MAX}** ⚡`;
        } else if (item.effect_type === 'health') {
            const u = await db.getUser(interaction.user.id);
            effectText = `hồi **+${item.effect_value} sức khỏe** ❤️ (giờ ${u?.health ?? '?'}/100)`;
        } else if (item.effect_type === 'buff') {
            effectText = `nhận buff **+${item.effect_value}% thu nhập** trong ${item.effect_duration_hours || 1} giờ 🍗`;
        } else {
            effectText = 'xong!';
        }
        const note = used < qty ? ` *(kho chỉ còn đủ ${used} cái)*` : '';

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '😋・Sử dụng vật phẩm thành công!',
            description: `Cậu đã dùng **${used}× ${item.name}** — ${effectText}${note}`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
