const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nghingoi')
        .setDescription('Đi ngủ một giấc để hồi đầy năng lượng 😴 (gõ được cả w!ngu)'),
    async execute(interaction) {
        await interaction.deferReply();
        const cd = await db.claimCooldown(interaction.user.id, 'sleep', config.SLEEP_COOLDOWN_SECONDS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '😴 Giấc ngủ trưa',
                description: `Cậu vừa ngủ dậy mà~ 😴 Ngủ tiếp được sau <t:${Math.floor(cd / 1000)}:R> nhé.`
            });
            return interaction.editReply({ embeds: [embed] });
        }
        await db.setEnergy(interaction.user.id, config.ENERGY.MAX);
        // Ngủ ngon = hồi cả sức khỏe (đỡ phải tốn viện phí /hospital). +100 sẽ kẹp về 100.
        await db.addHealth(interaction.user.id, 100);

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '😴 Ngủ một giấc thật ngon',
            description: `Cậu đã nghỉ ngơi, hồi đầy **${config.ENERGY.MAX}** ⚡ năng lượng, phục hồi **100 ❤️ sức khỏe** và **hết mệt mỏi** hẳn! Sẵn sàng làm việc cùng tớ tiếp nào~ 🌸`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
