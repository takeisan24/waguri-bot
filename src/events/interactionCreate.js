const { Events, MessageFlags } = require('discord.js');
const { rateLimited } = require('../lib/ratelimit');
const { isBanned } = require('../lib/bans');
const { isBlocked, getJail } = require('../lib/jail');
const { buildWaguriEmbed } = require('../lib/embed');

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

        // --- Slash command ---
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`Không tìm thấy lệnh nào khớp với ${interaction.commandName}.`);
                return;
            }

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
        // Định tuyến theo customId. Quy ước: "namespace:action:..." -> file trong src/components/.
        // (Phase sau sẽ nạp động; hiện chỉ bỏ qua để không crash.)
    },
};
