const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const TINH_DUYEN = [
    'Hôm nay có người thầm để ý cậu đó~ 👀',
    'Tình duyên khởi sắc, mạnh dạn nhắn tin trước đi!',
    'Nên dành thời gian cho người ấy nhiều hơn nhé.',
    'Độc thân vui vẻ cũng tốt mà, đừng vội~',
    'Cẩn thận hiểu lầm nhỏ, nói chuyện thẳng thắn nha.',
];
const TAI_LOC = [
    'Tài lộc dồi dào, hợp đi /work hôm nay! 💰',
    'Có khoản thu bất ngờ đang chờ cậu đó.',
    'Chi tiêu hợp lý kẻo cuối tháng "viêm màng túi" nha~',
    'Hôm nay đỏ bạc lắm, thử /baucua một ván nhẹ? 😉',
    'Giữ tiền trong /bank cho an toàn nhé.',
];
const MAY_MAN = ['⭐⭐⭐⭐⭐ Cực đỉnh!', '⭐⭐⭐⭐ Rất tốt', '⭐⭐⭐ Ổn áp', '⭐⭐ Tàm tạm', '⭐ Cẩn thận chút nha'];
const LOI_KHUYEN = [
    'Cười nhiều một chút, mọi việc sẽ suôn sẻ hơn~ 🌸',
    'Uống đủ nước và nghỉ ngơi nhé, sức khỏe là vàng!',
    'Hôm nay hợp làm việc tốt — giúp đỡ ai đó xem sao.',
    'Đừng so sánh mình với người khác, cậu giỏi theo cách riêng mà!',
    'Một lời cảm ơn nhỏ hôm nay sẽ mang lại may mắn lớn.',
];

const ZODIAC = [
    { id: 'bach_duong', name: '♈ Bạch Dương' }, { id: 'kim_nguu', name: '♉ Kim Ngưu' },
    { id: 'song_tu', name: '♊ Song Tử' }, { id: 'cu_giai', name: '♋ Cự Giải' },
    { id: 'su_tu', name: '♌ Sư Tử' }, { id: 'xu_nu', name: '♍ Xử Nữ' },
    { id: 'thien_binh', name: '♎ Thiên Bình' }, { id: 'bo_cap', name: '♏ Bọ Cạp' },
    { id: 'nhan_ma', name: '♐ Nhân Mã' }, { id: 'ma_ket', name: '♑ Ma Kết' },
    { id: 'bao_binh', name: '♒ Bảo Bình' }, { id: 'song_ngu', name: '♓ Song Ngư' },
];
const HOROSCOPE = [
    'Năng lượng dồi dào, hợp khởi đầu việc mới.',
    'Cẩn thận lời nói kẻo gây hiểu lầm nhỏ.',
    'Tài lộc khá, có thể có khoản thu bất ngờ.',
    'Tình cảm ấm áp, dành thời gian cho người thân nhé.',
    'Nên nghỉ ngơi, đừng ép bản thân quá sức.',
    'Một cơ hội tốt đang đến, mạnh dạn nắm bắt!',
    'Giữ bình tĩnh trước thử thách, mọi việc sẽ ổn.',
    'Hợp gặp gỡ bạn bè, mở rộng quan hệ.',
    'Trực giác hôm nay rất nhạy, tin vào bản thân.',
    'Tránh quyết định vội vàng về tiền bạc.',
];
const THAYDO = [
    'Thầy phán: số con hôm nay "tiền vào như nước, tiền ra như... thác" 💸',
    'Quẻ này là quẻ "chăm chỉ ắt có ngày nên" — đi `/work` đi con!',
    'Thầy thấy con có quý nhân phù trợ, mà quý nhân tên... Waguri 🌸',
    'Hậu vận của con xán lạn, nhưng tiền vận thì... ráng đi cày 😅',
    'Quẻ "an cư lạc nghiệp" — để dành tiền sắm đồ xịn ở `/store` đi con.',
    'Thầy phán: chớ ham trò may rủi, công an đang rình đó nha 👮',
    'Số con đào hoa lắm, thử `/ship` xem hợp với ai nào~',
    'Quẻ "cần kiệm liêm chính" — bớt `/baucua` lại con ơi.',
    'Thầy thấy con sắp gặp may, đi `/daily` điểm danh ngay kẻo lỡ!',
    'Quẻ "có làm thì mới có ăn" — chân lý ngàn đời đó con!',
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
        .setName('boi')
        .setDescription('Waguri xem bói cho cậu 🔮')
        .addSubcommand(s => s.setName('hangngay').setDescription('Vận mệnh hôm nay của cậu'))
        .addSubcommand(s => s.setName('cunghoangdao').setDescription('Tử vi theo cung hoàng đạo')
            .addStringOption(o => o.setName('cung').setDescription('Cung của cậu').setRequired(true)
                .addChoices(...ZODIAC.map(z => ({ name: z.name, value: z.id })))))
        .addSubcommand(s => s.setName('thaydo').setDescription('Thầy đồ phán một quẻ (mỗi lần một khác)')),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        if (sub === 'cunghoangdao') {
            const cung = interaction.options.getString('cung');
            const z = ZODIAC.find(x => x.id === cung);
            const zName = t(locale, `data.zodiac.${cung}`) || z.name;
            const h = seed(cung + today());

            const horoscopeArr = t(locale, 'commands.boi.horoscopes') || HOROSCOPE;
            const luckArr = t(locale, 'commands.boi.luck_levels') || MAY_MAN;

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

        if (sub === 'thaydo') {
            const thaydoArr = t(locale, 'commands.boi.thaydo_prophecies') || THAYDO;
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.boi.thaydo_title'),
                description: thaydoArr[Math.floor(Math.random() * thaydoArr.length)]
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // hangngay (mặc định)
        const h = seed(interaction.user.id + today());

        const loveArr = t(locale, 'commands.boi.daily_love_fortunes') || TINH_DUYEN;
        const moneyArr = t(locale, 'commands.boi.daily_money_fortunes') || TAI_LOC;
        const luckArr = t(locale, 'commands.boi.luck_levels') || MAY_MAN;
        const adviceArr = t(locale, 'commands.boi.daily_advice') || LOI_KHUYEN;

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
