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

// ---------------------------------------------------------
// Đếm tổng số server TOÀN BOT — an toàn cả khi sharding.
// Mỗi shard chỉ thấy phần guild của nó, nên phải gộp giá trị từ mọi shard.
// ---------------------------------------------------------
async function getTotalGuildCount(client) {
    if (client.shard) {
        try {
            const counts = await client.shard.fetchClientValues('guilds.cache.size');
            return counts.reduce((sum, n) => sum + (n || 0), 0);
        } catch {
            return client.guilds.cache.size; // fallback: ít nhất báo phần của shard này
        }
    }
    return client.guilds.cache.size;
}

// ---------------------------------------------------------
// Stats autoposter ĐA NỀN TẢNG: gửi TỔNG số server lên các bot-list đã cấu hình token.
// top.gg (TOPGG_TOKEN) · discordbotlist.com (DBL_TOKEN) · discord.bots.gg (DBGG_TOKEN).
// Mỗi cái no-op nếu thiếu token. Khi sharding: chỉ shard 0 post (gửi tổng + shard_count).
// ---------------------------------------------------------
function startStatsAutopost(client) {
    if (client.shard && !client.shard.ids.includes(0)) return; // chỉ 1 shard chịu trách nhiệm post

    const targets = [
        {
            name: 'Top.gg', token: process.env.TOPGG_TOKEN,
            url: id => `https://top.gg/api/bots/${id}/stats`,
            body: (servers, shards) => shards ? { server_count: servers, shard_count: shards } : { server_count: servers },
        },
        {
            name: 'DiscordBotList', token: process.env.DBL_TOKEN,
            url: id => `https://discordbotlist.com/api/v1/bots/${id}/stats`,
            body: (servers) => ({ guilds: servers }),
        },
        {
            name: 'Discord.Bots.gg', token: process.env.DBGG_TOKEN,
            url: id => `https://discord.bots.gg/api/v1/bots/${id}/stats`,
            body: (servers, shards) => shards ? { guildCount: servers, shardCount: shards } : { guildCount: servers },
        },
    ].filter(t => t.token);
    if (!targets.length) return;

    const post = async () => {
        let servers;
        try { servers = await getTotalGuildCount(client); }
        catch (e) { console.error('[STATS] không đếm được guild:', e?.message || e); return; }
        const shards = client.shard ? client.shard.count : undefined;
        for (const t of targets) {
            try {
                const res = await fetch(t.url(client.user.id), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: t.token },
                    body: JSON.stringify(t.body(servers, shards)),
                });
                if (res.ok) console.log(`[STATS] ${t.name}: server_count = ${servers}`);
                else console.error(`[STATS] ${t.name} lỗi HTTP ${res.status}`);
            } catch (e) {
                console.error(`[STATS] ${t.name} lỗi:`, e?.message || e);
            }
        }
    };
    post();
    setInterval(post, 30 * 60 * 1000).unref(); // mỗi 30 phút
}

