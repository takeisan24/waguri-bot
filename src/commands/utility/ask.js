const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { chatWithWaguri } = require('../../lib/ai');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Trò chuyện với Waguri 🌸')
        .addStringOption(o => o.setName('message').setDescription('Cậu muốn nói gì với Waguri?').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const text = interaction.options.getString('message');
        const locale = await getInteractionLanguage(interaction);
        const res = await chatWithWaguri(interaction.channelId, interaction.user.id, interaction.user.username, text, locale);
        if (!res.ok) {
            if (res.reason === 'quota') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.ask.quota_msg', { cap: res.cap, premium_cap: config.AI.PREMIUM_DAILY })
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.retry_later')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        
        // Cộng XP Sổ Sứ Mệnh (30% cơ hội, max 50 XP/ngày)
        if (Math.random() < 0.30) {
            const bpRes = await require('../../lib/battlepass').addAiXp(interaction.user.id);
            if (bpRes && bpRes.success && bpRes.levelUp) {
                await interaction.followUp({
                    content: t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel }),
                    ephemeral: true
                }).catch(() => null);
            }
        }

        // allowedMentions rỗng: chặn AI bị "mồi" để @everyone/@here/tag role hàng loạt (prompt injection).
        await interaction.editReply({ content: res.reply.slice(0, 2000), allowedMentions: { parse: [] } });
    },
};
