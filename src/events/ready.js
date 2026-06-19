const { Events, ActivityType } = require('discord.js');

const ROTATE_MS = 25_000; // đổi status mỗi 25 giây

// Tạo danh sách status (gồm số liệu động: thành viên, số server)
function buildStatuses(client) {
    const guilds = client.guilds.cache.size;
    const members = client.guilds.cache.reduce((s, g) => s + (g.memberCount || 0), 0);
    return [
        { type: ActivityType.Watching, name: `${members.toLocaleString('vi-VN')} thành viên 👥` },
        { type: ActivityType.Listening, name: 'tâm sự của mọi người 💬' },
        { type: ActivityType.Playing, name: 'cùng mọi người làm giàu 🍡' },
        { type: ActivityType.Watching, name: `${guilds} server 🌸` },
        { type: ActivityType.Competing, name: 'ai chăm chỉ nhất 🏆' },
        { type: ActivityType.Listening, name: '/ask · @Waguri để trò chuyện' },
        { type: ActivityType.Watching, name: 'Kaoruko ăn bánh nhà Rintaro 🍰' },
        { type: ActivityType.Playing, name: '/work · /fish · /daily mỗi ngày' },
    ];
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        client.user.setStatus('online');

        let i = 0;
        const rotate = () => {
            const list = buildStatuses(client); // tính lại mỗi lần -> số liệu luôn mới
            const s = list[i % list.length];
            client.user.setActivity(s.name, { type: s.type });
            i++;
        };
        rotate();
        setInterval(rotate, ROTATE_MS);
    },
};
