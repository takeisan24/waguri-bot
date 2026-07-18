const { SlashCommandBuilder } = require('discord.js');
const { handleLotoPrefix } = require('../../lib/loto');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loto')
        .setDescription('Trò chơi Loto 🎟️')
        .addSubcommand(sub =>
            sub.setName('open')
               .setDescription('Mở phòng chơi Loto (yêu cầu vào voice)')
        )
        .addSubcommand(sub =>
            sub.setName('join')
               .setDescription('Mua vé Loto với 5 số')
               .addStringOption(opt =>
                   opt.setName('numbers')
                      .setDescription('5 số từ 01-90 (ví dụ: 01 15 27 42 89)')
                      .setRequired(true)
               )
        )
        .addSubcommand(sub =>
            sub.setName('list')
               .setDescription('Xem danh sách vé đã mua')
        )
        .addSubcommand(sub =>
            sub.setName('start')
               .setDescription('Bắt đầu game Loto')
        )
        .addSubcommand(sub =>
            sub.setName('end')
               .setDescription('Kết thúc/hủy phòng game Loto')
        ),
    async execute(interaction) {
        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        let cmd = '';
        let args = [];

        if (subcommand === 'open') {
            cmd = 'loto';
        } else if (subcommand === 'join') {
            cmd = 'so';
            const numStr = interaction.options.getString('numbers');
            // Split by space, comma, or any whitespace
            args = numStr.trim().split(/[\s,]+/);
        } else if (subcommand === 'list') {
            cmd = 'ds';
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

        await handleLotoPrefix(messageShim, cmd, args);
    }
};
