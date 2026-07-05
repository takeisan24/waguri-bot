const { SlashCommandBuilder } = require('discord.js');
const images = require('../../lib/images');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('Xem ảnh ngẫu nhiên 🖼️')
        .addStringOption(o => o.setName('category').setDescription('Thể loại ảnh muốn xem').setRequired(true)
            .addChoices(
                { name: 'Mèo 🐱', value: 'cat' },
                { name: 'Cún 🐶', value: 'dog' },
                { name: 'Waifu 🌸', value: 'waifu' }
            )),
    async execute(interaction) {
        await interaction.deferReply();
        const category = interaction.options.getString('category');
        const titles = {
            cat: '🐱 Mèo cho cậu nè~',
            dog: '🐶 Cún cho cậu nè~',
            waifu: '🌸 Waifu cho cậu nè~'
        };

        try {
            const url = await images[category]();
            if (!url) throw new Error('no url');
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: titles[category],
                image: url
            });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`[IMAGE COMMAND ERROR] category: ${category}`, error);
            const embedErr = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, không lấy được ảnh lúc này, thử lại sau nhé~ 🌸'
            });
            await interaction.editReply({ embeds: [embedErr] });
        }
    },
};
