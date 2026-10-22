const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');


const ZODIAC = [
    { id: 'bach_duong', name: '♈ Bạch Dương' }, { id: 'kim_nguu', name: '♉ Kim Ngưu' },
    { id: 'song_tu', name: '♊ Song Tử' }, { id: 'cu_giai', name: '♋ Cự Giải' },
    { id: 'su_tu', name: '♌ Sư Tử' }, { id: 'xu_nu', name: '♍ Xử Nữ' },
    { id: 'thien_binh', name: '♎ Thiên Bình' }, { id: 'bo_cap', name: '♏ Bọ Cạp' },
    { id: 'nhan_ma', name: '♐ Nhân Mã' }, { id: 'ma_ket', name: '♑ Ma Kết' },
    { id: 'bao_binh', name: '♒ Bảo Bình' }, { id: 'song_ngu', name: '♓ Song Ngư' },
];

function seed(str) {
    let h = 0;
    for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
}
const pick = (arr, n) => arr[Math.abs(n) % arr.length];
const today = () => new Date().toISOString().slice(0, 10);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fortune')
        .setDescription('Fortune telling and daily horoscope by Waguri 🔮')
        .setDescriptionLocalizations({ vi: 'Waguri xem bói cho cậu 🔮' })
        .addSubcommand(s => s.setName('daily').setNameLocalizations({ vi: 'hangngay' }).setDescription('Your fortune today').setDescriptionLocalizations({ vi: 'Vận mệnh hôm nay của cậu' }))
        .addSubcommand(s => s.setName('zodiac').setNameLocalizations({ vi: 'cunghoangdao' }).setDescription('Horoscope by zodiac sign').setDescriptionLocalizations({ vi: 'Tử vi theo cung hoàng đạo' })
            .addStringOption(o => o.setName('sign').setNameLocalizations({ vi: 'cung' }).setDescription('Your zodiac sign').setDescriptionLocalizations({ vi: 'Cung của cậu' }).setRequired(true)
                .addChoices(...ZODIAC.map(z => ({ name: z.name, value: z.id })))))
        .addSubcommand(s => s.setName('oracle').setNameLocalizations({ vi: 'thaydo' }).setDescription('A fun fortune telling reading').setDescriptionLocalizations({ vi: 'Thầy đồ phán một quẻ (mỗi lần một khác)' })),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        if (sub === 'zodiac' || sub === 'cunghoangdao') {
            const cung = interaction.options.getString('sign') || interaction.options.getString('cung');
            const z = ZODIAC.find(x => x.id === cung);
            const zName = t(locale, `data.zodiac.${cung}`) || z.name;
            const h = seed(cung + today());

            const horoscopeArr = t(locale, 'commands.boi.horoscopes');
            const luckArr = t(locale, 'commands.boi.luck_levels');

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                locale,
                title: t(locale, 'commands.boi.zodiac_title', { name: zName }),
                description: pick(horoscopeArr, h),
                fields: [
                    { name: t(locale, 'commands.boi.zodiac_luck_label'), value: pick(luckArr, h >>> 4), inline: true },
                    { name: t(locale, 'commands.boi.zodiac_number_label'), value: `${(h % 99) + 1}`, inline: true }
                ]
            });
            embed.setFooter({
                text: t(locale, 'commands.boi.zodiac_footer') + ` • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'oracle' || sub === 'thaydo') {
            const thaydoArr = t(locale, 'commands.boi.thaydo_prophecies');
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.boi.thaydo_title'),
                description: thaydoArr[Math.floor(Math.random() * thaydoArr.length)]
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // hangngay (mặc định)
        const h = seed(interaction.user.id + today());

        const loveArr = t(locale, 'commands.boi.daily_love_fortunes');
        const moneyArr = t(locale, 'commands.boi.daily_money_fortunes');
        const luckArr = t(locale, 'commands.boi.luck_levels');
        const adviceArr = t(locale, 'commands.boi.daily_advice');

        const embed = buildWaguriEmbed(interaction, 'jackpot', {
            locale,
            title: t(locale, 'commands.boi.daily_title', { user: interaction.user.username }),
            fields: [
                { name: t(locale, 'commands.boi.daily_love_label'), value: pick(loveArr, h), inline: false },
                { name: t(locale, 'commands.boi.daily_money_label'), value: pick(moneyArr, h >>> 3), inline: false },
                { name: t(locale, 'commands.boi.daily_luck_label'), value: pick(luckArr, h >>> 6), inline: false },
                { name: t(locale, 'commands.boi.daily_advice_label'), value: pick(adviceArr, h >>> 9), inline: false }
            ]
        });
        embed.setFooter({
            text: t(locale, 'commands.boi.daily_footer') + ` • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
