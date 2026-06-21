// lib/voteReminder.js — Quét định kỳ & DM nhắc những ai đã đủ 12h để vote lại.
// Gửi gentle (mỗi chu kỳ tối đa 1 DM/người), kèm nút "Tắt nhắc". No-op nếu REMINDER=false.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js');
const config = require('../config');

const SCAN_MS = 30 * 60 * 1000;      // quét mỗi 30 phút
const BATCH = 40;                    // số DM tối đa mỗi lượt quét (tránh rate-limit)

async function scanOnce(client) {
    if (!config.VOTE.REMINDER) return;
    if (client.shard && !client.shard.ids.includes(0)) return; // chỉ 1 shard chịu trách nhiệm quét

    try {
        const ids = await db.getVoteReminderCandidates(BATCH);
        if (!ids.length) return;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vote_remind_off').setLabel('🔕 Tắt nhắc').setStyle(ButtonStyle.Secondary)
        );
        const voteUrl = `https://top.gg/bot/${client.user.id}/vote`;

        const handled = [];
        for (const uid of ids) {
            try {
                const user = await client.users.fetch(uid);
                await user.send({
                    content: `🌸 Cậu có thể vote cho Waguri lần nữa rồi nè! Vote tiếp để **giữ chuỗi** 🔥 và nhận thưởng nha~\n[**🗳️ Vote tại đây**](${voteUrl})`,
                    components: [row],
                });
            } catch { /* user tắt DM / không fetch được */ }
            handled.push(uid); // dù gửi được hay không cũng đánh dấu -> không quét lại tới khi vote lần nữa
        }
        await db.markVoteReminded(handled);
    } catch (e) {
        console.error('[VOTE] Lỗi quét nhắc vote:', e?.message || e);
    }
}

function scheduleVoteReminders(client) {
    if (!config.VOTE.REMINDER) return;
    setTimeout(() => scanOnce(client), 5 * 60 * 1000); // lần đầu sau 5 phút
    setInterval(() => scanOnce(client), SCAN_MS).unref();
    console.log('[VOTE] Đã bật nhắc vote định kỳ (mỗi 30 phút).');
}

module.exports = { scheduleVoteReminders, scanOnce };
