const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { resetFatigue } = require('../../lib/fatigue');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ngu')
        .setDescription('Đi ngủ một giấc để hồi đầy năng lượng 😴'),
    async execute(interaction) {
        await interaction.deferReply();
        const cd = await db.claimCooldown(interaction.user.id, 'sleep', config.SLEEP_COOLDOWN_SECONDS);
        if (cd) {
            return interaction.editReply(`Cậu vừa ngủ dậy mà~ 😴 Ngủ tiếp được sau <t:${Math.floor(cd / 1000)}:R> nhé.`);
        }
        await db.setEnergy(interaction.user.id, config.ENERGY.MAX);
        resetFatigue(interaction.user.id); // ngủ dậy hết mệt mỏi
        await interaction.editReply({ embeds: [new EmbedBuilder()
            .setColor(config.COLORS.SUCCESS)
            .setTitle('😴 Ngủ một giấc thật ngon')
            .setDescription(`Cậu nghỉ ngơi, hồi đầy **${config.ENERGY.MAX}** ⚡ năng lượng và **hết mệt mỏi** hẳn! Sẵn sàng cày tiếp nào~ 🌸`)] });
    },
};
