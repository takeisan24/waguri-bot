const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const db = require('../database');
const { chonKenhThongBao } = require('./kenhThongBao');
const { t } = require('./i18n');

// Bộ nhớ đệm theo dõi hoạt động gần nhất của từng Guild (để không spam vào server chết/vắng lặng)
const guildActivityMap = new Map();

// Bộ nhớ đệm chặn gửi đúp: guildId -> dateStr (chỉ gửi tối đa 1 lần/ngày/guild)
const guildSentDateMap = new Map();

/**
 * Ghi nhận hoạt động nhắn tin của guild (gọi từ messageCreate.js)
 */
function recordGuildActivity(guildId) {
    if (!guildId) return;
    guildActivityMap.set(String(guildId), Date.now());
}

/**
 * Kiểm tra xem guild có hoạt động trong X giờ qua không
 */
function isGuildActive(guildId, maxIdleHours = 6) {
    const last = guildActivityMap.get(String(guildId));
    if (!last) {
        // Nếu vừa khởi động bot, cho phép gửi nếu bot mới chạy dưới 1 tiếng
        return true;
    }
    return (Date.now() - last) <= maxIdleHours * 3600 * 1000;
}

/**
 * Lấy thời gian Việt Nam (UTC+7)
 */
function getVietnamTime(date = new Date()) {
    const vnDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const year = vnDate.getFullYear();
    const month = String(vnDate.getMonth() + 1).padStart(2, '0');
    const day = String(vnDate.getDate()).padStart(2, '0');
    return {
        dayOfWeek: vnDate.getDay(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
        hours: vnDate.getHours(),
        minutes: vnDate.getMinutes(),
        dateStr: `${year}-${month}-${day}`
    };
}

/**
 * Xác định mood nhắc nhở phù hợp với thời điểm hiện tại
 */
function getCurrentMood(date = new Date()) {
    const { dayOfWeek, hours, minutes, dateStr } = getVietnamTime(date);

    // 1. T2 & T4 (20:30): Nhắc học tập / làm việc ban đêm (Lo-Fi Pomodoro)
    // Khung giờ hợp lệ: 20:25 - 20:45
    if ((dayOfWeek === 1 || dayOfWeek === 3) && hours === 20 && minutes >= 25 && minutes <= 45) {
        return { mood: 'study', dateStr };
    }

    // 2. T3 & T5 (11:45): Chúc ăn trưa & Giờ Cao Điểm Tiệm Bánh Gekka
    // Khung giờ hợp lệ: 11:40 - 12:00
    if ((dayOfWeek === 2 || dayOfWeek === 4) && hours === 11 && minutes >= 40 && minutes <= 59) {
        return { mood: 'bakery', dateStr };
    }

    // 3. T6 & T7 (20:30): Cuối tuần thư giãn & Chợ Nông Sản / Minigame
    // Khung giờ hợp lệ: 20:25 - 20:45
    if ((dayOfWeek === 5 || dayOfWeek === 6) && hours === 20 && minutes >= 25 && minutes <= 45) {
        return { mood: 'weekend', dateStr };
    }

    // 4. Chủ Nhật (22:30): Chúc ngủ ngon & Sạc năng lượng tuần mới
    // Khung giờ hợp lệ: 22:25 - 22:45
    if (dayOfWeek === 0 && hours === 22 && minutes >= 25 && minutes <= 45) {
        return { mood: 'sleep', dateStr };
    }

    return null;
}

/**
 * Tạo Embed và Action Buttons theo Mood & Style
 */
function buildReminderPayload(mood, style = 'warm', locale = 'vi') {
    const isEn = locale === 'en';
    const isEnergetic = style === 'energetic';

    let title = '';
    let desc = '';
    let color = '#FFB6C1'; // Light pink default
    const buttons = [];

    switch (mood) {
        case 'study':
            color = 0x6C5CE7; // Cozy Indigo
            if (isEnergetic) {
                title = isEn ? '🔥 Focus Mode On with Waguri!' : '🔥 Bật Chế Độ Tập Trung Cùng Waguri Thôi Nào!';
                desc = isEn
                    ? 'Time to crush your tasks tonight! Kick off a 25-minute Pomodoro sprint with zero distractions. Waguri is cheering for you! 🚀'
                    : 'Bật chế độ tập trung cao độ ngay nào cậu ơi! 25 phút Pomodoro bắt đầu, không xao nhãng, Waguri sẽ tiếp năng lượng cho cậu hết mình! 🚀';
            } else {
                title = isEn ? '📚 Study & Work with Waguri!' : '📚 Cùng Waguri Ngồi Học Bài / Làm Việc Nhé!';
                desc = isEn
                    ? 'Do you have tasks or assignments to finish tonight? Let\'s start a Pomodoro session and chill with cozy Lo-Fi beats together 🌸\n\n*“Every small effort you put in today builds a brighter tomorrow!”*'
                    : 'Tối nay cậu có bài tập hay công việc cần giải quyết không nè? Cùng Waguri bật Pomodoro và lắng nghe những điệu nhạc Lo-Fi ấm áp để tập trung hơn nhé 🌸\n\n*“Mỗi trang sách cậu lật hôm nay đều là bước đệm cho tương lai rạng rỡ của cậu đấy!”*';
            }
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('remind_btn_study')
                    .setLabel(isEn ? '☕ Start Pomodoro' : '☕ Bắt đầu Pomodoro')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://waguri.org/study')
                    .setLabel(isEn ? '🎧 Lo-Fi Study Room' : '🎧 Phòng Học Lo-Fi Web')
            );
            break;

        case 'bakery':
            color = 0xFFA502; // Warm Honey Gold
            if (isEnergetic) {
                title = isEn ? '🔥 Gekka Bakery Rush Hour is Here!' : '🔥 Giờ Cao Điểm Tiệm Bánh Gekka Đã Đến!';
                desc = isEn
                    ? 'Grab a quick lunch and visit the bakery! Ovens are fired up with +20% baking speed and VIP orders await delivery! 🥐'
                    : 'Nạp năng lượng bữa trưa và ghé tiệm nướng bánh nào cậu ơi! Lò nướng đang nóng, tốc độ tăng +20% và nhiều khách quen đang đợi giao bánh đó! 🥐';
            } else {
                title = isEn ? '🧁 Enjoy Your Lunch with Waguri!' : '🧁 Waguri Chúc Cậu Bữa Trưa Thật Ngon Miệng!';
                desc = isEn
                    ? 'A busy morning has passed, remember to eat well and take a breather! Gekka Bakery is entering Rush Hour with special VIP orders waiting 🌸\n\n*“Don\'t skip your lunch, Waguri cares about you!”*'
                    : 'Nửa ngày bận rộn trôi qua rồi, cậu nhớ nạp năng lượng và nghỉ ngơi một chút nha! Tiệm Bánh Gekka đang vào Giờ Cao Điểm với nhiều đơn hàng VIP đang chờ nè 🌸\n\n*“Đừng để bụng đói làm việc nhé, Waguri lo cho cậu đấy!”*';
            }
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('remind_btn_tiembanh_orders')
                    .setLabel(isEn ? '📋 VIP Orders' : '📋 Xem Đơn VIP')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('remind_btn_tiembanh_bake')
                    .setLabel(isEn ? '🧁 Bake Pastries' : '🧁 Nướng Bánh')
                    .setStyle(ButtonStyle.Secondary)
            );
            break;

        case 'weekend':
            color = 0xFF7675; // Vibrant Coral Pink
            if (isEnergetic) {
                title = isEn ? '🎉 Weekend Party with Waguri!' : '🎉 Quẩy Cuối Tuần Hết Mình Cùng Waguri!';
                desc = isEn
                    ? 'It\'s weekend time! Check market prices to cash in your harvest at peak rates or rally friends for a thrilling game night! 🎲'
                    : 'Tối cuối tuần là phải xõa thôi! Ghé Chợ Nông Sản xả kho nông sản lúc giá đỉnh hoặc rủ hội bạn vào sới xúc xắc/tài xỉu ngay nào! 🎲';
            } else {
                title = isEn ? '✨ Weekend Chill with Waguri!' : '✨ Cuối Tuần Thư Giãn Cùng Waguri!';
                desc = isEn
                    ? 'A long week of hard work is behind us. Kick back tonight, chat with your server friends, check market crop prices, or test your luck in mini-games 🌸'
                    : 'Một tuần dài học tập và làm việc chăm chỉ đã qua rồi. Tối nay cậu hãy thả lỏng, trò chuyện cùng bạn bè, ghé Chợ Nông Sản xem giá hoặc thử vận may giải trí một chút nha 🌸';
            }
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('remind_btn_market')
                    .setLabel(isEn ? '🛒 Market Prices' : '🛒 Bảng Giá Chợ')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('remind_btn_games')
                    .setLabel(isEn ? '🎲 Mini-Games' : '🎲 Giải Trí /taixiu')
                    .setStyle(ButtonStyle.Secondary)
            );
            break;

        case 'sleep':
            color = 0x2C3E50; // Deep Midnight Blue
            if (isEnergetic) {
                title = isEn ? '🔋 Recharge for the Week Ahead!' : '🔋 Sạc Lại Năng Lượng Chuẩn Bị Tuần Mới!';
                desc = isEn
                    ? 'Time to restore your HP, adventurer! Claim your daily rewards, tuck away your loot, and get plenty of sleep for tomorrow\'s new start! 💤'
                    : 'Chiến binh ơi, đến giờ hồi phục HP rồi! Điểm danh nhận quà, cất đồ vào kho và đi ngủ đúng giờ để ngày mai xuất phát với 100% phong độ nhé! 💤';
            } else {
                title = isEn ? '🌙 Good Night & Sweet Dreams from Waguri!' : '🌙 Waguri Chúc Cậu Ngủ Thật Ngon Giấc!';
                desc = isEn
                    ? 'The night is late, dim the lights and tuck yourself in warmly. You did wonderfully all week long. Rest well and see you tomorrow morning 🌸'
                    : 'Đêm đã khuya rồi, cậu hãy tắt bớt đèn, cuộn mình trong chăn ấm và ngủ một giấc thật sâu nhé. Cậu đã làm rất tốt suốt cả tuần qua rồi. Hẹn gặp lại cậu vào sáng mai nha 🌸';
            }
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('remind_btn_daily')
                    .setLabel(isEn ? '🎁 Daily Reward' : '🎁 Điểm Danh /daily')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('remind_btn_rest')
                    .setLabel(isEn ? '💤 Rest /nghingoi' : '💤 Nghỉ Ngơi')
                    .setStyle(ButtonStyle.Secondary)
            );
            break;
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(desc)
        .setFooter({
            text: isEn 
                ? 'Waguri Companion Reminder · /config reminders to customize' 
                : 'Lời nhắn đồng hành từ Waguri · /config reminders để tùy chỉnh'
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(buttons);
    return { embeds: [embed], components: [row] };
}

/**
 * Trình quét và gửi lời nhắc đồng hành tới các server
 */
async function checkAndSendReminders(client) {
    if (!client || !client.guilds) return;

    const current = getCurrentMood();
    if (!current) return;

    const { mood, dateStr } = current;

    for (const [guildId, guild] of client.guilds.cache) {
        // 1. Kiểm tra đã gửi cho guild này hôm nay chưa
        if (guildSentDateMap.get(guildId) === dateStr) {
            continue;
        }

        // 2. Kiểm tra server có hoạt động gần đây không (chống spam server chết)
        if (!isGuildActive(guildId, 6)) {
            continue;
        }

        try {
            // 3. Đọc cấu hình guild
            const settings = await db.getGuildSettings(guildId);

            // Nếu admin tắt nhận nhắc nhở: bỏ qua
            if (settings.reminder_enabled === '0') {
                continue;
            }

            const style = settings.reminder_style || 'warm';
            const locale = settings.language === 'en' ? 'en' : 'vi';

            // 4. Chọn kênh gửi
            let targetChannel = null;

            // Ưu tiên 1: Kênh được chỉ định riêng cho reminders
            if (settings.reminder_channel) {
                targetChannel = guild.channels.cache.get(settings.reminder_channel);
                if (targetChannel && (!targetChannel.isTextBased() || !guild.members.me?.permissionsIn(targetChannel)?.has(['ViewChannel', 'SendMessages']))) {
                    targetChannel = null;
                }
            }

            // Ưu tiên 2: Kênh thông báo chung hoặc Smart Fallback
            if (!targetChannel) {
                const { channel } = await chonKenhThongBao(guild, settings);
                targetChannel = channel;
            }

            if (!targetChannel) continue;

            // 5. Gửi lời nhắc không ping
            const payload = buildReminderPayload(mood, style, locale);
            await targetChannel.send({
                ...payload,
                allowedMentions: { parse: [] } // Tuyệt đối KHÔNG ping
            });

            // Ghi nhận đã gửi thành công hôm nay
            guildSentDateMap.set(guildId, dateStr);
        } catch (err) {
            console.error(`[COMPANION REMINDER ERROR] Guild ${guildId}:`, err?.message || err);
        }
    }
}

module.exports = {
    recordGuildActivity,
    isGuildActive,
    getVietnamTime,
    getCurrentMood,
    buildReminderPayload,
    checkAndSendReminders,
    _guildSentDateMap: guildSentDateMap,
    _guildActivityMap: guildActivityMap
};
