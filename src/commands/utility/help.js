const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

const CATEGORIES = [
    { name: '💼 Kinh tế & Nghề', cmds: [
        ['work', 'làm việc kiếm tiền (tốn năng lượng)'],
        ['fish', 'đi câu cá kiếm tiền (tốn năng lượng)'],
        ['daily', 'điểm danh nhận thưởng + streak'],
        ['quest', 'nhiệm vụ hằng ngày (thưởng tiền)'],
        ['achievements', 'thành tựu (mở khóa nhận thưởng)'],
        ['balance', 'xem ví / ngân hàng / cấp độ / năng lượng'],
        ['profile', 'hồ sơ tổng quan'],
        ['jobs', 'xem & xin nghề (list / info / apply)'],
    ] },
    { name: '🏪 Cửa hàng & Kho', cmds: [
        ['shop', 'xem cửa hàng'],
        ['buy', 'mua vật phẩm'],
        ['sell', 'bán vật phẩm (50% giá)'],
        ['inventory', 'xem kho đồ'],
        ['eat', 'dùng đồ ăn/uống (hồi năng lượng / buff)'],
    ] },
    { name: '💸 Giao dịch & Ngân hàng', cmds: [
        ['give', 'chuyển tiền cho người khác'],
        ['deposit', 'gửi tiền vào ngân hàng'],
        ['withdraw', 'rút tiền từ ngân hàng'],
        ['rob', 'cướp tiền (rủi ro cao!)'],
    ] },
    { name: '🎲 Minigame', cmds: [
        ['coinflip', 'tung đồng xu'],
        ['taixiu', 'tài xỉu'],
        ['baucua', 'bầu cua tôm cá'],
        ['blackjack', 'xì dách'],
    ] },
    { name: '💬 Trò chuyện', cmds: [
        ['ask', 'trò chuyện với Waguri (hoặc @tag Waguri để nói chuyện)'],
    ] },
    { name: '🏆 Khác', cmds: [
        ['leaderboard', 'bảng xếp hạng'],
        ['ping', 'độ trễ & trạng thái bot'],
        ['server', 'thông tin server'],
        ['user', 'thông tin người dùng'],
        ['help', 'bảng trợ giúp này'],
    ] },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Danh sách lệnh của Waguri'),
    async execute(interaction) {
        await interaction.deferReply();
        const embed = new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setTitle('🌸 Bảng lệnh của Waguri')
            .setDescription(`Dùng được cả **slash** (\`/work\`) lẫn **prefix** (\`${config.PREFIX}work\`). Cùng nhau chăm chỉ nhé~`)
            .setFooter({ text: `Tiền tố: ${config.PREFIX} • ví dụ: ${config.PREFIX}daily` });

        for (const cat of CATEGORIES) {
            embed.addFields({
                name: cat.name,
                value: cat.cmds.map(([c, d]) => `\`/${c}\` — ${d}`).join('\n'),
                inline: false,
            });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
