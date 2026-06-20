const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
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
        ['status', 'trạng thái: năng lượng/mệt/buff/Premium/sự kiện 📊'],
        ['profile', 'hồ sơ tổng quan'],
        ['jobs', 'xem & xin nghề (list / info / apply)'],
        ['pet', 'thú cưng: nhận nuôi / cho ăn / xem 🐾'],
    ] },
    { name: '🏪 Cửa hàng & Kho', cmds: [
        ['shop', 'xem cửa hàng'],
        ['buy', 'mua vật phẩm'],
        ['sell', 'bán vật phẩm cho hệ thống (50% giá)'],
        ['market', 'chợ mua bán đồ giữa người chơi 🛒'],
        ['inventory', 'xem kho đồ'],
        ['eat', 'dùng đồ ăn/uống (hồi năng lượng / buff)'],
        ['ngu', 'đi ngủ hồi đầy năng lượng (6 tiếng/lần) 😴'],
        ['cosmetic', 'trang trí hồ sơ: danh hiệu & màu 🎨'],
        ['craft', 'chế tạo đồ từ gỗ/quặng/đá 🔨'],
    ] },
    { name: '💸 Giao dịch & Ngân hàng', cmds: [
        ['give', 'chuyển tiền cho người khác'],
        ['deposit', 'gửi tiền vào ngân hàng'],
        ['withdraw', 'rút tiền từ ngân hàng'],
        ['rob', 'cướp tiền (rủi ro cao!)'],
        ['vay', 'xin vay tiền người khác 🤝'],
        ['trano', 'trả nợ cho chủ nợ 💵'],
        ['donno', 'đòi nợ (quá hạn thì cưỡng chế thu) 🧾'],
        ['no', 'xem sổ nợ của cậu'],
    ] },
    { name: '🎲 Minigame', cmds: [
        ['coinflip', 'tung đồng xu'],
        ['taixiu', 'tài xỉu'],
        ['baucua', 'bầu cua tôm cá'],
        ['bacay', 'ba cây 🃏 (nhiều người, đặt cược)'],
        ['blackjack', 'xì dách'],
        ['crate', 'mở rương bí ẩn 🎁'],
        ['bingo', 'bingo 🎱 (nhiều người, gọi số tự động)'],
        ['loto', 'loto 🔢 (mua vé 5 số 01-90, vào voice)'],
        ['masoi', 'ma sói 🐺 (4-15 người, suy luận, có vai bí mật)'],
        ['xocdia', 'xóc đĩa 🥢 (nhiều người đặt Chẵn/Lẻ)'],
        ['duangua', 'đua ngựa 🐎 (đặt cửa 1 con, đua trực tiếp)'],
    ] },
    { name: '💬 Trò chuyện', cmds: [
        ['ask', 'trò chuyện với Waguri (hoặc @tag Waguri)'],
        ['relationship', 'xem mức thân thiết với Waguri 💞'],
        ['premium', 'xem gói Premium 💎 (thêm lượt chat AI)'],
    ] },
    { name: '🎀 Vui & Cộng đồng', cmds: [
        ['ship', 'đo độ hợp giữa hai người'],
        ['boi', 'xem bói: hằng ngày / cung hoàng đạo / thầy đồ 🔮'],
        ['lixi', 'phát lì xì cho cả kênh 🧧'],
        ['marry', 'cầu hôn kết đôi 💍'],
        ['hug', 'ôm người ấy/bạn bè 🤗'],
        ['kiss', 'hôn người ấy 💋'],
        ['date', 'rủ người ấy đi hẹn hò 💑'],
        ['divorce', 'chia tay người ấy 💔'],
        ['confession', 'gửi confession ẩn danh 🤫'],
        ['noitu', 'chơi nối từ tiếng Việt 🔤'],
        ['dovui', 'đố vui 🧠 (trả lời nhanh trong chat, thắng thưởng)'],
    ] },
    { name: '🖼️ Ảnh & Tiện ích', cmds: [
        ['cat', 'ảnh mèo ngẫu nhiên 🐱'],
        ['dog', 'ảnh cún ngẫu nhiên 🐶'],
        ['waifu', 'ảnh waifu anime (SFW) 🌸'],
        ['thoitiet', 'xem thời tiết một thành phố'],
    ] },
    { name: '⚙️ Quản trị (cần quyền)', cmds: [
        ['setup', 'tạo phòng riêng cho Waguri + hướng dẫn nhanh'],
        ['config', 'cấu hình bot cho server (Quản lý Server)'],
    ] },
    { name: '🏰 Bang hội', cmds: [
        ['clan', 'lập bang / quỹ chung / ⚔️ chiến tranh bang (create·join·info·list·deposit·withdraw·kick·disband·war)'],
    ] },
    { name: '🏆 Khác', cmds: [
        ['leaderboard', 'bảng xếp hạng (server / toàn cầu)'],
        ['event', 'xem sự kiện x2 đang diễn ra 🎉'],
        ['vote', 'vote trên Top.gg nhận thưởng 💝'],
        ['invite', 'mời Waguri về server của cậu 🌸'],
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
            if (!command) {
                const errEmbed = buildWaguriEmbed(interaction, 'error', {
                    title: '🔎・Không tìm thấy lệnh',
                    description: `Không tìm thấy lệnh \`${cmdName}\`~ Gõ \`/help\` để xem danh sách nhé.`
                });
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const json = command.data.toJSON();
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: `🔎・Lệnh: /${json.name}`,
                description: json.description || 'Không có mô tả.',
                fields: [
                    { name: '📝 Cách dùng', value: '```\n' + buildUsage(json) + '\n```' },
                    { name: '⌨️ Prefix', value: `Cũng gõ được: \`${config.PREFIX}${json.name}\`` }
                ]
            });
            embed.setFooter({
                text: `<bắt buộc> · [tuỳ chọn] • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });

            const opts = json.options || [];
            const subs = opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand);
            if (subs.length) {
                embed.addFields({ name: '🔸 Lệnh con', value: subs.map(s => `\`${s.name}\` — ${s.description}`).join('\n') });
            } else if (opts.length) {
                embed.addFields({ name: '🔸 Tham số', value: opts.map(o => `\`${o.name}\`${o.required ? ' *(bắt buộc)*' : ''} — ${o.description}`).join('\n') });
            }
            return interaction.editReply({ embeds: [embed] });
        }

        // --- Danh sách theo nhóm qua Select Menu ---
        const welcomeEmbed = buildWaguriEmbed(interaction, 'info', {
            title: '🌸・Sổ Tay Hướng Dẫn Của Waguri',
            description: `Chào cậu! Tớ là Waguri Kaoruko đây~ Cậu có muốn cùng tớ khám phá Kikyo Academy hay ghé tiệm bánh Gekka ăn bánh kem dâu không? 🍰\n\nDưới đây là danh sách các danh mục lệnh tớ có thể giúp cậu. Hãy chọn một danh mục ở menu bên dưới để tớ giới thiệu chi tiết từng lệnh nhé!\n\n*(Dùng được cả **Slash** \`/work\` lẫn **Prefix** \`${config.PREFIX}work\`)*`
        });

        welcomeEmbed.setFooter({
            text: `Chọn danh mục bên dưới • ${welcomeEmbed.data.footer.text}`,
            iconURL: welcomeEmbed.data.footer.icon_url
        });

        // Tạo Select Menu các danh mục
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder('🌸 Chọn một danh mục lệnh...')
            .addOptions(
                CATEGORIES.map((cat, idx) => ({
                    label: cat.name,
                    description: `Xem các lệnh thuộc nhóm ${cat.name}`,
                    value: String(idx)
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const msg = await interaction.editReply({ embeds: [welcomeEmbed], components: [row] });

        const collector = msg.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 90000
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Chỉ người gõ lệnh mới điều khiển được menu này thôi nha~ 🌸', flags: MessageFlags.Ephemeral });
            }

            const catIdx = parseInt(i.values[0], 10);
            const cat = CATEGORIES[catIdx];

            const categoryEmbed = buildWaguriEmbed(interaction, 'info', {
                title: `🌸・Danh mục: ${cat.name}`,
                description: `Dưới đây là các lệnh thuộc nhóm **${cat.name}**:\n\n` +
                    cat.cmds.map(([c, d]) => `> \`/${c}\` — ${d}`).join('\n') +
                    `\n\n*Gõ \`/help <lệnh>\` để xem chi tiết cách dùng của từng lệnh nhé!*`
            });

            // Giữ nguyên footer
            categoryEmbed.setFooter({
                text: `Chọn danh mục bên dưới • ${categoryEmbed.data.footer.text}`,
                iconURL: categoryEmbed.data.footer.icon_url
            });

            await i.update({ embeds: [categoryEmbed], components: [row] });
        });

        collector.on('end', async () => {
            // Vô hiệu hóa Select Menu sau khi hết thời gian tương tác
            const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true).setPlaceholder('Menu đã hết hạn sử dụng 🌸');
            const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
