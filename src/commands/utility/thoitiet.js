// src/commands/utility/thoitiet.js
const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');

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

// Cấu hình Caching in-memory tránh lạm dụng gọi API Open-Meteo
const weatherCache = new Map(); // city_lower_key -> { data, expiresAt }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 tiếng

// Thời tiết mặc định dự phòng khi Open-Meteo bị sập
const FALLBACK_WEATHER = {
    temp: 25,
    feelsLike: 25,
    humidity: 70,
    weatherCode: 0, // Trời quang
    windSpeed: 10,
    placeName: "Học viện Kikyo"
};

async function fetchJson(url) {
    const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
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
        const cacheKey = city.toLowerCase().trim();

        // 1. Kiểm tra bộ nhớ đệm
        const cached = weatherCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            const c = cached.data;
            const [desc, emoji] = WMO[c.weatherCode] || ['Không rõ', '🌡️'];
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: `${emoji} Thời tiết ${c.placeName}`,
                description: `**${desc}**`,
                fields: [
                    { name: '🌡️ Nhiệt độ', value: `${c.temp}°C (cảm giác ${c.feelsLike}°C)`, inline: true },
                    { name: '💧 Độ ẩm', value: `${c.humidity}%`, inline: true },
                    { name: '💨 Gió', value: `${c.windSpeed} km/h`, inline: true }
                ]
            });
            return interaction.editReply({ embeds: [embed] });
        }

        try {
            // Gọi geocode & forecast từ API ngoài
            const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=vi&format=json`);
            const place = geo.results?.[0];
            if (!place) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Mình không tìm thấy "**${city}**"~ thử tên khác (không dấu) nhé.`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`);
            const c = w.current;
            const placeName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');

            const weatherData = {
                temp: Math.round(c.temperature_2m),
                feelsLike: Math.round(c.apparent_temperature),
                humidity: c.relative_humidity_2m,
                weatherCode: c.weather_code,
                windSpeed: Math.round(c.wind_speed_10m),
                placeName
            };

            // Lưu vào bộ nhớ đệm
            weatherCache.set(cacheKey, {
                data: weatherData,
                expiresAt: Date.now() + CACHE_TTL_MS
            });

            const [desc, emoji] = WMO[c.weather_code] || ['Không rõ', '🌡️'];
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: `${emoji} Thời tiết ${placeName}`,
                description: `**${desc}**`,
                fields: [
                    { name: '🌡️ Nhiệt độ', value: `${weatherData.temp}°C (cảm giác ${weatherData.feelsLike}°C)`, inline: true },
                    { name: '💧 Độ ẩm', value: `${weatherData.humidity}%`, inline: true },
                    { name: '💨 Gió', value: `${weatherData.windSpeed} km/h`, inline: true }
                ]
            });
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[WEATHER API ERROR] Thất bại khi gọi API Open-Meteo:', error);
            
            // Fallback thời tiết mặc định dự phòng khi sập mạng
            const [desc, emoji] = WMO[FALLBACK_WEATHER.weatherCode];
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: `${emoji} Thời tiết ${FALLBACK_WEATHER.placeName} (Dự phòng)`,
                description: `⚠️ API Open-Meteo đang gặp sự cố. Trạng thái tạm thời: **${desc}**`,
                fields: [
                    { name: '🌡️ Nhiệt độ', value: `${FALLBACK_WEATHER.temp}°C (cảm giác ${FALLBACK_WEATHER.feelsLike}°C)`, inline: true },
                    { name: '💧 Độ ẩm', value: `${FALLBACK_WEATHER.humidity}%`, inline: true },
                    { name: '💨 Gió', value: `${FALLBACK_WEATHER.windSpeed} km/h`, inline: true }
                ]
            });
            embed.setFooter({ text: 'Chế độ dự phòng tự động hoạt động khi mất kết nối Open-Meteo · Waguri' });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
