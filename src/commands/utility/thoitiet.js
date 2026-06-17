const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

// WMO weather code -> mô tả tiếng Việt + emoji
const WMO = {
    0: ['Trời quang', '☀️'],
    1: ['Ít mây', '🌤️'], 2: ['Có mây', '⛅'], 3: ['Nhiều mây / u ám', '☁️'],
    45: ['Sương mù', '🌫️'], 48: ['Sương mù đóng băng', '🌫️'],
    51: ['Mưa phùn nhẹ', '🌦️'], 53: ['Mưa phùn', '🌦️'], 55: ['Mưa phùn dày', '🌧️'],
    61: ['Mưa nhẹ', '🌧️'], 63: ['Mưa vừa', '🌧️'], 65: ['Mưa to', '🌧️'],
    66: ['Mưa lạnh', '🌧️'], 67: ['Mưa lạnh nặng', '🌧️'],
    71: ['Tuyết nhẹ', '🌨️'], 73: ['Tuyết', '🌨️'], 75: ['Tuyết dày', '❄️'],
    80: ['Mưa rào nhẹ', '🌦️'], 81: ['Mưa rào', '🌧️'], 82: ['Mưa rào dữ dội', '⛈️'],
    95: ['Dông', '⛈️'], 96: ['Dông kèm mưa đá', '⛈️'], 99: ['Dông kèm mưa đá to', '⛈️'],
};

async function fetchJson(url) {
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('thoitiet')
        .setDescription('Xem thời tiết một thành phố (miễn phí qua Open-Meteo)')
        .addStringOption(o => o.setName('thanh_pho').setDescription('Tên thành phố (vd: Hanoi, Da Nang)').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const city = interaction.options.getString('thanh_pho');
        try {
            // 1) Geocode tên -> toạ độ (không cần key)
            const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=vi&format=json`);
            const place = geo.results?.[0];
            if (!place) return interaction.editReply(`Mình không tìm thấy "**${city}**"~ thử tên khác (không dấu) nhé.`);

            // 2) Thời tiết hiện tại
            const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
            const c = w.current;
            const [desc, emoji] = WMO[c.weather_code] || ['Không rõ', '🌡️'];
            const where = [place.name, place.admin1, place.country].filter(Boolean).join(', ');

            const embed = new EmbedBuilder()
                .setColor(config.COLORS.INFO)
                .setTitle(`${emoji} Thời tiết ${where}`)
                .setDescription(`**${desc}**`)
                .addFields(
                    { name: '🌡️ Nhiệt độ', value: `${Math.round(c.temperature_2m)}°C (cảm giác ${Math.round(c.apparent_temperature)}°C)`, inline: true },
                    { name: '💧 Độ ẩm', value: `${c.relative_humidity_2m}%`, inline: true },
                    { name: '💨 Gió', value: `${Math.round(c.wind_speed_10m)} km/h`, inline: true },
                )
                .setFooter({ text: 'Nguồn: Open-Meteo' });
            await interaction.editReply({ embeds: [embed] });
        } catch {
            await interaction.editReply('Hơ, không lấy được thời tiết lúc này, thử lại sau nhé~ 🌸');
        }
    },
};
