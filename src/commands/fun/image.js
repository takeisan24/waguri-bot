const { SlashCommandBuilder } = require('discord.js');
const images = require('../../lib/images');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

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
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const category = interaction.options.getString('category');

        const fallbackTitles = {
            cat: '🐱 Mèo cho cậu nè~',
            dog: '🐶 Cún cho cậu nè~',
            waifu: '🌸 Waifu cho cậu nè~'
        };

        const title = t(locale, `commands.image.title_${category}`) || fallbackTitles[category];

        try {
            const url = await images[category]();
            if (!url) throw new Error('no url');
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title,
                image: url
            });
            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(`[IMAGE COMMAND ERROR] category: ${category}`, error);
            const embedErr = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.image.err_fetch')
            });
            await interaction.editReply({ embeds: [embedErr] });
        }
    },
};
