const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale?.startsWith('en') ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premium-admin')
        .setDescription('Duyệt đơn Premium thanh toán thủ công (chỉ owner)')
        .setDefaultMemberPermissions(0)
        .addSubcommand(s => s.setName('cho').setDescription('Xem các đơn Premium đang chờ duyệt'))
        .addSubcommand(s => s.setName('duyet').setDescription('Xác nhận đã nhận tiền & kích hoạt 1 đơn')
            .addStringOption(o => o.setName('ma').setDescription('Mã đơn (nội dung CK, vd WAGURI...)').setRequired(true).setAutocomplete(true))),

    async autocomplete(interaction) {
        if (!await isOwner(interaction.client, interaction.user.id)) return interaction.respond([]);
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toUpperCase();
        const pending = await db.getPendingPremiumOrders(25);
        await interaction.respond(pending
            .filter(o => o.code.includes(focused))
            .slice(0, 25)
            .map(o => ({ name: `${o.code} · ${fmt(o.amount, locale)} · ${o.months}m${o.claimed_at ? ' · claimed' : ''}`, value: o.code })));
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');

        if (!await isOwner(interaction.client, interaction.user.id)) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: t(locale, 'commands.premium-admin.only_owner') });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const sub = interaction.options.getSubcommand();

        if (sub === 'cho') {
            const pending = await db.getPendingPremiumOrders(15);
            if (!pending.length) {
                const embed = buildWaguriEmbed(interaction, 'info', { title: t(locale, 'commands.premium-admin.pending_title'), description: t(locale, 'commands.premium-admin.pending_none') });
                return interaction.editReply({ embeds: [embed] });
            }
            const lines = [];
            for (const o of pending) {
                let name = o.user_id;
                try { name = (await interaction.client.users.fetch(String(o.user_id))).username; } catch { /* ignore */ }
                const created = Math.floor(new Date(o.created_at).getTime() / 1000);
                const suffix = isEn ? ' · **claimed**' : ' · **đã báo CK**';
                lines.push(
                    `${o.claimed_at ? '🔔' : '▫️'} \`${o.code}\` — **${fmt(o.amount, locale)}** (${o.months} ${isEn ? 'months' : 'tháng'})\n` +
                    `　↳ ${name} (\`${o.user_id}\`) · ${isEn ? 'created' : 'tạo'} <t:${created}:R>${o.claimed_at ? suffix : ''}`
                );
            }
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: t(locale, 'commands.premium-admin.pending_title'),
                description: t(locale, 'commands.premium-admin.pending_desc', { lines: lines.join('\n') })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'duyet') {
            const code = interaction.options.getString('ma').trim().toUpperCase();
            const r = await db.approvePremiumOrder(code, `manual:${interaction.user.id}`);
            if (!r?.ok) {
                const msg = r?.reason === 'not_found'
                    ? t(locale, 'commands.premium-admin.duyet_fail_not_found', { code })
                    : t(locale, 'commands.premium-admin.duyet_fail_generic');
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: msg })] });
            }
            const untilTime = r.until ? `<t:${Math.floor(new Date(r.until).getTime() / 1000)}:R>` : '';
            if (r.already) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.premium-admin.duyet_already', { code, time: untilTime }) })] });
            }

            // DM cảm ơn buyer
            try {
                const buyer = await interaction.client.users.fetch(String(r.user_id));
                const untilText = r.until ? (isEn ? ` Expires ${untilTime}.` : ` Hết hạn ${untilTime}.`) : '';
                await buyer.send(
                    t(locale, 'commands.premium-admin.dm_buyer_thanks', { months: r.months, until: untilText })
                );
            } catch { /* buyer blocked DMs -> ignore */ }

            const embed = buildWaguriEmbed(interaction, 'success', {
                title: t(locale, 'commands.premium-admin.duyet_success_title'),
                description: t(locale, 'commands.premium-admin.duyet_success_desc', { months: r.months, user: r.user_id, code, time: untilTime })
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
