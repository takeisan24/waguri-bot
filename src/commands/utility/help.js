const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const CATEGORIES = [
    { name: '💼 Kinh tế & Nghề', cmds: [
        ['work', 'làm việc kiếm tiền (tốn năng lượng)'],
        ['fish', 'đi câu cá kiếm tiền (tốn năng lượng)'],
        ['mine', 'đi đào mỏ kiếm tiền ⛏️'],
        ['chop', 'đi chặt gỗ kiếm tiền 🪓'],
        ['daily', 'điểm danh nhận thưởng + streak'],
        ['quest', 'nhiệm vụ hằng ngày & tân thủ (thưởng tiền)'],
        ['achievements', 'thành tựu (mở khóa nhận thưởng)'],
        ['status', 'trạng thái: năng lượng/mệt/buff/Premium/sự kiện 📊'],
        ['profile', 'hồ sơ tổng quan'],
        ['jobs', 'xem & xin nghề (list / info / apply)'],
        ['pet', 'thú cưng: nhận nuôi / cho ăn / xem 🐾'],
        ['tiembanh', 'tiệm bánh Gekka 🍰 (kinh doanh thụ động: xem·mo·nhapnl·thu·nangcap)'],
    ] },
    { name: '🏪 Cửa hàng & Kho', cmds: [
        ['store', 'cửa hàng: xem/mua/bán vật phẩm (list / buy / sell)'],
        ['market', 'chợ mua bán & đấu giá đồ giữa người chơi 🛒 (view·mine·sell·buy·cancel·auctions·auction·bid·cancel-auction)'],
        ['inventory', 'xem kho đồ'],
        ['album', 'xem sổ tay sưu tầm vật phẩm và nhận thưởng bộ sưu tập 📖'],
        ['pass', 'xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖'],
        ['eat', 'dùng đồ ăn/uống (hồi năng lượng / buff)'],
        ['nghingoi', 'đi ngủ hồi đầy năng lượng (6 tiếng/lần) 😴 (w!ngu)'],
        ['cosmetic', 'trang trí hồ sơ: danh hiệu & màu 🎨'],
        ['craft', 'chế tạo đồ từ gỗ/quặng/đá 🔨'],
    ] },
    { name: '💸 Giao dịch & Ngân hàng', cmds: [
        ['give', 'chuyển tiền cho người khác'],
        ['bank', 'tài khoản & ngân hàng: số dư / gửi / rút (balance · gui · rut)'],
        ['rob', 'cướp tiền (rủi ro cao!)'],
        ['vay', 'vay–trả nợ 🤝 (muon · tra · doi · so)'],
    ] },
    { name: '🎲 Minigame', cmds: [
        ['coinflip', 'tung đồng xu'],
        ['taixiu', 'tài xỉu'],
        ['baucua', 'bầu cua tôm cá'],
        ['bacay', 'ba cây 🃏 (nhiều người, đặt cửa)'],
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
        ['premium', 'xem gói Premium 💎 (thêm lượt chat AI)'],
        ['henho', 'hẹn hò và tặng quà cho Waguri để bồi đắp tình cảm 💖'],
    ] },
    { name: '🎀 Vui & Cộng đồng', cmds: [
        ['ship', 'đo độ hợp giữa hai người'],
        ['boi', 'xem bói: hằng ngày / cung hoàng đạo / thầy đồ 🔮'],
        ['amlich', 'xem âm lịch, can-chi, giờ hoàng đạo + lời Waguri 🌙'],
        ['lixi', 'phát lì xì cho cả kênh 🧧'],
        ['couple', 'quan hệ & hôn nhân: cầu hôn / chia tay / trạng thái (marry · divorce · status)'],
        ['action', 'tương tác: ôm / ôm hôn / xoa đầu / chọc / tát yêu (hug · kiss · pat · poke · slap)'],
        ['date', 'rủ người ấy đi hẹn hò 💑'],
        ['confession', 'gửi confession ẩn danh 🤫'],
        ['noitu', 'chơi nối từ tiếng Việt 🔤'],
        ['dovui', 'đố vui 🧠 (trả lời nhanh trong chat, thắng thưởng)'],
    ] },
    { name: '🖼️ Ảnh & Tiện ích', cmds: [
        ['image', 'ảnh mèo 🐱, cún 🐶, hoặc waifu 🌸'],
        ['thoitiet', 'xem thời tiết một thành phố'],
        ['announcement', 'xem thông báo cập nhật mới nhất từ nhà phát triển (view · send) 📢'],
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
        ['bot', 'thông tin, trạng thái, hỗ trợ, mời bot (ping · about · support · invite)'],
        ['server', 'thông tin server'],
        ['user', 'thông tin người dùng'],
        ['claim-support', 'nhận quà gia nhập Server Support độc quyền 🎁'],
        ['deletedata', 'xoá toàn bộ dữ liệu cá nhân của bạn (không hoàn tác) 🗑️'],
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
        const locale = await getInteractionLanguage(interaction);
        const cmdName = interaction.options.getString('command');

        // --- Chi tiết một lệnh ---
        if (cmdName) {
            const command = interaction.client.commands.get(cmdName.replace(/^\//, '').toLowerCase());
            if (!command) {
                const errEmbed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.help.err_title'),
                    description: t(locale, 'commands.help.err_desc', { name: cmdName })
                });
                return interaction.editReply({ embeds: [errEmbed] });
            }

            const json = command.data.toJSON();
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.help.detail_title', { name: json.name }),
                description: t(locale, `commands.help.commands.${json.name}`) || json.description || t(locale, 'commands.help.no_desc'),
                fields: [
                    { name: t(locale, 'commands.help.usage_title'), value: '```\n' + buildUsage(json) + '\n```' },
                    { name: t(locale, 'commands.help.prefix_title'), value: t(locale, 'commands.help.prefix_desc', { prefix: config.PREFIX, name: json.name }) }
                ]
            });
            embed.setFooter({
                text: t(locale, 'commands.help.footer_usage', { original: embed.data.footer.text }),
                iconURL: embed.data.footer.icon_url
            });

            const opts = json.options || [];
            const subs = opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand);
            if (subs.length) {
                embed.addFields({ name: t(locale, 'commands.help.sub_cmds_title'), value: subs.map(s => `\`${s.name}\` — ${s.description}`).join('\n') });
            } else if (opts.length) {
                embed.addFields({ name: t(locale, 'commands.help.params_title'), value: opts.map(o => `\`${o.name}\`${o.required ? t(locale, 'commands.help.param_req') : ''} — ${o.description}`).join('\n') });
            }
            return interaction.editReply({ embeds: [embed] });
        }

        // --- Danh sách theo nhóm qua Select Menu ---
        const welcomeEmbed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.help.guide_title'),
            description: t(locale, 'commands.help.guide_desc', { prefix: config.PREFIX })
        });

        welcomeEmbed.setFooter({
            text: t(locale, 'commands.help.footer_guide', { original: welcomeEmbed.data.footer.text }),
            iconURL: welcomeEmbed.data.footer.icon_url
        });

        // Tạo Select Menu các danh mục
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder(t(locale, 'commands.help.select_placeholder'))
            .addOptions(
                CATEGORIES.map((cat, idx) => ({
                    label: t(locale, `commands.help.categories.${idx}.name`),
                    description: t(locale, 'commands.help.select_desc_cat', { name: t(locale, `commands.help.categories.${idx}.name`) }),
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
                return i.reply({ content: t(locale, 'commands.help.err_ctrl'), flags: MessageFlags.Ephemeral });
            }

            const catIdx = parseInt(i.values[0], 10);
            const cat = CATEGORIES[catIdx];
            const catNameLocalized = t(locale, `commands.help.categories.${catIdx}.name`);

            const categoryEmbed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.help.cat_detail_title', { name: catNameLocalized }),
                description: t(locale, 'commands.help.cat_detail_desc', {
                    name: catNameLocalized,
                    cmds: cat.cmds.map(([c]) => `> \`/${c}\` — ${t(locale, `commands.help.commands.${c}`)}`).join('\n')
                })
            });

            // Giữ nguyên footer
            categoryEmbed.setFooter({
                text: t(locale, 'commands.help.footer_guide', { original: categoryEmbed.data.footer.text }),
                iconURL: categoryEmbed.data.footer.icon_url
            });

            await i.update({ embeds: [categoryEmbed], components: [row] });
        });

        collector.on('end', async () => {
            // Vô hiệu hóa Select Menu sau khi hết thời gian tương tác
            const disabledMenu = StringSelectMenuBuilder.from(selectMenu).setDisabled(true).setPlaceholder(t(locale, 'commands.help.menu_expired'));
            const disabledRow = new ActionRowBuilder().addComponents(disabledMenu);
            await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
