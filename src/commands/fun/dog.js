const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const images = require('../../lib/images');
const config = require('../../config');
const { restFatigue } = require('../../lib/fatigue');

module.exports = {
    data: new SlashCommandBuilder().setName('dog').setDescription('Ảnh cún ngẫu nhiên 🐶'),
    async execute(interaction) {
        await interaction.deferReply();
        restFatigue(interaction.user.id, 1); // giải trí giảm mệt
        try {
            const url = await images.dog();
            if (!url) throw new Error('no url');
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.INFO).setTitle('🐶 Cún cho cậu nè~').setImage(url)] });
        } catch {
            await interaction.editReply('Hơ, không lấy được ảnh lúc này, thử lại sau nhé~ 🌸');
        }
    },
};
