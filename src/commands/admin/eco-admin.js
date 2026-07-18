const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { isOwner } = require('../../lib/owner');
const { setBan } = require('../../lib/bans');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale?.startsWith('en') ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eco-admin')
        .setDescription('Công cụ quản trị economy (chỉ owner)')
        .setDefaultMemberPermissions(0)
        .addSubcommand(s => s.setName('addmoney').setDescription('Cộng/trừ tiền')
            .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền (âm để trừ)').setRequired(true))
            .addStringOption(o => o.setName('field').setDescription('Ví hay ngân hàng').addChoices({ name: 'Ví', value: 'wallet' }, { name: 'Ngân hàng', value: 'bank' })))
        .addSubcommand(s => s.setName('setmoney').setDescription('Đặt cứng số dư')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(0))
            .addStringOption(o => o.setName('field').setDescription('Ví hay ngân hàng').addChoices({ name: 'Ví', value: 'wallet' }, { name: 'Ngân hàng', value: 'bank' })))
        .addSubcommand(s => s.setName('setenergy').setDescription('Đặt năng lượng')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('value').setDescription('Giá trị').setRequired(true).setMinValue(0)))
        .addSubcommand(s => s.setName('setexp').setDescription('Đặt EXP')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('value').setDescription('Giá trị').setRequired(true).setMinValue(0)))
        .addSubcommand(s => s.setName('giveitem').setDescription('Cấp vật phẩm miễn phí')
            .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
            .addStringOption(o => o.setName('item').setDescription('Vật phẩm').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('setjob').setDescription('Bổ nhiệm công việc')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addStringOption(o => o.setName('job').setDescription('Nghề nghiệp').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('premium').setDescription('Cấp/gia hạn Premium cho người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('days').setDescription('Số ngày').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('ban').setDescription('Chặn user dùng bot')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('unban').setDescription('Bỏ chặn user')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('resetuser').setDescription('Xóa sạch dữ liệu một người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('report').setDescription('📊 Báo cáo telemetry kinh tế (cung tiền, phân bố, xu hướng)')),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const sub = interaction.options.getSubcommand();
        if (sub === 'giveitem') {
            const items = await db.getItems();
            await interaction.respond(items
                .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
                .slice(0, 25)
                .map(i => ({ name: i.name, value: i.id })));
        } else if (sub === 'setjob') {
            const jobs = await db.getJobs();
            await interaction.respond(jobs
                .filter(j => j.name.toLowerCase().includes(focused) || j.id.includes(focused))
                .slice(0, 25)
                .map(j => ({ name: j.name, value: j.id })));
        }
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');

        // Chặn người không phải owner (chủ app tự nhận + OWNER_IDS env)
        if (!await isOwner(interaction.client, interaction.user.id)) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.eco-admin.only_owner')
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();

        const sub = interaction.options.getSubcommand();

        // --- Báo cáo telemetry kinh tế (không cần target user) ---
        if (sub === 'report') {
            console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=report`);
            await db.snapshotEconomy(); // cập nhật ảnh chụp hôm nay trước khi xem
            const snaps = await db.getEconomySnapshots(14);
            if (!snaps.length) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.eco-admin.no_telemetry')
                })] });
            }
            const C = config.CURRENCY;
            const cur = snaps[0];
            const prev = snaps[1];
            const weekRef = snaps[Math.min(snaps.length - 1, 7)];
            const delta = (a, b) => {
                if (b == null) return '';
                const d = Number(a) - Number(b);
                return ` (${d >= 0 ? '+' : ''}${fmt(d, locale)})`;
            };
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: isEn ? `📊・Economy Telemetry — ${cur.taken_on}` : `📊・Telemetry Kinh Tế — ${cur.taken_on}`,
                description: isEn
                    ? `**Total Supply:** ${fmt(cur.total_supply, locale)} ${C}${delta(cur.total_supply, prev && prev.total_supply)}\n` +
                      `　_vs ~last week:${delta(cur.total_supply, weekRef && weekRef !== cur ? weekRef.total_supply : null) || ' —'}_\n` +
                      `**Wallet:** ${fmt(cur.total_wallet, locale)} · **Bank:** ${fmt(cur.total_bank, locale)}\n` +
                      `**Players:** ${fmt(cur.user_count, locale)} (active 7d: ${fmt(cur.active_7d, locale)} · Premium: ${fmt(cur.premium_count, locale)})\n` +
                      `**Richest:** ${fmt(cur.richest, locale)} · **Average:** ${fmt(cur.avg_supply, locale)}`
                    : `**Tổng cung tiền:** ${fmt(cur.total_supply, locale)} ${C}${delta(cur.total_supply, prev && prev.total_supply)}\n` +
                      `　_so với ~tuần trước:${delta(cur.total_supply, weekRef && weekRef !== cur ? weekRef.total_supply : null) || ' —'}_\n` +
                      `**Ví:** ${fmt(cur.total_wallet, locale)} · **Ngân hàng:** ${fmt(cur.total_bank, locale)}\n` +
                      `**Người chơi:** ${fmt(cur.user_count, locale)} (hoạt động 7d: ${fmt(cur.active_7d, locale)} · Premium: ${fmt(cur.premium_count, locale)})\n` +
                      `**Giàu nhất:** ${fmt(cur.richest, locale)} · **Trung bình:** ${fmt(cur.avg_supply, locale)}`,
                fields: [{
                    name: t(locale, 'commands.eco-admin.trend_title'),
                    value: snaps.slice(0, 10).map(s => `\`${s.taken_on}\` ${fmt(s.total_supply, locale)} ${C}`).join('\n')
                }]
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const target = interaction.options.getUser('user');
        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.eco-admin.no_target')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        const C = config.CURRENCY;

        // Audit log: ghi lại mọi thao tác admin (cấp tiền/đồ/premium/ban/reset) để truy vết.
        console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=${sub} target=${target.id} ` +
            `opts=${JSON.stringify({ amount: interaction.options.getInteger('amount'), value: interaction.options.getInteger('value'), days: interaction.options.getInteger('days'), item: interaction.options.getString('item'), job: interaction.options.getString('job'), field: interaction.options.getString('field') })}`);

        if (sub === 'addmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.addMoney(target.id, amount, field);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? (amount >= 0
                        ? t(locale, 'commands.eco-admin.addmoney_add_success', { amount: fmt(Math.abs(amount), locale), currency: C, field, user: target.id })
                        : t(locale, 'commands.eco-admin.addmoney_sub_success', { amount: fmt(Math.abs(amount), locale), currency: C, field, user: target.id }))
                    : t(locale, 'commands.eco-admin.addmoney_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.setBalance(target.id, field, amount);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setmoney_success', { field, user: target.id, amount: fmt(amount, locale), currency: C })
                    : t(locale, 'commands.eco-admin.setmoney_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setenergy') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setEnergy(target.id, value);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setenergy_success', { user: target.id, value })
                    : t(locale, 'commands.eco-admin.setenergy_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setexp') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setExp(target.id, value);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setexp_success', { user: target.id, value: fmt(value, locale) })
                    : t(locale, 'commands.eco-admin.setexp_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'giveitem') {
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('qty') || 1;
            const item = await db.getItem(itemId);
            const ok = await db.giveItemAdmin(target.id, itemId, qty);
            const localizedItemName = item ? (t(locale, `data.items.${itemId}.name`) || item.name) : itemId;
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.giveitem_success', { qty, name: localizedItemName, user: target.id })
                    : t(locale, 'commands.eco-admin.giveitem_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setjob') {
            const jobId = interaction.options.getString('job');
            const job = await db.getJob(jobId);
            if (!job) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: t(locale, 'commands.eco-admin.setjob_not_found')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const ok = await db.setUserJob(target.id, jobId);
            const localizedJobName = t(locale, `data.jobs.${jobId}.name`) || job.name;
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setjob_success', { user: target.id, name: localizedJobName })
                    : t(locale, 'commands.eco-admin.setjob_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'ban') {
            const ok = await setBan(target.id, true);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? t(locale, 'commands.eco-admin.ban_success', { user: target.id }) : t(locale, 'commands.eco-admin.ban_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'unban') {
            const ok = await setBan(target.id, false);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? t(locale, 'commands.eco-admin.unban_success', { user: target.id }) : t(locale, 'commands.eco-admin.unban_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'premium') {
            const days = interaction.options.getInteger('days');
            const until = await db.grantPremium(target.id, days);
            const embed = buildWaguriEmbed(interaction, until ? 'success' : 'error', {
                description: until
                    ? t(locale, 'commands.eco-admin.premium_success', { days, user: target.id, time: Math.floor(new Date(until).getTime() / 1000) })
                    : t(locale, 'commands.eco-admin.premium_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'resetuser') {
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reset_yes').setLabel(t(locale, 'commands.eco-admin.btn_reset_yes')).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('reset_no').setLabel(t(locale, 'commands.eco-admin.btn_reset_no')).setStyle(ButtonStyle.Secondary));
            const warn = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.eco-admin.reset_warn', { user: target.id })
            });
            const msg = await interaction.editReply({ embeds: [warn], components: [confirmRow] });
            try {
                const btn = await msg.awaitMessageComponent({
                    componentType: ComponentType.Button, time: 20000,
                    filter: i => i.user.id === interaction.user.id,
                });
                if (btn.customId === 'reset_no') {
                    return btn.update({ embeds: [buildWaguriEmbed(interaction, 'info', { description: t(locale, 'commands.eco-admin.reset_cancel') })], components: [] });
                }
                const ok = await db.resetUser(target.id);
                return btn.update({ embeds: [buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                    description: ok ? t(locale, 'commands.eco-admin.reset_success', { user: target.id }) : t(locale, 'commands.eco-admin.reset_fail')
                })], components: [] });
            } catch {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { description: t(locale, 'commands.eco-admin.reset_timeout') })], components: [] }).catch(() => {});
            }
        }
    },
};
