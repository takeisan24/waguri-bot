const db = require('../database');
const { logError } = require('../lib/logger');

module.exports = {
    name: 'channelDelete',
    async execute(channel) {
        if (!channel || !channel.id) return;
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
