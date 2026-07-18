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

        let firstReplyDone = false;
        const messageShim = {
            channelId: interaction.channelId,
            author: interaction.user,
            member: interaction.member,
            guild: interaction.guild,
            client: interaction.client,
            reply: async (payload) => {
                // Lần reply ĐẦU TIÊN phải lấp tin nhắn "Waguri đang nghĩ..." đã deferReply ở trên
                // bằng editReply — nếu followUp ngay, tin nhắn defer sẽ treo "đang tải" vĩnh viễn.
                if (!firstReplyDone) {
                    firstReplyDone = true;
                    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
                    await interaction.reply(payload);
                    return interaction.fetchReply();
                }
                return interaction.followUp(payload);
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
