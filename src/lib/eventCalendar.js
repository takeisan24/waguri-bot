// lib/eventCalendar.js — Tự kích hoạt sự kiện theo LỊCH (data/events.js) đúng ngày.
//  - Shard chính (shard 0 / không sharding) quyết định: hôm nay có lễ -> setEvent, hết lễ -> clearEvent.
//  - MỌI shard định kỳ loadEvent() để refresh cache hệ số từ DB (đồng bộ đa shard).
//  - Tôn trọng sự kiện owner đặt tay (/event): chỉ tự ghi đè/clear sự kiện do LỊCH tự bật.
const { loadEvent, getEventInfo, setEvent, clearEvent } = require('./event');
const { eventForDate } = require('../data/events');

const TICK_MS = 15 * 60 * 1000; // 15 phút
let currentAuto = null; // id sự kiện đang tự bật (null = không có / đang là sự kiện đặt tay)

// Số giờ còn lại tới hết ngày hôm nay (để event tự hết hạn đúng cuối ngày).
function hoursUntilEndOfDay(now) {
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 3600000));
}

async function runDecision(client) {
    const now = new Date();
    const ev = eventForDate(now);
    const info = getEventInfo();

    if (ev) {
        // Có lễ hôm nay: bật nếu chưa có sự kiện nào, hoặc sự kiện hiện tại chính là cái LỊCH đã bật.
        if (!info.active || currentAuto) {
            const label = `${ev.emoji} ${ev.name}`;
            if (!(info.active && currentAuto === ev.id && info.name === label)) {
                await setEvent(ev.mult, hoursUntilEndOfDay(now), label);
                console.log(`[EVENT] Tự bật sự kiện "${ev.name}" x${ev.mult} (tới hết ngày).`);

                // Gửi thông báo đến kênh thông báo sự kiện
                const channelId = process.env.ANNOUNCEMENT_CHANNEL_ID;
                if (channelId && client) {
                    try {
                        const channel = await client.channels.fetch(channelId);
                        if (channel && channel.isTextBased()) {
                            const { EmbedBuilder } = require('discord.js');
                            const config = require('../config');
                            const { getWaguriFooter, pickWaguriImage } = require('./embed');

                            const embed = new EmbedBuilder()
                                .setColor(config.COLORS.JACKPOT)
                                .setTitle(`🌸・Sự Kiện: ${ev.name} ${ev.emoji}・🌸`)
                                .setDescription(
                                    `**Hệ số:** Nhân **x${ev.mult}** mọi thu nhập cờ bạc và lao động hôm nay! 🧧\n\n` +
                                    `💬 *Lời chúc từ Waguri:*\n> ${ev.blessing}`
                                )
                                .setImage(pickWaguriImage('JACKPOT') || null)
                                .setFooter(getWaguriFooter(client));

                            await channel.send({ embeds: [embed] });
                            console.log(`[EVENT] Đã gửi thông báo sự kiện tới kênh ${channelId}.`);
                        }
                    } catch (err) {
                        console.error('[EVENT] Lỗi gửi thông báo sự kiện:', err);
                    }
                }
            }
            currentAuto = ev.id;
        }
        // info.active && !currentAuto -> đang có sự kiện owner đặt tay -> tôn trọng, không đụng.
    } else {
        // Hôm nay không có lễ: chỉ clear nếu sự kiện đang chạy là do LỊCH tự bật.
        if (currentAuto && info.active) {
            await clearEvent();
            console.log('[EVENT] Hết ngày lễ -> tự tắt sự kiện.');
        }
        currentAuto = null;
    }
}

function scheduleEventCalendar(client) {
    const isPrimary = !client.shard || client.shard.ids.includes(0);
    const tick = async () => {
        try {
            if (isPrimary) await runDecision(client);
            await loadEvent(); // mọi shard refresh cache hệ số từ DB
        } catch (e) {
            console.error('[EVENT] Lỗi lịch sự kiện:', e?.message || e);
        }
    };
    tick(); // chạy ngay khi khởi động
    setInterval(tick, TICK_MS).unref();
}

module.exports = { scheduleEventCalendar, runDecision };
