// ============================================================
// kenhThongBao.js — chọn kênh gửi thông báo cập nhật cho một server.
//
// VÌ SAO TÁCH RA: logic này từng nằm trong `execute` của /announcement và có hai lỗ
// im lặng — server nào dính thì không nhận được gì mà cũng chẳng ai biết vì sao:
//
//   1. `announcement_channel` đã đặt nhưng kênh BỊ XOÁ  -> không lui về systemChannel,
//      chỉ tăng failCount.
//   2. Kênh còn đó nhưng bot MẤT QUYỀN GỬI              -> `send()` ném lỗi, rơi vào
//      catch ngoài, cũng chỉ tăng failCount.
//
// Nằm trong execute thì không có cách nào kiểm bằng test. Tách ra để `test/kenh_thong_bao.test.js`
// gác được cả sáu nhánh.
// ============================================================
const { PermissionFlagsBits } = require('discord.js');

/**
 * @param {object} guild   Guild của discord.js (cần .channels.fetch, .members.me, .systemChannel)
 * @param {object} settings Cấu hình guild đã đọc từ DB
 * @returns {Promise<{channel: object|null, nhac: string|null}>}
 *   channel — nơi gửi, null nghĩa là không gửi được đâu cả.
 *   nhac    — khoá i18n của dòng nhắc admin, null nghĩa là kênh đúng ý nên không nhắc.
 */
async function chonKenhThongBao(guild, settings) {
    const guiDuoc = ch => Boolean(ch) && Boolean(guild.members?.me)
        && guild.members.me.permissionsIn(ch).has(PermissionFlagsBits.SendMessages);

    let channel = null;
    let nhac = null;

    if (settings?.announcement_channel) {
        // Kiểm quyền TRƯỚC khi gửi: kênh còn đó mà bot mất quyền thì send() ném lỗi
        // và server này im lặng.
        const daDat = await guild.channels.fetch(settings.announcement_channel).catch(() => null);
        if (guiDuoc(daDat)) channel = daDat;
        else nhac = 'commands.announcement.nhac_kenh_hong';
    } else {
        nhac = 'commands.announcement.nhac_kenh';
    }

    // Cửa lui 1: systemChannel
    if (!channel && guiDuoc(guild.systemChannel)) channel = guild.systemChannel;

    // Cửa lui 2 (Smart Fallback): Tìm kênh Text phù hợp nhất trong guild để giảm lỗi gửi về 0
    if (!channel && guild.channels?.cache) {
        const textChannels = Array.from(guild.channels.cache.values()).filter(ch => {
            const isText = ch.type === 0 || (typeof ch.isTextBased === 'function' && ch.isTextBased() && !ch.isVoiceBased?.() && !ch.isThread?.());
            return isText && guiDuoc(ch);
        });

        if (textChannels.length > 0) {
            const priorityRegex = /(thong-bao|announcement|bot|general|chat|tro-chuyen|sanh-cho|thao-luan)/i;
            const preferred = textChannels.find(ch => priorityRegex.test(ch.name || ''));
            channel = preferred || textChannels[0];
            if (!nhac) nhac = 'commands.announcement.nhac_kenh';
        }
    }

    return { channel, nhac };
}

module.exports = { chonKenhThongBao };