// Tạo danh sách status (gồm số liệu động: thành viên, số server)
function buildStatuses(client) {
    const guilds = client.guilds.cache.size;
    const members = client.guilds.cache.reduce((s, g) => s + (g.memberCount || 0), 0);
    return [
        { type: ActivityType.Watching, name: `${members.toLocaleString('en-US')} members 👥 | ${members.toLocaleString('vi-VN')} thành viên 👥` },
        { type: ActivityType.Listening, name: "everyone's stories 💬 | tâm sự của mọi người 💬" },
        { type: ActivityType.Playing, name: 'getting rich together 🍡 | cùng mọi người làm giàu 🍡' },
        { type: ActivityType.Watching, name: `${guilds} servers 🌸 | ${guilds} server 🌸` },
        { type: ActivityType.Competing, name: 'who is the most hardworking 🏆 | ai chăm chỉ nhất 🏆' },
        { type: ActivityType.Listening, name: '/ask · @Waguri to chat 💬 | để trò chuyện' },
        { type: ActivityType.Watching, name: "Kaoruko eating Rintaro's cake 🍰 | Kaoruko ăn bánh nhà Rintaro" },
        { type: ActivityType.Playing, name: '/work · /fish · /daily every day 🌾 | mỗi ngày' },
        { type: ActivityType.Playing, name: '/loto · /bingo · /masoi with friends 🎲 | cùng bạn bè' },
        { type: ActivityType.Competing, name: 'intense Werewolf match 🐺 | ván Ma Sói gay cấn' },
        { type: ActivityType.Watching, name: 'Gekka Bakery 月下 🧁 | tiệm bánh Gekka' },
        { type: ActivityType.Listening, name: '/help for all commands 🌸 | để xem tất cả lệnh' },
        { type: ActivityType.Listening, name: '/vote to support Waguri 💝 | ủng hộ Waguri' },
        { type: ActivityType.Watching, name: 'waguri-bot.vercel.app 🌸' },
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

        // Gửi số server lên các bot-list định kỳ (top.gg / discordbotlist / discord.bots.gg)
        startStatsAutopost(client);

        // Bật HTTP server nhận webhook vote Top.gg (thưởng tức thì) + health check
        // (nếu có TOPGG_WEBHOOK_AUTH + PORT). No-op khi thiếu cấu hình.
        require('../lib/voteServer').startVoteServer(client);

        // Nhắc vote định kỳ qua DM (khi user đủ 12h để vote lại)
        require('../lib/voteReminder').scheduleVoteReminders(client);

        // Tự backup DB mỗi 24h vào kênh riêng (nếu có BACKUP_CHANNEL_ID)
        require('../lib/autobackup').scheduleAutoBackup(client);

        // Lịch sự kiện: tự bật/tắt sự kiện theo ngày (lễ VN + quốc tế + sinh nhật bot/Waguri)
        // + mọi shard refresh cache hệ số định kỳ (đồng bộ đa shard).
        require('../lib/eventCalendar').scheduleEventCalendar(client);

        // Hoàn cược các ván game đa người (loto/bingo/masoi) bị treo do bot restart.
        // Chỉ 1 shard chịu trách nhiệm (tránh hoàn trùng).
        if (!client.shard || client.shard.ids.includes(0)) {
            require('../database.js').stakeRefundOrphans()
                .then(r => { if (r && r.count > 0) console.log(`[STAKES] Đã hoàn ${r.total} cho ${r.count} cược treo sau restart.`); })
                .catch(e => console.error('[STAKES] Lỗi hoàn cược treo:', e?.message || e));
        }

        // Tự động dọn dẹp và hoàn vé cho các ván Loto/Bingo bị bỏ hoang (không hoạt động > 10 phút)
        setInterval(async () => {
            const { activeLotoGames } = require('../lib/loto');
            const { activeBingoGames } = require('../lib/bingoPrefix');
            const db = require('../database.js');
            const { buildWaguriEmbed } = require('../lib/embed');
            const { t, getLanguage } = require('../lib/i18n');
            const now = Date.now();
            const TIMEOUT_MS = 10 * 60 * 1000; // 10 phút

            // 1. Quét Loto
            for (const [channelId, game] of activeLotoGames.entries()) {
                if (now - game.lastActiveAt > TIMEOUT_MS) {
                    if (game.lobbyTimeout) {
                        clearTimeout(game.lobbyTimeout);
                    }
                    activeLotoGames.delete(channelId);
                    await db.stakeRefundSession(game.sessionId);
                    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        const s = await db.getGuildSettings(channel.guildId);
                        const locale = s?.language || getLanguage(channel.guild?.preferredLocale);
                        const embed = buildWaguriEmbed({ client }, 'warning', {
                            description: t(locale, 'common.game_timeout_cancelled', { game: 'Loto' })
                        });
                        channel.send({ embeds: [embed] }).catch(() => {});
                    }
                }
            }

            // 2. Quét Bingo
            for (const [channelId, game] of activeBingoGames.entries()) {
                if (now - game.lastActiveAt > TIMEOUT_MS) {
                    if (game.lobbyTimeout) {
                        clearTimeout(game.lobbyTimeout);
                    }
                    activeBingoGames.delete(channelId);
                    await db.stakeRefundSession(game.sessionId);
                    const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
                    if (channel) {
                        const s = await db.getGuildSettings(channel.guildId);
                        const locale = s?.language || getLanguage(channel.guild?.preferredLocale);
                        const embed = buildWaguriEmbed({ client }, 'warning', {
                            description: t(locale, 'common.game_timeout_cancelled', { game: 'Bingo' })
                        });
                        channel.send({ embeds: [embed] }).catch(() => {});
                    }
                }
            }
        }, 2 * 60 * 1000).unref(); // chạy mỗi 2 phút

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
