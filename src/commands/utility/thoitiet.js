const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

// Cấu hình Caching in-memory tránh lạm dụng gọi API Open-Meteo
const weatherCache = new Map(); // city_lower_key -> { data, expiresAt }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 tiếng
const CACHE_MAX = 500; // chặn phình RAM: bỏ mục cũ nhất khi vượt ngưỡng (Map giữ thứ tự chèn)

// Thời tiết mặc định dự phòng khi Open-Meteo bị sập
const FALLBACK_WEATHER = {
    temp: 25,
    feelsLike: 25,
    humidity: 70,
    weatherCode: 0, // Trời quang
    windSpeed: 10,
    placeName: "Học viện Kikyo"
};

const getWmoLabel = (code, locale) => {
    const WMO_EMOJIS = {
        0: '☀️',
        1: '🌤️', 2: '⛅', 3: '☁️',
        45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌧️',
        61: '🌧️', 63: '🌧️', 65: '🌧️',
        66: '🌧️', 67: '🌧️',
        71: '🌨️', 73: '🌨️', 75: '❄️',
        80: '🌦️', 81: '🌧️', 82: '⛈️',
        95: '⛈️', 96: '⛈️', 99: '⛈️'
    };
    const emoji = WMO_EMOJIS[code] || '🌡️';
    const label = t(locale, `commands.thoitiet.wmo.${code}`);
    return [label && !label.startsWith('commands.thoitiet') ? label : t(locale, 'commands.thoitiet.unknown'), emoji];
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
        const locale = await getInteractionLanguage(interaction);
        const city = interaction.options.getString('thanh_pho');
        const cacheKey = city.toLowerCase().trim();

        // 1. Kiểm tra bộ nhớ đệm
        const cached = weatherCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            const c = cached.data;
            const [desc, emoji] = getWmoLabel(c.weatherCode, locale);
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.thoitiet.title', { emoji, place: c.placeName }),
                description: `**${desc}**`,
                fields: [
                    { name: t(locale, 'commands.thoitiet.field_temp'), value: t(locale, 'commands.thoitiet.field_temp_val', { temp: c.temp, feelsLike: c.feelsLike }), inline: true },
                    { name: t(locale, 'commands.thoitiet.field_humidity'), value: `${c.humidity}%`, inline: true },
                    { name: t(locale, 'commands.thoitiet.field_wind'), value: t(locale, 'commands.thoitiet.wind_val', { speed: c.windSpeed }), inline: true }
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
                    locale,
                    description: t(locale, 'commands.thoitiet.not_found', { city })
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
            if (weatherCache.size >= CACHE_MAX) {
                weatherCache.delete(weatherCache.keys().next().value);
            }
            weatherCache.set(cacheKey, {
                data: weatherData,
                expiresAt: Date.now() + CACHE_TTL_MS
            });

            const [desc, emoji] = getWmoLabel(c.weather_code, locale);
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.thoitiet.title', { emoji, place: placeName }),
                description: `**${desc}**`,
                fields: [
                    { name: t(locale, 'commands.thoitiet.field_temp'), value: t(locale, 'commands.thoitiet.field_temp_val', { temp: weatherData.temp, feelsLike: weatherData.feelsLike }), inline: true },
                    { name: t(locale, 'commands.thoitiet.field_humidity'), value: `${weatherData.humidity}%`, inline: true },
                    { name: t(locale, 'commands.thoitiet.field_wind'), value: t(locale, 'commands.thoitiet.wind_val', { speed: weatherData.windSpeed }), inline: true }
                ]
            });
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('[WEATHER API ERROR] Thất bại khi gọi API Open-Meteo:', error);
            
            // Fallback thời tiết mặc định dự phòng khi sập mạng
            const [desc, emoji] = getWmoLabel(FALLBACK_WEATHER.weatherCode, locale);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.thoitiet.fallback_title', { emoji, place: FALLBACK_WEATHER.placeName }),
                description: t(locale, 'commands.thoitiet.fallback_desc', { desc }),
                fields: [
                    { name: t(locale, 'commands.thoitiet.field_temp'), value: t(locale, 'commands.thoitiet.field_temp_val', { temp: FALLBACK_WEATHER.temp, feelsLike: FALLBACK_WEATHER.feelsLike }), inline: true },
                    { name: t(locale, 'commands.thoitiet.field_humidity'), value: `${FALLBACK_WEATHER.humidity}%`, inline: true },
                    { name: t(locale, 'commands.thoitiet.field_wind'), value: t(locale, 'commands.thoitiet.wind_val', { speed: FALLBACK_WEATHER.windSpeed }), inline: true }
                ]
            });
            embed.setFooter({ text: t(locale, 'commands.thoitiet.fallback_footer') });
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
