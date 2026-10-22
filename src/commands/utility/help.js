const { SlashCommandBuilder, EmbedBuilder, ApplicationCommandOptionType, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

// Danh mục cho /help. CHỈ chứa TÊN lệnh — mô tả nằm ở `commands.help.commands.<tên>` trong
// vi.json + en.json, vì dòng dựng chuỗi ở dưới đọc i18n chứ không đọc mảng này.
//
// Mảng từng mang thêm một mô tả tiếng Việt ở phần tử thứ hai. Không ai đọc nó
// (`.map(([c]) => ...)` chỉ lấy phần tử đầu), nên nó lệch dần: lúc gỡ, 27/70 mục khác bản
// i18n, và 4 mục trong số đó lại ĐÚNG hơn bản đang hiển thị — /market vẫn ghi "chợ mua bán
// đồ giữa người chơi" sau khi chợ P2P đã gỡ, /ticket ghi "mở kênh riêng tư" dù nay là form
// Modal. Hai nguồn cho một câu chữ thì nguồn không-ai-đọc luôn thắng ngầm.
//
// GIỮ DẠNG MẢNG: `scripts/check-help-sync.js` lọc bằng `Array.isArray(c) && c[0]`.
const CATEGORIES = [
    { name: '💼 Kinh tế & Nghề', cmds: [
        ['work'],
        ['fish'],
        ['mine'],
        ['chop'],
        ['daily'],
        ['redeem'],
        ['quest'],
        ['achievements'],
        ['status'],
        ['profile'],
        ['jobs'],
        ['pet'],
        ['prestige'],
        ['relief'],
    ] },
    { name: '🏪 Cửa hàng & Kho', cmds: [
        ['store'],
        ['market'],
        ['inventory'],
        ['album'],
        ['pass'],
        ['eat'],
        ['rest'],
        ['cosmetic'],
        ['craft'],
        ['repair'],
        ['hospital'],
    ] },
    { name: '💸 Giao dịch & Tín dụng', cmds: [
        ['give'],
        ['bank'],
        ['rob'],
        ['loan'],
        ['gift'],
    ] },
    { name: '🎲 Nuôi trồng & Tiệm bánh', cmds: [
        ['farm'],
        ['bakery'],
        ['coinflip'],
        ['taixiu'],
        ['baucua'],
        ['blackjack'],
        ['crate'],
        ['loto'],
        ['masoi'],
    ] },
    { name: '💬 AI & Hẹn hò', cmds: [
        ['ask'],
        ['premium'],
        ['dating'],
    ] },
    { name: '🎀 Vui & Cộng đồng', cmds: [
        ['trivia'],
        ['wordchain'],
        ['fortune'],
        ['lunar'],
        ['lixi'],
        ['couple'],
        ['action'],
        ['confession'],
        ['study'],
    ] },
    { name: '🖼️ Ảnh & Tiện ích', cmds: [
        ['image'],
        ['weather'],
        ['language'],
        ['announcement'],
        ['claim-support'],
    ] },
    { name: '⚙️ Quản trị (cần quyền)', cmds: [
        ['setup'],
        ['config'],
        ['serverinfo'],
        ['antinuke'],
    ] },
    { name: '🏆 Khác', cmds: [
        ['start'],
        ['leaderboard'],
        ['event'],
        ['ticket'],
        ['vote'],
        ['bot'],
        ['server'],
        ['user'],
        ['deletedata'],
        ['help'],
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
