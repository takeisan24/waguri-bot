const { Events, MessageFlags } = require('discord.js');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { buildWaguriEmbed } = require('../lib/embed');
const { recordMembership } = require('../lib/membership');
const { logError, skipLog } = require('../lib/logger');
const db = require('../database.js');
const config = require('../config');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- Autocomplete (vd: gợi ý tên item cho /shop, /jobs) ---
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command || typeof command.autocomplete !== 'function') return;
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(`Lỗi autocomplete ${interaction.commandName}:`, error);
            }
            return;
        }

        // --- Slash command + Context menu (User/Message right-click) ---
        if (interaction.isChatInputCommand() || interaction.isUserContextMenuCommand() || interaction.isMessageContextMenuCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                skipLog(`Không tìm thấy lệnh khớp với ${interaction.commandName}`, { source: 'interactionCreate' });
                return;
            }

            // Ghi nhận user thuộc guild (cho BXH theo server) — fire-and-forget
            recordMembership(interaction.guildId, interaction.user.id);

            // Chặn user bị ban
            if (isBanned(interaction.user.id)) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: 'Cậu đã bị chặn sử dụng bot~ Liên hệ admin nếu có nhầm lẫn nhé.'
                });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Chặn khi đang bị giam (chỉ kiểm tra với lệnh kiếm tiền/cờ bạc/trộm)
            if (isBlocked(interaction.commandName)) {
                const jail = await getJail(interaction.user.id);
                if (jail) {
                    const embed = buildWaguriEmbed(interaction, 'error', {
                        title: '🚓・Cậu đang bị giam',
                        description: `Cậu chưa thể làm việc này khi đang bị giam đâu~\n${jail.reason ? `Lý do: **${jail.reason}**\n` : ''}Được thả <t:${Math.floor(jail.until / 1000)}:R>. 🌸`
                    });
                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            }

            // Rate limit tổng (chống spam)
            if (rateLimited(interaction.user.id)) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸'
                });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Lỗi khi thực thi lệnh ${interaction.commandName}:`, error);
                logError('Lỗi thực thi lệnh', error, { command: interaction.commandName, user: `<@${interaction.user.id}>`, guild: interaction.guildId });
                // Interaction đã hết hạn (10062) / đã ack (40060) do mạng chậm -> không thể phản hồi nữa, bỏ qua tránh lỗi dây chuyền.
                if (error?.code === 10062 || error?.code === 40060) return;
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: 'Đã có lỗi xảy ra khi thực thi lệnh này! 🥺'
                });
                const errorPayload = {
                    embeds: [embed],
                    flags: MessageFlags.Ephemeral,
                };
                try {
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorPayload);
                    } else {
                        await interaction.reply(errorPayload);
                    }
                } catch (e) {
                    console.error('Không thể gửi thông báo lỗi cho user:', e);
                }
            }
            return;
        }

        // --- Component (button / select menu / modal) ---
        if (interaction.isButton()) {
            // Nút "Tắt nhắc" trong DM nhắc vote -> tắt nhận nhắc cho user này.
            if (interaction.customId === 'vote_remind_off') {
                try {
                    await db.setVoteReminder(interaction.user.id, false);
                    await interaction.update({
                        content: '🔕 Mình đã tắt nhắc vote cho cậu rồi nha~ Cảm ơn cậu vẫn luôn ủng hộ Waguri 🌸',
                        components: [],
                    });
                } catch (error) {
                    logError('vote_remind_off', error);
                }
                return;
            }

            // Nút "Nhận quà chào mừng" của /start & lời chào server.
            if (interaction.customId === 'start:claim') {
                const fmt = n => Number(n).toLocaleString('vi-VN');
                try {
                    const minAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 ngày
                    if (Date.now() - interaction.user.createdTimestamp < minAgeMs) {
                        return interaction.reply({ content: '⚠️ Tài khoản Discord của cậu phải được tạo từ ít nhất **7 ngày** trước mới nhận được quà chào mừng chống clone nha~ 🌸', flags: MessageFlags.Ephemeral });
                    }
                    const bonus = await db.claimWelcomeBonus(interaction.user.id, config.WELCOME.BONUS);
                    if (bonus > 0) {
                        await interaction.update({
                            embeds: [buildWaguriEmbed(interaction, 'success', {
                                title: '🎁・Quà chào mừng của cậu đây!',
                                description: `Waguri tặng cậu **${fmt(bonus)}** ${config.CURRENCY}! 💝\nGiờ thử \`/daily\` điểm danh và \`/work\` đi làm nha — mình tin cậu sẽ sớm thành đại gia! 🌸`
                            })],
                            components: [],
                        });
                    } else {
                        await interaction.reply({ content: 'Cậu nhận quà chào mừng rồi nha~ Cảm ơn cậu đã luôn ủng hộ Waguri 🌸', flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    logError('start:claim', error);
                }
                return;
            }

            // Nút "Làm tiếp" sau /work -> chạy lại /work (áp cùng guard như slash).
            if (interaction.customId.startsWith('work:again:')) {
                const ownerId = interaction.customId.slice('work:again:'.length);
                if (interaction.user.id !== ownerId) {
                    return interaction.reply({ content: 'Nút này của người khác nha~ Gõ `/work` để tự đi làm nhé! 🌸', flags: MessageFlags.Ephemeral });
                }
                if (isBanned(interaction.user.id)) {
                    return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: 'Cậu đã bị chặn sử dụng bot~' })], flags: MessageFlags.Ephemeral });
                }
                if (rateLimited(interaction.user.id)) {
                    return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'warning', { description: 'Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸' })], flags: MessageFlags.Ephemeral });
                }
                if (isBlocked('work')) {
                    const jail = await getJail(interaction.user.id);
                    if (jail) {
                        return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🚓・Cậu đang bị giam', description: `Cậu chưa thể làm việc khi đang bị giam đâu~ Được thả <t:${Math.floor(jail.until / 1000)}:R>. 🌸` })], flags: MessageFlags.Ephemeral });
                    }
                }
                const work = interaction.client.commands.get('work');
                try { if (work) await work.execute(interaction); } catch (error) { logError('work:again', error); }
                return;
            }

            // Nút bật/tắt hiển thị hồ sơ web (trong /profile của chính mình).
            if (interaction.customId === 'profile:toggle') {
                try {
                    const u = await db.getUser(interaction.user.id);
                    const newPublic = (u?.profile_public === false); // đang ẩn -> bật; đang hiện -> tắt
                    await db.setProfilePublic(interaction.user.id, newPublic);
                    await interaction.reply({
                        content: newPublic
                            ? `👁️ Đã **HIỆN** hồ sơ web của cậu nha~ Mọi người xem được tại waguri-bot.vercel.app/u/${interaction.user.id} 🌸`
                            : '🙈 Đã **ẨN** hồ sơ web của cậu rồi~ Người khác sẽ không xem được nữa nhé.',
                        flags: MessageFlags.Ephemeral,
                    });
                } catch (error) {
                    logError('profile:toggle', error);
                }
                return;
            }

            // Nút "Đóng ticket" (global fallback khi bot restart)
            if (interaction.customId === 'ticket_close') {
                try {
                    const thread = interaction.channel;
                    if (thread && thread.isThread()) {
                        await interaction.reply({
                            content: `🔒 Ticket đã được đóng bởi <@${interaction.user.id}>. Cảm ơn cậu đã liên hệ~ 🌸`,
                        });
                        await thread.setLocked(true, 'Ticket đã đóng');
                        await thread.setArchived(true, 'Ticket đã đóng');
                    } else {
                        await interaction.reply({ content: 'Lệnh này chỉ dùng được trong luồng hỗ trợ (ticket)~', flags: MessageFlags.Ephemeral });
                    }
                } catch (error) {
                    logError('ticket_close_global', error);
                }
                return;
            }
            return;
        }
        // Các component khác: định tuyến theo customId (phase sau sẽ nạp động).
    },
};
