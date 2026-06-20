const { Events, ActivityType } = require('discord.js');

const ROTATE_MS = 25_000; // đổi status mỗi 25 giây

// ---------------------------------------------------------
// Tự dọn lệnh GUILD thừa -> chống slash command hiện 2 dòng.
// Ở PROD bot đăng ký GLOBAL (index.js). Nếu trước đây từng đăng ký theo
// guild (lúc dev), bản guild đó vẫn còn -> mỗi lệnh hiện 2 lần (1 global + 1 guild).
// Khi không dùng GUILD_ID (chế độ global), quét mọi guild và xoá lệnh guild thừa.
// Idempotent: guild đã sạch trả về 0 lệnh -> bỏ qua, không gọi API ghi.
// ---------------------------------------------------------
async function cleanupDuplicateGuildCommands(client) {
    if (process.env.GUILD_ID) return; // chế độ dev theo guild -> giữ nguyên, không đụng
    for (const guild of client.guilds.cache.values()) {
        try {
            const cmds = await guild.commands.fetch(); // chỉ trả lệnh ĐĂNG KÝ RIÊNG theo guild, không gồm global
            if (cmds.size > 0) {
                await guild.commands.set([]);
                console.log(`[SYSTEM] Đã dọn ${cmds.size} lệnh guild thừa ở "${guild.name}" (${guild.id}) — tránh hiện 2 dòng.`);
            }
        } catch (e) {
            console.error(`[SYSTEM] Không dọn được lệnh guild ${guild.id}:`, e?.message || e);
        }
    }
}

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

        // Dọn lệnh guild thừa ở nền (không chặn việc set status)
        cleanupDuplicateGuildCommands(client).catch(e => console.error('[SYSTEM] Lỗi dọn lệnh guild:', e?.message || e));

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
