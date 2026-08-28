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
        ['redeem', 'đổi mã quà nhận xu/vật phẩm/Premium'],
        ['quest', 'nhiệm vụ hằng ngày & tân thủ (thưởng tiền)'],
        ['achievements', 'thành tựu (mở khóa nhận thưởng)'],
        ['status', 'trạng thái: năng lượng/mệt/buff/Premium/sự kiện 📊'],
        ['profile', 'hồ sơ tổng quan'],
        ['jobs', 'xem & xin nghề (list / info / apply)'],
        ['pet', 'thú cưng: nhận nuôi / cho ăn / xem 🐾'],
        ['tiembanh', 'tiệm bánh Gekka 🍰 (kinh doanh thụ động: xem·mo·nhapnl·thu·nangcap)'],
        ['study', 'học bài Pomodoro cùng Waguri 📚 (start·status·stop·leaderboard)'],
        ['prestige', 'chuyển sinh — làm lại từ đầu để nhận đặc quyền vĩnh viễn 🌟'],
    ] },
    { name: '🏪 Cửa hàng & Kho', cmds: [
        ['store', 'cửa hàng: xem/mua/bán vật phẩm (list / buy / sell)'],
        ['market', 'chợ nông sản biến động, chợ giữa người chơi & đấu giá 🛒📈 (prices·sell·view·mine·list·buy·cancel·auctions·auction·bid·cancel-auction)'],
        ['inventory', 'xem kho đồ'],
        ['album', 'xem sổ tay sưu tầm vật phẩm và nhận thưởng bộ sưu tập 📖'],
        ['pass', 'xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖'],
        ['eat', 'dùng đồ ăn/uống (hồi năng lượng / buff)'],
        ['nghingoi', 'đi ngủ hồi đầy năng lượng (6 tiếng/lần) 😴 (w!ngu)'],
        ['cosmetic', 'trang trí hồ sơ: danh hiệu & màu 🎨'],
        ['craft', 'chế tạo đồ từ gỗ/quặng/đá 🔨'],
        ['repair', 'sửa công cụ khai thác đã mòn (tốn 15% giá mua) 🔧'],
        ['hospital', 'nhập viện hồi phục sức khoẻ 🏥 (viện phí cố định)'],
    ] },
    { name: '💸 Giao dịch & Ngân hàng', cmds: [
        ['give', 'chuyển tiền cho người khác'],
        ['bank', 'tài khoản & ngân hàng: số dư / gửi / rút (balance · gui · rut)'],
        ['rob', 'cướp tiền (rủi ro cao!)'],
        ['vay', 'vay–trả nợ 🤝 (muon · tra · doi · so)'],
        ['tangdo', 'tặng vật phẩm trong kho cho người khác 🎁'],
        ['cuutro', 'nhận trợ cấp phá sản khi ví và ngân hàng hết sạch 🌸'],
    ] },
    // Tách "chơi được ngay" khỏi "phải đặt cược" (2026-08-21). Trước đây mục Minigame gom 11
    // trò cược lại, còn bốn trò CÓ người chơi thật thì nằm rải ở mục khác: nối từ và đố vui ở
    // "Vui & Cộng đồng", heo và trồng cây ở "Kinh tế & Nghề" — dù file của chúng nằm ngay
    // trong src/commands/games/. Tức mục Trò chơi đang giấu trò sống và trưng trò chết.
    { name: '🎲 Trò chơi', cmds: [
        ['noitu', 'chơi nối từ tiếng Việt 🔤'],
        ['dovui', 'đố vui 🧠 (trả lời nhanh trong chat, thắng thưởng)'],
        ['trongcay', 'trồng cây 🌱 (info·muagiong·tuoi·bonphan·thuhoach·hoisinh·phacay·trom·box)'],
        ['heo', 'nuôi heo 🐷 (info·mua·an·tam·ngu·ban·chuabenh·trom·box)'],
        ['crate', 'mở rương bí ẩn 🎁'],
    ] },
    { name: '🎰 Cược & may rủi', cmds: [
        ['taixiu', 'tài xỉu'],
        ['baucua', 'bầu cua tôm cá'],
        ['blackjack', 'xì dách'],
        ['coinflip', 'tung đồng xu'],
        ['bacay', 'ba cây 🃏 (nhiều người, đặt cửa)'],
        ['xocdia', 'xóc đĩa 🥢 (nhiều người đặt Chẵn/Lẻ)'],
        ['duangua', 'đua ngựa 🐎 (đặt cửa 1 con, đua trực tiếp)'],
        ['masoi', 'ma sói 🐺 (4-15 người, suy luận, có vai bí mật)'],
        ['bingo', 'bingo 🎱 (nhiều người, gọi số tự động)'],
        ['loto', 'loto 🔢 (mua vé 5 số 01-90, vào voice)'],
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
    ] },
    { name: '🖼️ Ảnh & Tiện ích', cmds: [
        ['image', 'ảnh mèo 🐱, cún 🐶, hoặc waifu 🌸'],
        ['thoitiet', 'xem thời tiết một thành phố'],
        ['announcement', 'xem thông báo cập nhật mới nhất từ nhà phát triển (view · send) 📢'],
    ] },
    { name: '⚙️ Quản trị (cần quyền)', cmds: [
        ['setup', 'tạo phòng riêng cho Waguri + hướng dẫn nhanh'],
        ['config', 'cấu hình bot cho server (Quản lý Server)'],
        ['serverinfo', 'xuất báo cáo cấu trúc server: kênh/role/cấu hình (Quản lý Server)'],
        ['antinuke', '🛡️ chống nuke: chặn xoá kênh/role & ban hàng loạt (Chủ server)'],
    ] },
    { name: '🏰 Bang hội', cmds: [
        ['clan', 'lập bang / quỹ chung / ⚔️ chiến tranh bang (create·join·info·list·deposit·withdraw·kick·disband·war)'],
    ] },
    { name: '🏆 Khác', cmds: [
        ['start', 'bắt đầu cùng Waguri — nhận quà chào mừng & hướng dẫn 🌸'],
        ['leaderboard', 'bảng xếp hạng (server / toàn cầu)'],
        ['event', 'xem sự kiện x2 đang diễn ra 🎉'],
        ['worldevent', 'sự kiện cộng đồng toàn server 🌍 (view · contribute · claim)'],
        ['ticket', 'mở kênh hỗ trợ riêng với Staff 🌸 (create · panel · close)'],
        ['vote', 'vote trên Top.gg nhận thưởng 💝'],
        ['bot', 'thông tin, trạng thái, hỗ trợ, mời bot (ping · about · support · invite)'],
        ['server', 'thông tin server'],
        ['user', 'thông tin người dùng'],
        ['claim-support', 'nhận quà gia nhập Server Support độc quyền 🎁'],
        ['deletedata', 'xoá toàn bộ dữ liệu cá nhân của bạn (không hoàn tác) 🗑️'],
        ['help', 'bảng trợ giúp này'],
    ] },
];

