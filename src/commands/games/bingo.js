const { SlashCommandBuilder } = require('discord.js');
const { handleBingoPrefix } = require('../../lib/bingoPrefix');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bingo')
        .setDescription('Trò chơi Bingo 🎱')
        .addSubcommand(sub =>
            sub.setName('open')
               .setDescription('Mở phòng chơi Bingo (yêu cầu vào voice)')
        )
        .addSubcommand(sub =>
            sub.setName('buy')
               .setDescription('Mua vé Bingo')
        )
        .addSubcommand(sub =>
            sub.setName('check')
               .setDescription('Kiểm tra vé Bingo của cậu')
        )
        .addSubcommand(sub =>
            sub.setName('start')
               .setDescription('Bắt đầu game Bingo')
        )
        .addSubcommand(sub =>
            sub.setName('end')
               .setDescription('Kết thúc/hủy phòng game Bingo')
        ),
    async execute(interaction) {
        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        let cmd = '';
        const args = [];

        if (subcommand === 'open') {
            cmd = 'bingo';
        } else if (subcommand === 'buy') {
            cmd = 'mua';
        } else if (subcommand === 'check') {
            cmd = 'check';
        } else if (subcommand === 'start') {
            cmd = 'start';
        } else if (subcommand === 'end') {
            cmd = 'end';
        }

        const messageShim = {
            channelId: interaction.channelId,
            author: interaction.user,
            member: interaction.member,
            guild: interaction.guild,
            client: interaction.client,
            reply: async (payload) => {
                if (interaction.deferred || interaction.replied) {
                    return interaction.followUp(payload);
                } else {
                    await interaction.reply(payload);
                    return interaction.fetchReply();
                }
            },
            channel: {
                send: async (payload) => {
                    return interaction.channel.send(payload);
                }
            }
        };

        await handleBingoPrefix(messageShim, cmd, args);
    }
};
