const { Events, MessageFlags } = require('discord.js');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
// `getJailForAck` chứ không phải `getJail`: cả hai nơi gọi trong file này đều nằm TRƯỚC khi
// lệnh kịp `deferReply()`, nên phải có trần thời gian (xem lib/jail.js).
const { isBlocked, getJailForAck } = require('../lib/jail');
const { buildWaguriEmbed } = require('../lib/embed');
const { recordMembership } = require('../lib/membership');
const { logError, skipLog } = require('../lib/logger');
const db = require('../database.js');
const config = require('../config');
const { getInteractionLanguage, t } = require('../lib/i18n');

// Ack lỗi cho handler nút: cố gắng phản hồi ephemeral để interaction không chết im lặng
// ("This interaction failed"). Nuốt 10062 (hết hạn) / 40060 (đã ack) — không thể phản hồi thêm.
async function ackButtonError(interaction, locale) {
    try {
        const payload = { content: t(locale, 'common.generic_error'), flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (e) {
        if (e?.code === 10062 || e?.code === 40060) return;
        console.error('[interactionCreate] ackButtonError không gửi được:', e?.message || e);
    }
}

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

            // Ghi nhận user thuộc guild & đồng bộ hồ sơ Discord (tên/avatar) cho BXH
            recordMembership(interaction.guildId, interaction.user.id);
            db.syncProfile(interaction.user.id, interaction.user.username, interaction.user.displayAvatarURL({ extension: 'png', size: 128 }));

            // Tự động đồng bộ role cấp độ nếu tương tác diễn ra ở Server Support.
            //
            // KHÔNG `await`: đây là việc phụ (best-effort), người dùng không chờ kết quả của
            // nó. Trước đây `db.getUser()` được await ngay tại đây, tức mọi tương tác ở server
            // support phải đợi một vòng DB TRƯỚC khi lệnh kịp `deferReply()` — mà
            // `SUPABASE_TIMEOUT_MS` là 10 giây, gấp hơn ba lần hạn ack 3 giây của Discord.
            // Bỏ await xoá hẳn mắt xích đó, tốt hơn là bọc trần thời gian cho nó.
            //
            // `.catch()` ở cuối là bắt buộc: không có nó, một promise trôi nổi mà reject sẽ
            // thành unhandledRejection.
            if (interaction.guildId === config.ROLE_REWARDS.SUPPORT_GUILD_ID && interaction.member) {
                const member = interaction.member;
                db.getUser(interaction.user.id)
                    .then(user => {
                        if (!user) return;
                        const { syncSupportGuildRoles } = require('../lib/supportReward');
                        const { getLevelFromExp } = require('../lib/leveling');
                        return syncSupportGuildRoles(member, getLevelFromExp(Number(user.exp || 0)));
                    })
                    .catch(e => console.error('[ROLE SYNC ERROR] interactionCreate:', e?.message || e));
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
                const jail = await getJailForAck(interaction.user.id);
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
                    const jail = await getJailForAck(interaction.user.id);
                    if (jail) {
                        return interaction.reply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'common.jail_title'), description: t(locale, 'common.jail_locked', { time: `<t:${Math.floor(jail.until / 1000)}:R>` }) })], flags: MessageFlags.Ephemeral });
                    }
                }
                const work = interaction.client.commands.get('work');
                try { if (work) await work.execute(interaction); } catch (error) { logError('work:again', error); }
                return;
            }

            // Nút bật/tắt hiển thị hồ sơ web (trong /profile của chính mình).
            //
            // ACK TRƯỚC, LÀM SAU: handler này chạy HAI lời gọi DB (getUser + setProfilePublic)
            // rồi mới trả lời. Nút cũng có hạn ack 3 giây như lệnh slash, mà
            // SUPABASE_TIMEOUT_MS là 10 giây — DB chậm là nút chết với "This interaction
            // failed". Ở đây KHÔNG bọc trần thời gian được như `getJailForAck`, vì nút cần
            // biết trạng thái thật mới quyết định bật hay tắt; đoán mò sẽ ghi sai. Nên defer
            // ngay (ack trong vài mili giây, mua thêm 15 phút) rồi mới đụng DB.
            if (interaction.customId === 'profile:toggle') {
                try {
                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    const u = await db.getUser(interaction.user.id);
                    const newPublic = (u?.profile_public === false); // đang ẩn -> bật; đang hiện -> tắt
                    await db.setProfilePublic(interaction.user.id, newPublic);
                    await interaction.editReply({
                        content: newPublic
                            ? t(locale, 'commands.profile.public_show', { id: interaction.user.id })
                            : t(locale, 'commands.profile.public_hide'),
                    });
                } catch (error) {
                    logError('profile:toggle', error);
                    // Đã defer rồi mà lỗi -> không báo thì người dùng nhìn vòng xoay mãi.
                    await ackButtonError(interaction, locale);
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

            // Nút & Menu điều khiển Ticket System Vĩnh Cửu (tkt:)
            if (interaction.customId.startsWith('tkt:')) {
                try {
                    await handleTicketComponent(interaction, locale);
                } catch (error) {
                    logError('tkt_component', error, { customId: interaction.customId });
                    await ackButtonError(interaction, locale);
                }
                return;
            }

            // Nút điều khiển Pomodoro Study
            if (interaction.customId.startsWith('study_')) {
                try {
                    const { handleStudyButton } = require('../lib/study');
                    await handleStudyButton(interaction);
                } catch (error) {
                    logError('study_button', error, { customId: interaction.customId });
                    await ackButtonError(interaction, locale);
                }
                return;
            }

            // Nút điều khiển Easter Egg Player HVL - MCK
            if (interaction.customId.startsWith('hvl_')) {
                try {
                    const { handleHvlButton } = require('../lib/hvlPlayer');
                    // Truyền `locale` đã phân giải sẵn ở đầu nhánh nút — hvlPlayer không tự
                    // tra lại, tránh thêm một lượt đọc DB vào đường trước ack.
                    await handleHvlButton(interaction, locale);
                } catch (error) {
                    logError('hvl_button', error, { customId: interaction.customId });
                    await ackButtonError(interaction, locale);
                }
                return;
            }
            return;
        }
        // Handle Select Menu cho Ticket
        if (interaction.isStringSelectMenu() && interaction.customId === 'tkt:open_select') {
            const locale = await getInteractionLanguage(interaction);
            try {
                const category = interaction.values[0] || 'general';
                await handleTicketOpen(interaction, category);
            } catch (error) {
                logError('tkt_select_menu', error);
                await ackButtonError(interaction, locale);
            }
            return;
        }
        // Các component khác: định tuyến theo customId (phase sau sẽ nạp động).
    },
    handleTicketOpen,
};

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

