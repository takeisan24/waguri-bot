const { SlashCommandBuilder } = require('discord.js');
const { startGame, stopGame, getGame } = require('../../lib/noitu');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('noitu')
        .setDescription('Chơi nối từ tiếng Việt')
        .addSubcommand(s => s.setName('start').setDescription('Bắt đầu ván nối từ ở kênh này'))
        .addSubcommand(s => s.setName('stop').setDescription('Kết thúc ván nối từ'))
        .addSubcommand(s => s.setName('status').setDescription('Xem từ hiện cần nối')),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const ch = interaction.channelId;

        if (sub === 'start') {
            if (getGame(ch)) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.noitu.already_started')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const { phrase, lastWord } = startGame(ch);
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.noitu.start_title'),
                description: t(locale, 'commands.noitu.start_desc', { phrase, lastWord })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'stop') {
            const g = stopGame(ch);
            if (g) {
                const embed = buildWaguriEmbed(interaction, 'info', {
                    locale,
                    title: t(locale, 'commands.noitu.stop_title'),
                    description: t(locale, 'commands.noitu.stop_desc', { count: g.count })
                });
                return interaction.editReply({ embeds: [embed] });
            } else {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.noitu.stop_no_game')
                });
                return interaction.editReply({ embeds: [embed] });
            }
        }
        // status
        const g = getGame(ch);
        if (g) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.noitu.status_title'),
                description: t(locale, 'commands.noitu.status_desc', { lastWord: g.lastWord, count: g.count })
            });
            return interaction.editReply({ embeds: [embed] });
        } else {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: t(locale, 'commands.noitu.no_game')
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
