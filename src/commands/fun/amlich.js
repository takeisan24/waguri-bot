const { SlashCommandBuilder } = require('discord.js');
const { solar2lunar, canChiYear, canChiDay, gioHoangDao } = require('../../lib/amlich');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

// Lời Waguri theo ngày (ổn định trong ngày, đổi theo jd) làm fallback.
const FORTUNES = [
    'Hôm nay là ngày đẹp để bắt đầu điều mới đó~ Cố lên nhé! 🌸',
    'Một ngày bình yên đang chờ cậu. Nhớ nghỉ ngơi và ăn miếng bánh ngọt nha~ 🍰',
    'Vận may đang mỉm cười, cứ tự tin làm điều mình muốn nhé! ✨',
    'Ngày của sự kiên nhẫn — từ từ rồi đâu sẽ vào đó, mình tin cậu 💪',
    'Hôm nay hợp gặp gỡ bạn bè, rủ mọi người chơi `/loto` hay `/masoi` đi nào~ 🎲',
    'Giữ tâm an nhiên nhé, chuyện tốt sẽ tới với người dịu dàng như cậu 💕',
    'Một ngày thích hợp để chăm chỉ — `/work` chăm chỉ là có lộc đó! 🍀',
];

const THU = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

function parseDate(s) {
    const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec((s || '').trim());
    if (!m) return null;
    const d = +m[1], mo = +m[2], y = +m[3];
    if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return null;
    return { d, mo, y };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('amlich')
        .setDescription('Xem âm lịch, can-chi & giờ hoàng đạo (kèm lời Waguri) 🌙')
        .addStringOption(o => o.setName('ngay').setDescription('Ngày dương lịch (dd/mm/yyyy) — bỏ trống = hôm nay').setRequired(false)),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();

        let d, mo, y;
        const opt = interaction.options.getString('ngay');
        if (opt) {
            const p = parseDate(opt);
            if (!p) {
                const e = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.amlich.err_invalid_date')
                });
                return interaction.editReply({ embeds: [e] });
            }
            ({ d, mo, y } = p);
        } else {
            const now = new Date();
            d = now.getDate(); mo = now.getMonth() + 1; y = now.getFullYear();
        }

        const L = solar2lunar(d, mo, y);
        
        // Dịch ngày thứ
        const dayIdx = new Date(y, mo - 1, d).getDay();
        const thu = t(locale, `common.days.${dayIdx}`) || THU[dayIdx];

        const gio = gioHoangDao(L.jd);

        // Dịch lời khuyên vận thế
        const localizedFortunes = t(locale, 'commands.amlich.fortunes');
        const fortune = (Array.isArray(localizedFortunes) && localizedFortunes.length > 0)
            ? localizedFortunes[L.jd % localizedFortunes.length]
            : FORTUNES[L.jd % FORTUNES.length];

        const leapStr = L.leap ? t(locale, 'commands.amlich.leap_label') : '';

        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.amlich.embed_title'),
            description: `> ${fortune}\n`,
            fields: [
                { name: t(locale, 'commands.amlich.field_solar'), value: `${thu}, ${String(d).padStart(2, '0')}/${String(mo).padStart(2, '0')}/${y}`, inline: true },
                { name: t(locale, 'commands.amlich.field_lunar'), value: `${L.day}/${L.month}${leapStr}/${L.year}`, inline: true },
                { name: t(locale, 'commands.amlich.field_year'), value: `${canChiYear(L.year)}`, inline: true },
                { name: t(locale, 'commands.amlich.field_day'), value: `${canChiDay(L.jd)}`, inline: true },
                { name: t(locale, 'commands.amlich.field_zodiac'), value: gio.length ? gio.join(' · ') : (t(locale, 'commands.amlich.no_zodiac_hours') || '*(không có)*'), inline: false },
            ],
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
