const { Events, MessageFlags } = require('discord.js');
const { rateLimited } = require('../lib/ratelimit');

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

            // Rate limit tổng (chống spam)
            if (rateLimited(interaction.user.id)) {
                return interaction.reply({ content: 'Cậu thao tác hơi nhanh rồi~ chờ vài giây nhé! 🌸', flags: MessageFlags.Ephemeral });
            }

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Lỗi khi thực thi lệnh ${interaction.commandName}:`, error);
                const errorPayload = {
                    content: 'Đã có lỗi xảy ra khi thực thi lệnh này!',
                    flags: MessageFlags.Ephemeral, // thay cho "ephemeral: true" đã deprecated ở v14.25
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
