const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType } = require('discord.js');
const config = require('../../config');

const CATEGORIES = [
    { name: '💼 Kinh tế & Nghề', cmds: [
        ['work', 'làm việc kiếm tiền (tốn năng lượng)'],
        ['fish', 'đi câu cá kiếm tiền (tốn năng lượng)'],
        ['mine', 'đi đào mỏ kiếm tiền ⛏️'],
        ['chop', 'đi chặt gỗ kiếm tiền 🪓'],
        ['daily', 'điểm danh nhận thưởng + streak'],
        ['quest', 'nhiệm vụ hằng ngày (thưởng tiền)'],
        ['achievements', 'thành tựu (mở khóa nhận thưởng)'],
        ['balance', 'xem ví / ngân hàng / cấp độ / năng lượng'],
        ['profile', 'hồ sơ tổng quan'],
        ['jobs', 'xem & xin nghề (list / info / apply)'],
        ['pet', 'thú cưng: nhận nuôi / cho ăn / xem 🐾'],
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
        ['ask', 'trò chuyện với Waguri (hoặc @tag Waguri)'],
        ['relationship', 'xem mức thân thiết với Waguri 💞'],
    ] },
    { name: '🎀 Vui & Cộng đồng', cmds: [
        ['ship', 'đo độ hợp giữa hai người'],
        ['boi', 'Waguri xem bói cho cậu hôm nay'],
        ['lixi', 'phát lì xì cho cả kênh 🧧'],
        ['marry', 'cầu hôn kết đôi 💍'],
        ['divorce', 'chia tay người ấy 💔'],
        ['confession', 'gửi confession ẩn danh 🤫'],
        ['noitu', 'chơi nối từ tiếng Việt 🔤'],
    ] },
    { name: '🖼️ Ảnh & Tiện ích', cmds: [
        ['cat', 'ảnh mèo ngẫu nhiên 🐱'],
        ['dog', 'ảnh cún ngẫu nhiên 🐶'],
        ['waifu', 'ảnh waifu anime (SFW) 🌸'],
        ['thoitiet', 'xem thời tiết một thành phố'],
    ] },
    { name: '⚙️ Quản trị (cần quyền)', cmds: [
        ['config', 'cấu hình bot cho server (Quản lý Server)'],
    ] },
    { name: '🏆 Khác', cmds: [
        ['leaderboard', 'bảng xếp hạng'],
        ['ping', 'độ trễ & trạng thái bot'],
        ['server', 'thông tin server'],
        ['user', 'thông tin người dùng'],
        ['help', 'bảng trợ giúp này'],
    ] },
];

const fmtOpt = o => (o.required ? `<${o.name}>` : `[${o.name}]`);

function buildUsage(json) {
    const opts = json.options || [];
    const subs = opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand);
    if (subs.length) {
        return subs.map(s => `/${json.name} ${s.name}${(s.options || []).map(o => ' ' + fmtOpt(o)).join('')}`).join('\n');
    }
    return `/${json.name}${opts.map(o => ' ' + fmtOpt(o)).join('')}`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Danh sách lệnh, hoặc chi tiết một lệnh')
        .addStringOption(o => o.setName('command').setDescription('Tên lệnh muốn xem chi tiết').setRequired(false).setAutocomplete(true)),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const names = [...interaction.client.commands.keys()]
            .filter(n => n.includes(focused)).sort().slice(0, 25);
        await interaction.respond(names.map(n => ({ name: `/${n}`, value: n })));
    },

    async execute(interaction) {
        await interaction.deferReply();
        const cmdName = interaction.options.getString('command');

        // --- Chi tiết một lệnh ---
        if (cmdName) {
            const command = interaction.client.commands.get(cmdName.replace(/^\//, '').toLowerCase());
            if (!command) return interaction.editReply(`Không tìm thấy lệnh \`${cmdName}\`~ Gõ \`/help\` để xem danh sách nhé.`);

            const json = command.data.toJSON();
            const embed = new EmbedBuilder()
                .setColor(config.COLORS.INFO)
                .setTitle(`Lệnh: /${json.name}`)
                .setDescription(json.description || 'Không có mô tả.')
                .addFields(
                    { name: '📝 Cách dùng', value: '```\n' + buildUsage(json) + '\n```' },
                    { name: '⌨️ Prefix', value: `Cũng gõ được: \`${config.PREFIX}${json.name}\`` },
                )
                .setFooter({ text: '<bắt buộc> · [tuỳ chọn]' });

            const opts = json.options || [];
            const subs = opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand);
            if (subs.length) {
                embed.addFields({ name: '🔸 Lệnh con', value: subs.map(s => `\`${s.name}\` — ${s.description}`).join('\n') });
            } else if (opts.length) {
                embed.addFields({ name: '🔸 Tham số', value: opts.map(o => `\`${o.name}\`${o.required ? ' *(bắt buộc)*' : ''} — ${o.description}`).join('\n') });
            }
            return interaction.editReply({ embeds: [embed] });
        }

        // --- Danh sách theo nhóm ---
        const embed = new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setTitle('🌸 Bảng lệnh của Waguri')
            .setDescription(`Dùng được cả **slash** (\`/work\`) lẫn **prefix** (\`${config.PREFIX}work\`). Gõ \`/help <lệnh>\` để xem chi tiết~`)
            .setFooter({ text: `Tiền tố: ${config.PREFIX} • ví dụ: ${config.PREFIX}help work` });

        for (const cat of CATEGORIES) {
            embed.addFields({ name: cat.name, value: cat.cmds.map(([c, d]) => `\`/${c}\` — ${d}`).join('\n') });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
