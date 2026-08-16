// ============================================================
// events/guildDelete.js — Hộp đen.
//
// Kịch bản đã gặp ở nhiều vụ nuke thật: việc ĐẦU TIÊN kẻ tấn công làm là đá con bot
// bảo vệ, rồi mới xoá server. Sau khoảnh khắc đó bot không còn quyền gì để chống —
// nhưng vẫn còn kịp để lại lời khai.
//
// Vì vậy file này không phòng thủ. Nó chỉ ghi nhận: bắn webhook nhà phát triển (nằm
// NGOÀI server bị tấn công) và DM chủ server. Chủ server thật thức dậy sẽ biết chuyện
// gì đã xảy ra và lúc nào, thay vì thấy một server trống rỗng không manh mối.
// ============================================================
const db = require('../database.js');
const { t } = require('../lib/i18n');
const { logError } = require('../lib/logger');
const cache = require('../lib/antinuke/config');

module.exports = {
    name: 'guildDelete',
    async execute(guild) {
        try {
            // `available === false` là sự cố hạ tầng Discord, không phải bị đá.
            if (!guild || guild.available === false) return;

            const dangBaoVe = cache.dangBaoVe(guild.id);
            logError('ANTI-NUKE guildDelete', new Error(
                `Bot rời/bị đá khỏi "${guild.name}" (${guild.id}) · members=${guild.memberCount} · antinuke=${dangBaoVe ? 'on' : 'off'}`
            ), { guild: guild.id });

            if (!dangBaoVe || !guild.ownerId) return;

            const s = await db.getGuildSettings(guild.id).catch(() => ({}));
            const locale = s?.language === 'en' ? 'en' : 'vi';
            const owner = await guild.client.users.fetch(guild.ownerId).catch(() => null);
            if (owner) {
                await owner.send(t(locale, 'antinuke.blackbox.dm', { guild: guild.name })).catch(() => {});
            }
        } catch (e) {
            logError('guildDelete', e, { guild: guild?.id });
        }
    },
};
