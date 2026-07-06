const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { chatWithWaguri } = require('../../lib/ai');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Trò chuyện với Waguri 🌸')
        .addStringOption(o => o.setName('message').setDescription('Cậu muốn nói gì với Waguri?').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const text = interaction.options.getString('message');
        const res = await chatWithWaguri(interaction.channelId, interaction.user.id, interaction.user.username, text);
        if (!res.ok) {
            if (res.reason === 'quota') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Hôm nay cậu đã dùng hết **${res.cap}** lượt trò chuyện với mình rồi 🥺 Quay lại ngày mai nhé~ — hoặc nâng cấp \`/premium\` để có **${config.AI.PREMIUM_DAILY} lượt/ngày** 💎`
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, Waguri chưa trò chuyện được lúc này (chưa cấu hình AI hoặc đang lỗi). Thử lại sau nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        
        // Cộng XP Sổ Sứ Mệnh (30% cơ hội, max 50 XP/ngày)
        if (Math.random() < 0.30) {
            const bpRes = await require('../../lib/battlepass').addAiXp(interaction.user.id);
            if (bpRes && bpRes.success && bpRes.levelUp) {
                await interaction.followUp({
                    content: `🎉 **Sổ Sứ Mệnh**: Cậu đã đạt **Cấp ${bpRes.newLevel}**! Gõ \`/pass\` nhận quà nha~ 🎁`,
                    ephemeral: true
                }).catch(() => null);
            }
        }

        await interaction.editReply(res.reply.slice(0, 2000));
    },
};
