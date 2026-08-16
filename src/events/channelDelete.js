const db = require('../database');
const { logError } = require('../lib/logger');
const antinuke = require('../lib/antinuke');

module.exports = {
    name: 'channelDelete',
    async execute(channel) {
        if (!channel || !channel.id) return;

        // Lưới an toàn chống nuke (F9): chỉ chạy khi bot KHÔNG có quyền View Audit Log.
        // Lúc đó `guildAuditLogEntryCreate` không bao giờ bắn, và đây là dấu hiệu duy
        // nhất còn lại. Không biết thủ phạm -> chỉ khoá server + báo động, không trừng
        // phạt ai (hàm tự kiểm tra quyền để khỏi đếm hai lần).
        if (channel.guild) {
            antinuke.xuLyMatAuditLog(channel.guild, 'channel_delete').catch(() => {});
        }

        try {
            const ticket = await db.getTicketByChannel(channel.id);
            if (ticket && ticket.status !== 'CLOSED') {
                await db.closeTicket(channel.id);
                console.log(`[TICKET] Kênh ${channel.id} bị xóa thủ công -> Tự động đóng ticket DB.`);
            }
        } catch (error) {
            logError('channelDelete_ticket_cleanup', error, { channelId: channel.id });
        }
    },
};
