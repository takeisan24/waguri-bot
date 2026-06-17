const { Events, ActivityType } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        
        // Thiết lập trạng thái (Activity) cho bot — persona Waguri
        client.user.setActivity('Có làm mới có ăn 💢', { type: ActivityType.Watching });
    },
};
