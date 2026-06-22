const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premium-admin')
        .setDescription('Duyệt đơn Premium thanh toán thủ công (chỉ owner)')
        .addSubcommand(s => s.setName('cho').setDescription('Xem các đơn Premium đang chờ duyệt'))
        .addSubcommand(s => s.setName('duyet').setDescription('Xác nhận đã nhận tiền & kích hoạt 1 đơn')
            .addStringOption(o => o.setName('ma').setDescription('Mã đơn (nội dung CK, vd WAGURI...)').setRequired(true).setAutocomplete(true))),

    async autocomplete(interaction) {
        if (!await isOwner(interaction.client, interaction.user.id)) return interaction.respond([]);
        const focused = interaction.options.getFocused().toUpperCase();
        const pending = await db.getPendingPremiumOrders(25);
        await interaction.respond(pending
            .filter(o => o.code.includes(focused))
            .slice(0, 25)
            .map(o => ({ name: `${o.code} · ${fmt(o.amount)}đ · ${o.months}th${o.claimed_at ? ' · đã báo CK' : ''}`, value: o.code })));
    },

    async execute(interaction) {
        if (!await isOwner(interaction.client, interaction.user.id)) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: 'Lệnh này chỉ dành cho owner thôi nhé~ 🌸' });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sub = interaction.options.getSubcommand();

        if (sub === 'cho') {
            const pending = await db.getPendingPremiumOrders(15);
            if (!pending.length) {
                const embed = buildWaguriEmbed(interaction, 'info', { title: '💎 Đơn Premium đang chờ', description: 'Không có đơn nào đang chờ duyệt~ 🌸' });
                return interaction.editReply({ embeds: [embed] });
            }
            const lines = [];
            for (const o of pending) {
                let name = o.user_id;
                try { name = (await interaction.client.users.fetch(String(o.user_id))).username; } catch { /* bỏ qua */ }
                const created = Math.floor(new Date(o.created_at).getTime() / 1000);
                lines.push(
                    `${o.claimed_at ? '🔔' : '▫️'} \`${o.code}\` — **${fmt(o.amount)}đ** (${o.months} tháng)\n` +
                    `　↳ ${name} (\`${o.user_id}\`) · tạo <t:${created}:R>${o.claimed_at ? ' · **đã báo CK**' : ''}`
                );
            }
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '💎 Đơn Premium đang chờ duyệt',
                description: `${lines.join('\n')}\n\n🔔 = buyer đã bấm "đã chuyển khoản". Duyệt bằng \`/premium-admin duyet\`.`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'duyet') {
            const code = interaction.options.getString('ma').trim().toUpperCase();
            const r = await db.approvePremiumOrder(code, `manual:${interaction.user.id}`);
            if (!r?.ok) {
                const msg = r?.reason === 'not_found' ? `Không tìm thấy đơn \`${code}\`~` : 'Có lỗi khi duyệt, thử lại sau nhé~';
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: msg })] });
            }
            const until = r.until ? `<t:${Math.floor(new Date(r.until).getTime() / 1000)}:R>` : '';
            if (r.already) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: `Đơn \`${code}\` đã được kích hoạt trước đó rồi (Premium tới ${until}).` })] });
            }

            // DM cảm ơn buyer
            try {
                const buyer = await interaction.client.users.fetch(String(r.user_id));
                await buyer.send(
                    `🌸 Cảm ơn cậu đã nâng cấp **Waguri Premium** 💎!\n` +
                    `Mình đã kích hoạt **+${r.months} tháng** cho cậu rồi nè~${until ? ` Hết hạn ${until}.` : ''}\n` +
                    `Gõ \`/premium\` để xem quyền lợi nha 💕`
                );
            } catch { /* buyer tắt DM -> bỏ qua */ }

            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '✅ Đã duyệt đơn Premium',
                description: `Kích hoạt **+${r.months} tháng** cho <@${r.user_id}> (đơn \`${code}\`). Premium tới ${until}. Đã DM báo cho họ 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
