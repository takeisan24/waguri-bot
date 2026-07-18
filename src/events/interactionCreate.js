const { Events, MessageFlags } = require('discord.js');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { buildWaguriEmbed } = require('../lib/embed');
const { recordMembership } = require('../lib/membership');
const { logError, skipLog } = require('../lib/logger');
const db = require('../database.js');
const config = require('../config');
const { getInteractionLanguage, t } = require('../lib/i18n');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- Autocomplete (vd: gợi ý tên item cho /store, /jobs) ---
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

            // Tự động đồng bộ role cấp độ nếu tương tác diễn ra ở Server Support.
            // BỌC try/catch: đây là việc phụ (best-effort). Nếu getUser lỗi (Supabase chập
            // chờn) mà không bắt, execute() reject TRƯỚC khi lệnh kịp ack -> interaction chết
            // ("This interaction failed") và rơi vào unhandledRejection log-only -> im lặng.
            if (interaction.guildId === config.ROLE_REWARDS.SUPPORT_GUILD_ID && interaction.member) {
                try {
                    const { syncSupportGuildRoles } = require('../lib/supportReward');
                    const user = await db.getUser(interaction.user.id);
                    if (user) {
                        const { getLevelFromExp } = require('../lib/leveling');
                        const level = getLevelFromExp(Number(user.exp || 0));
                        syncSupportGuildRoles(interaction.member, level).catch(e => {
                            console.error('[ROLE SYNC ERROR] interactionCreate:', e);
                        });
                    }
                } catch (e) {
                    console.error('[ROLE SYNC ERROR] interactionCreate getUser:', e.message);
                }
            }

            const locale = await getInteractionLanguage(interaction);

            // Chặn user bị ban
            if (isBanned(interaction.user.id)) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'common.banned')
                });
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            // Chặn khi đang bị giam (chỉ kiểm tra với lệnh kiếm tiền/cờ bạc/trộm)
            if (isBlocked(interaction.commandName)) {
                const jail = await getJail(interaction.user.id);
                if (jail) {
                    const time = `<t:${Math.floor(jail.until / 1000)}:R>`;
                    const embed = buildWaguriEmbed(interaction, 'error', {
                        locale,
                        title: t(locale, 'common.jail_title'),
                        description: jail.reason
                            ? t(locale, 'common.jailed', { reason: jail.reason, time })
                            : t(locale, 'common.jailed_no_reason', { time })
                    });
                    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
            }

            // Rate limit tổng (chống spam)
            if (rateLimited(interaction.user.id)) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'common.rate_limited')
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
                    locale,
                    description: t(locale, 'common.generic_error')
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
            // Ngôn ngữ dùng chung cho MỌI handler nút (tránh ReferenceError ở các nhánh không tự khai báo).
            const locale = await getInteractionLanguage(interaction);
            // Nút "Tắt nhắc" trong DM nhắc vote -> tắt nhận nhắc cho user này.
            if (interaction.customId === 'vote_remind_off') {
                try {
                    await db.setVoteReminder(interaction.user.id, false);
                    await interaction.update({
                        content: t(locale, 'commands.vote.remind_off_success'),
                        components: [],
                    });
                } catch (error) {
                    logError('vote_remind_off', error);
                }
                return;
            }

            // Nút "Nhận quà chào mừng" của /start & lời chào server.
            if (interaction.customId === 'start:claim') {
                const fmtLocal = n => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
                try {
                    const minAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 ngày
                    if (Date.now() - interaction.user.createdTimestamp < minAgeMs) {
                        return interaction.reply({ content: t(locale, 'common.welcome_age_error'), flags: MessageFlags.Ephemeral });
                    }
                    const bonus = await db.claimWelcomeBonus(interaction.user.id, config.WELCOME.BONUS);
                    if (bonus > 0) {
                        // Reply ephemeral (KHÔNG update) -> không sửa/xóa nút trên tin nhắn chung của người khác.
                        // Mỗi người tự nhận quà của mình; claimWelcomeBonus đã nguyên tử chống nhận đúp.
                        await interaction.reply({
                            embeds: [buildWaguriEmbed(interaction, 'success', {
                                locale,
                                title: t(locale, 'commands.start.claim_success_title'),
                                description: t(locale, 'commands.start.claim_success_desc', { bonus: fmtLocal(bonus), currency: config.CURRENCY })
                            })],
                            flags: MessageFlags.Ephemeral,
                        });
                    } else {
                        await interaction.reply({ content: t(locale, 'commands.start.claim_already'), flags: MessageFlags.Ephemeral });
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
                    return interaction.reply({ content: t(locale, 'commands.work.err_not_owner'), flags: MessageFlags.Ephemeral });
                }
                if (isBanned(interaction.user.id)) {
                    return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.banned') })], flags: MessageFlags.Ephemeral });
                }
                if (rateLimited(interaction.user.id)) {
                    return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, description: t(locale, 'common.rate_limited') })], flags: MessageFlags.Ephemeral });
                }
                if (isBlocked('work')) {
                    const jail = await getJail(interaction.user.id);
                    if (jail) {
                        return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'common.jail_title'), description: t(locale, 'common.jail_locked', { time: `<t:${Math.floor(jail.until / 1000)}:R>` }) })], flags: MessageFlags.Ephemeral });
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
                            ? t(locale, 'commands.profile.public_show', { id: interaction.user.id })
                            : t(locale, 'commands.profile.public_hide'),
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
                        // Chỉ nhân viên (Quản lý Luồng) mới được đóng ticket — chống người lạ đóng griefing.
                        if (!interaction.memberPermissions?.has('ManageThreads')) {
                            return interaction.reply({ content: locale.startsWith('en') ? '🌸 Only staff can close this ticket.' : '🌸 Chỉ nhân viên mới có thể đóng ticket này nha~', flags: MessageFlags.Ephemeral });
                        }
                        await interaction.reply({
                            content: t(locale, 'commands.ticket.closed_by', { user: interaction.user.id }),
                        });
                        await thread.setLocked(true, t(locale, 'commands.ticket.closed_reason'));
                        await thread.setArchived(true, t(locale, 'commands.ticket.closed_reason'));
                    } else {
                        await interaction.reply({ content: t(locale, 'commands.ticket.err_not_thread'), flags: MessageFlags.Ephemeral });
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