// Chữ ký lệnh nay dựng ở `lib/cuPhap.js` — dùng CHUNG với đường prefix, nên dòng
// "Cách dùng" và dòng "Prefix" không thể lệch nhau nữa. Xem chú thích ở file đó.
const { buildUsage } = require('../../lib/cuPhap');
const { tenTatCua } = require('../../lib/prefixTen');
const { moTaLenh, moTaSub } = require('../../lib/commandLocalizer');

module.exports = {
    CATEGORIES,
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
                // Thứ tự nguồn: khoá /help (bản dài, giải thích) -> localizer (bản Discord
                // đang hiện, ĐÚNG ngôn ngữ người đọc) -> builder (dự phòng cuối, vốn đã bị
                // localizeCommandJSON ghi đè trước khi tới Discord nên gần như không ai thấy).
                description: t(locale, `commands.help.commands.${json.name}`)
                    || moTaLenh(json.name, locale, json.description)
                    || t(locale, 'commands.help.no_desc'),
                fields: [
                    { name: t(locale, 'commands.help.usage_title'), value: '```\n' + buildUsage(json, '/', true) + '\n```' },
                    // Dòng prefix phải mang ĐỦ tham số như dòng trên. Trước đây nó chỉ in
                    // `w!<tên>`, tức chỉ đường tới đúng cách gọi sẽ thiếu tham số rồi nổ.
                    { name: t(locale, 'commands.help.prefix_title'), value: '```\n' + buildUsage(json, config.PREFIX, true) + '\n```' },
                    // Tên gõ tắt: 24 tên chạy được nhưng trước đây không xuất hiện ở đâu cả.
                    // Chỉ hiện khi lệnh thật sự có — không thêm field rỗng làm rối embed.
                    ...(tenTatCua(json.name).length ? [{
                        name: t(locale, 'commands.help.tentat_title'),
                        value: tenTatCua(json.name).map(x => `\`${config.PREFIX}${x}\``).join(' · '),
                    }] : []),
                ]
            });
            embed.setFooter({
                text: t(locale, 'commands.help.footer_usage', { original: embed.data.footer.text }),
                iconURL: embed.data.footer.icon_url
            });

            const opts = json.options || [];
            const subs = opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand);
            if (subs.length) {
                // `s.description` là chuỗi BUILDER, luôn tiếng Việt — người dùng tiếng Anh
                // trước đây đọc mô tả sub bằng tiếng Việt ngay trong /help, dù bản `en`
                // đã có sẵn đủ 157/157 sub trong localizer.
                embed.addFields({
                    name: t(locale, 'commands.help.sub_cmds_title'),
                    value: subs.map(s => `\`${s.name}\` — ${moTaSub(json.name, s.name, locale, s.description)}`).join('\n'),
                });
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
