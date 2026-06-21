const { Events, MessageFlags } = require('discord.js');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { buildWaguriEmbed } = require('../lib/embed');
const { recordMembership } = require('../lib/membership');
const { logError } = require('../lib/logger');
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
                console.error(`Không tìm thấy lệnh nào khớp với ${interaction.commandName}.`);
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
            return;
        }
        // Các component khác: định tuyến theo customId (phase sau sẽ nạp động).
    },
};
