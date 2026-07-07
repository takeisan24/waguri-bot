const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js');
const config = require('../config');
const { t } = require('./i18n');

const SCAN_MS = 30 * 60 * 1000;      // quét mỗi 30 phút
const BATCH = 40;                    // số DM tối đa mỗi lượt quét (tránh rate-limit)

async function scanOnce(client) {
    if (!config.VOTE.REMINDER) return;
    if (client.shard && !client.shard.ids.includes(0)) return; // chỉ 1 shard chịu trách nhiệm quét

    try {
        const ids = await db.getVoteReminderCandidates(BATCH);
        if (!ids.length) return;

        const voteUrl = `https://top.gg/bot/${client.user.id}/vote`;
        const handled = [];
        for (const uid of ids) {
            try {
                const u = await db.getUser(uid);
                const locale = u?.locale || 'vi';
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vote_remind_off').setLabel(t(locale, 'commands.vote.btn_remind_off')).setStyle(ButtonStyle.Secondary)
                );
                const user = await client.users.fetch(uid);
                await user.send({
                    content: t(locale, 'commands.vote.remind_content', { url: voteUrl }),
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
