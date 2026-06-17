const { Events, ActivityType } = require('discord.js');

// Danh sách status xoay vòng — persona Waguri (đanh đá, hối đi cày 💢)
const STATUSES = [
    { name: 'Có làm mới có ăn 💢', type: ActivityType.Watching },
    { name: 'mấy con sen đi cày 🐂', type: ActivityType.Watching },
    { name: '/work để kiếm cơm', type: ActivityType.Playing },
    { name: 'ai giàu nhất server 👀', type: ActivityType.Competing },
    { name: 'tiếng gõ bàn phím cơ ⌨️', type: ActivityType.Listening },
    { name: 'giá trà đá vỉa hè 📈', type: ActivityType.Watching },
];

const ROTATE_MS = 30_000; // đổi status mỗi 30 giây (an toàn rate-limit)

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);

        let i = 0;
        const rotate = () => {
            const s = STATUSES[i % STATUSES.length];
            client.user.setActivity(s.name, { type: s.type });
            i++;
        };

        rotate(); // đặt ngay status đầu tiên
        setInterval(rotate, ROTATE_MS);
    },
};