async function handleTicketOpen(interaction, category = 'general') {
    const locale = await getInteractionLanguage(interaction);
    const { user, guild } = interaction;
    const { ChannelType, PermissionsBitField, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    const active = await db.getActiveTicket(guild.id, user.id);
    if (active) {
        return interaction.editReply({
            content: t(locale, 'commands.ticket.err_already_open', { channel: `<#${active.channel_id}>` }),
        });
    }

    let categoryChannel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildCategory && c.name.includes('ticket-waguri')
    );
    if (!categoryChannel) {
        try {
            categoryChannel = await guild.channels.create({
                name: '🌸-tiem-ticket-waguri',
                type: ChannelType.GuildCategory,
            });
        } catch (e) {
            /* best-effort */
        }
    }

    const safeName = user.username.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 15) || 'user';
    const overwrites = [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        {
            id: user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
            ],
        },
        {
            id: guild.members.me.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.AttachFiles,
            ],
        },
    ];

    // --- Xác định STAFF: hai tầng, KHÔNG dò theo tên role -------------------------------
    // Cách cũ `roles.cache.find(r => /staff|support|mod|admin/i.test(r.name))` hỏng CẢ HAI
    // chiều: khớp nhầm role tên `admin-logs` -> lộ nội dung ticket riêng tư; không khớp
    // role tên `Hỗ trợ`/`Nhân viên` -> staff KHÔNG thấy ticket, người chơi chờ mãi. Regex
    // không có một từ tiếng Việt nào mà đây là bot tiếng Việt, nên nhánh thứ hai mới phổ biến.
    const QUYEN_STAFF = [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
    ];
    const cauHinh = await db.getGuildSettings(guild.id);
    let roleStaff = [];

    // Tầng 1: admin đã chỉ đích danh qua `/config staff-role` -> chính xác tuyệt đối.
    if (cauHinh?.staff_role_id) {
        const r = guild.roles.cache.get(String(cauHinh.staff_role_id));
        if (r) roleStaff = [r];
    }
    // Tầng 2: chưa cấu hình -> lấy mọi role CÓ QUYỀN quản lý luồng. Đây là tín hiệu ngữ
    // nghĩa (Discord đã trao quyền) thay vì đoán qua chữ trong tên. `has()` mặc định tính
    // cả Administrator nên tầng này tự động bao luôn mọi role admin.
    if (!roleStaff.length) {
        roleStaff = guild.roles.cache
            .filter(r => r.id !== guild.id && !r.managed &&
                         r.permissions.has(PermissionsBitField.Flags.ManageThreads))
            .first(10);   // chặn trần: Discord giới hạn số overwrite mỗi kênh
    }

    for (const r of roleStaff) overwrites.push({ id: r.id, allow: QUYEN_STAFF });

    // Dự phòng cuối (phương án (c)): server chưa hề có role quản trị nào. Chủ server vốn đã
    // thấy kênh nhờ Administrator bỏ qua overwrite, nhưng thêm tường minh để kênh HIỆN trong
    // danh sách của họ thay vì chỉ "thấy nếu đi tìm" — rồi mention một lần ở dưới.
    const thieuCauHinh = roleStaff.length === 0;
    if (thieuCauHinh && guild.ownerId) {
        overwrites.push({ id: guild.ownerId, allow: QUYEN_STAFF });
    }

    let ticketChannel;
    try {
        ticketChannel = await guild.channels.create({
            name: `ticket-${safeName}`,
            type: ChannelType.GuildText,
            parent: categoryChannel ? categoryChannel.id : undefined,
            permissionOverwrites: overwrites,
            reason: `Mở ticket cho ${user.tag}`,
        });
    } catch (err) {
        logError('create_ticket_channel', err, { user: user.id, guild: guild.id });
        return interaction.editReply({
            content: t(locale, 'commands.ticket.err_bot_no_perm'),
        });
    }

    // Ghi DB NGAY và KIỂM kết quả. Trước đây giá trị trả về bị bỏ qua: DB lỗi -> kênh vẫn
    // tồn tại mãi mà không có bản ghi -> `getActiveTicket` trả rỗng -> người chơi mở được
    // VÔ HẠN ticket, và kênh mồ côi chất đống trong server.
    const banGhi = await db.createTicket(guild.id, ticketChannel.id, user.id, category);
    if (!banGhi) {
        // Dọn kênh vừa tạo để không để lại rác. Kênh phải có TRƯỚC vì bản ghi cần channel_id,
        // nên không thể đảo thứ tự — bù lại bằng việc hoàn tác khi bước sau hỏng.
        await ticketChannel.delete('Ghi ticket vào DB thất bại — dọn kênh mồ côi').catch(() => {});
        return interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'error', {
                locale, description: t(locale, 'commands.ticket.error_desc'),
            })],
        });
    }

    const catLabels = {
        general: t(locale, 'commands.ticket.cat_general'),
        bug: t(locale, 'commands.ticket.cat_bug'),
        premium: t(locale, 'commands.ticket.cat_premium'),
    };
    const guideEmbed = new EmbedBuilder()
        .setColor('#f472b6')
        .setTitle(`${t(locale, 'commands.ticket.guide_title')} • ${catLabels[category] || category}`)
        .setDescription(t(locale, 'commands.ticket.guide_desc', { user: user.id }))
        .addFields(
            { name: t(locale, 'commands.ticket.field_opener'), value: `<@${user.id}>`, inline: true },
            { name: t(locale, 'commands.ticket.field_category'), value: catLabels[category] || category, inline: true },
            { name: t(locale, 'commands.ticket.field_status'), value: t(locale, 'commands.ticket.status_open'), inline: true }
        )
        .setFooter({ text: 'Waguri Support Ticket System' });

    // Cảnh báo hiển thị NGAY TRONG ticket, nơi admin chắc chắn nhìn thấy khi vào đọc.
    if (thieuCauHinh) {
        guideEmbed.addFields({
            name: t(locale, 'commands.ticket.warn_no_staff_title'),
            value: t(locale, 'commands.ticket.warn_no_staff_desc'),
        });
    }

    const claimBtn = new ButtonBuilder().setCustomId('tkt:claim').setLabel(t(locale, 'commands.ticket.btn_claim')).setStyle(ButtonStyle.Success);
    const lockBtn = new ButtonBuilder().setCustomId('tkt:lock').setLabel(t(locale, 'commands.ticket.btn_lock')).setStyle(ButtonStyle.Secondary);
    const closeBtn = new ButtonBuilder().setCustomId('tkt:close').setLabel(t(locale, 'commands.ticket.btn_close')).setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(claimBtn, lockBtn, closeBtn);

    // Không có role staff nào -> mention CHỦ SERVER một lần, để ticket không nằm im chờ
    // người không biết là mình cần đọc.
    const nhacAi = roleStaff.length
        ? roleStaff.map(r => `<@&${r.id}>`).join(' ')
        : (thieuCauHinh && guild.ownerId ? `<@${guild.ownerId}>` : '');
    await ticketChannel.send({
        content: `<@${user.id}>${nhacAi ? ' | ' + nhacAi : ''}`,
        embeds: [guideEmbed],
        components: [row],
    });

    await interaction.editReply({
        content: t(locale, 'commands.ticket.success_reply', { thread: `<#${ticketChannel.id}>` }),
    });
}

