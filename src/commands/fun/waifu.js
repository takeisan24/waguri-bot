const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const images = require('../../lib/images');
const config = require('../../config');
const { restFatigue } = require('../../lib/fatigue');

module.exports = {
    data: new SlashCommandBuilder().setName('waifu').setDescription('Ảnh waifu anime ngẫu nhiên (SFW) 🌸'),
    async execute(interaction) {
        await interaction.deferReply();
        restFatigue(interaction.user.id, 1); // giải trí giảm mệt
        try {
            const url = await images.waifu();
            if (!url) throw new Error('no url');
            await interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.INFO).setTitle('🌸 Waifu cho cậu nè~').setImage(url)] });
        } catch {
            await interaction.editReply('Hơ, không lấy được ảnh lúc này, thử lại sau nhé~ 🌸');
        }
    },
};