async function handleTicketComponent(interaction, locale) {
    const { customId, channel, user, member } = interaction;
    const { PermissionsBitField, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');

    const ticket = await db.getTicketByChannel(channel.id);

    if (customId === 'tkt:claim') {
        const isStaff = member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
            member.roles.cache.some(r => /staff|support|mod|admin/i.test(r.name));
        if (!isStaff) {
            return interaction.reply({ content: '❌ Cậu không có quyền nhận ticket hỗ trợ này nhen!', flags: MessageFlags.Ephemeral });
        }

        const claimed = await db.claimTicket(channel.id, user.id);
        if (!claimed) {
            return interaction.reply({ content: '❌ Ticket này đã có người nhận hỗ trợ hoặc đã đóng trước đó rồi!', flags: MessageFlags.Ephemeral });
        }

        await channel.setName(`claimed-${channel.name.replace('ticket-', '')}`).catch(() => {});
        const claimEmbed = new EmbedBuilder()
            .setColor('#22c55e')
            .setDescription(`🙋‍♂️ Staff <@${user.id}> đã nhận chịu trách nhiệm hỗ trợ cho ticket này!`);
        return interaction.reply({ embeds: [claimEmbed] });
    }

    if (customId === 'tkt:lock') {
        const isStaff = member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
            member.roles.cache.some(r => /staff|support|mod|admin/i.test(r.name));
        if (!isStaff) {
            return interaction.reply({ content: '❌ Cậu không có quyền khóa ticket này!', flags: MessageFlags.Ephemeral });
        }

        if (ticket) {
            await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }).catch(() => {});
        }
        return interaction.reply({ content: '🔒 Kênh ticket đã được khóa quyền chat tạm thời!' });
    }

    if (customId === 'tkt:close') {
        const confirmEmbed = buildWaguriEmbed(interaction, 'warning', {
            locale,
            title: t(locale, 'commands.ticket.confirm_close_title'),
            description: t(locale, 'commands.ticket.confirm_close_desc'),
        });

        const confirmBtn = new ButtonBuilder().setCustomId('tkt:confirm_close').setLabel(t(locale, 'commands.ticket.confirm_btn')).setStyle(ButtonStyle.Danger);
        const cancelBtn = new ButtonBuilder().setCustomId('tkt:cancel_close').setLabel(t(locale, 'commands.ticket.cancel_btn')).setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

        return interaction.reply({ embeds: [confirmEmbed], components: [row] });
    }

    if (customId === 'tkt:cancel_close') {
        return interaction.update({ content: '❌ Đã hủy thao tác đóng ticket!', embeds: [], components: [] });
    }

    if (customId === 'tkt:confirm_close') {
        await interaction.update({ content: '🔒 Đang xuất Transcript và thu dọn ticket...', embeds: [], components: [] });

        // 1. Khóa chat
        if (ticket) {
            await channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }).catch(() => {});
        }

        // 2. Fetch messages & Build HTML Transcript (Zero Disk Garbage)
        let messagesText = '';
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            const sorted = Array.from(fetched.values()).reverse();

            const htmlHeader = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript ${channel.name}</title><style>body{background:#0d0812;color:#f1f5f9;font-family:sans-serif;padding:20px;}.msg{margin-bottom:12px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.05);}.user{font-weight:bold;color:#f472b6;}.time{font-size:12px;color:#94a3b8;margin-left:8px;}.att{color:#38bdf8;margin-top:4px;display:block;}</style></head><body><h2>Transcript Ticket: ${escapeHtml(channel.name)}</h2><hr/>`;

            const htmlBody = sorted.map(m => {
                const atts = Array.from(m.attachments.values())
                    .map(a => `<a class="att" href="${escapeHtml(a.url)}" target="_blank">📎 Attachment: ${escapeHtml(a.name)}</a>`)
                    .join('');
                return `<div class="msg"><span class="user">${escapeHtml(m.author.tag)}</span><span class="time">${new Date(m.createdTimestamp).toLocaleString()}</span><div>${escapeHtml(m.content)}</div>${atts}</div>`;
            }).join('');

            const htmlFooter = `</body></html>`;
            messagesText = htmlHeader + htmlBody + htmlFooter;
        } catch (e) {
            messagesText = `Transcript Ticket ${channel.name}\n${new Date().toISOString()}`;
        }

        const buffer = Buffer.from(messagesText, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.html` });

        // 3. Gửi DM cho User (Safe try/catch)
        if (ticket) {
            try {
                const targetUser = await interaction.client.users.fetch(ticket.user_id);
                if (targetUser) {
                    await targetUser.send({
                        content: `🌸 Ticket hỗ trợ của cậu tại kênh \`${channel.name}\` đã được đóng. Dưới đây là bản Transcript lưu vết cuộc trò chuyện:`,
                        files: [attachment]
                    });
                }
            } catch (e) {
                /* User DM disabled -> Ignore safely */
            }
        }

        // 4. Cập nhật DB & Đếm ngược 5s trước khi xóa channel
        await db.closeTicket(channel.id);
        await channel.send({ content: '🔒 Ticket đã được đóng an toàn. Kênh sẽ tự động xóa trong 5 giây...' });

        setTimeout(async () => {
            await channel.delete('Đóng ticket').catch(() => {});
        }, 5000);
    }
}
