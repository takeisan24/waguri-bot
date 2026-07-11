const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { sendPaginated } = require('../../lib/paginate');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

// Dòng hiển thị 1 khoản nợ (cho /vay so)
function loanLine(loan, counterpartId, locale) {
    const ts = Math.floor(new Date(loan.due_at).getTime() / 1000);
    const overdue = new Date(loan.due_at).getTime() < Date.now();
    return t(locale, 'commands.vay.loan_line', {
        counterpart: counterpartId,
        amount: fmt(loan.remaining, locale),
        currency: config.CURRENCY,
        ts,
        overdue: overdue ? t(locale, 'commands.vay.overdue_tag') : ''
    });
}

// --- /vay muon: xin vay (chủ nợ bấm đồng ý) ---
async function subMuon(interaction, locale) {
    const me = interaction.user;
    const lender = interaction.options.getUser('lender');
    const amount = interaction.options.getInteger('amount');
    const err = (d) => interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'error', {
            locale,
            title: t(locale, 'commands.vay.embed_title_warning'),
            description: d
        })]
    });

    if (!lender) return err(t(locale, 'commands.vay.err_lender_missing'));
    if (lender.bot) return err(t(locale, 'commands.vay.err_bot'));
    if (lender.id === me.id) return err(t(locale, 'commands.vay.err_self'));
    if (!amount || amount < config.LOAN.MIN) return err(t(locale, 'commands.vay.err_min', { min: fmt(config.LOAN.MIN, locale), currency: config.CURRENCY }));
    if (amount > config.LOAN.MAX) return err(t(locale, 'commands.vay.err_max', { max: fmt(config.LOAN.MAX, locale), currency: config.CURRENCY }));

    const due = Math.floor(amount * (1 + config.LOAN.INTEREST_PCT));
    const embed = buildWaguriEmbed(interaction, 'info', {
        locale,
        title: t(locale, 'commands.vay.proposal_title'),
        description: t(locale, 'commands.vay.proposal_desc', {
            me: me.id,
            lender: lender.id,
            amount: fmt(amount, locale),
            currency: config.CURRENCY,
            interest: Math.round(config.LOAN.INTEREST_PCT * 100),
            due: fmt(due, locale),
            days: config.LOAN.DUE_DAYS
        })
    });
    const row = (dis = false) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('yes').setLabel(t(locale, 'commands.vay.btn_yes')).setStyle(ButtonStyle.Success).setDisabled(dis),
        new ButtonBuilder().setCustomId('no').setLabel(t(locale, 'commands.vay.btn_no')).setStyle(ButtonStyle.Secondary).setDisabled(dis),
    );
    const msg = await interaction.editReply({ content: `<@${lender.id}>`, embeds: [embed], components: [row()] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
    let answered = false;

    collector.on('collect', async (i) => {
        if (i.user.id !== lender.id) return i.reply({ content: t(locale, 'commands.vay.err_not_lender'), flags: MessageFlags.Ephemeral });
        if (answered) return i.deferUpdate().catch(() => {}); // chống double-click
        answered = true;
        if (i.customId === 'no') {
            await i.update({
                embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.vay.rejected_title'),
                    description: t(locale, 'commands.vay.rejected_desc', { lender: lender.id, me: me.id })
                })],
                components: []
            });
            return collector.stop('done');
        }
        const r = await db.loanCreate(lender.id, me.id, amount);
        if (!r || r.status !== 'ok') {
            const txt = r?.status === 'poor'
                ? t(locale, 'commands.vay.err_poor_lender', { lender: lender.id, amount: fmt(amount, locale), currency: config.CURRENCY })
                : t(locale, 'commands.vay.err_system');
            await i.update({
                embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.vay.error_title'),
                    description: txt
                })],
                components: []
            });
            return collector.stop('done');
        }
        const ts = Math.floor(new Date(r.due_at).getTime() / 1000);
        await i.update({
            embeds: [buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.vay.success_title'),
                description: t(locale, 'commands.vay.success_desc', {
                    lender: lender.id,
                    me: me.id,
                    amount: fmt(amount, locale),
                    currency: config.CURRENCY,
                    remaining: fmt(r.remaining, locale),
                    ts
                })
            })],
            components: []
        });
        collector.stop('done');
    });
    collector.on('end', async () => {
        if (!answered) await interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.vay.timeout_title'),
                description: t(locale, 'commands.vay.timeout_desc', { lender: lender.id })
            })],
            components: []
        }).catch(() => {});
    });
}

// --- /vay tra: trả nợ ---
async function subTra(interaction, locale) {
    const me = interaction.user;
    const lender = interaction.options.getUser('lender');
    if (!lender || lender.id === me.id) return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.vay.err_lender_missing')
        })]
    });
    const amount = interaction.options.getInteger('amount');
    const payAmt = amount && amount > 0 ? amount : 999_999_999_999; // bỏ trống = trả tối đa có thể

    const r = await db.loanRepay(me.id, lender.id, payAmt);
    if (!r) return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'error', {
            locale,
            description: t(locale, 'commands.vay.err_system')
        })]
    });
    if (r.status === 'none') return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.vay.err_not_owing', { lender: lender.id })
        })]
    });
    if (r.status === 'poor') return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'error', {
            locale,
            title: t(locale, 'commands.vay.repay_success_title'), // Dùng chung hoặc title khác
            description: t(locale, 'commands.vay.err_poor_borrower', { lender: lender.id, remaining: fmt(r.remaining, locale), currency: config.CURRENCY })
        })]
    });

    const u = await db.getUser(me.id);
    const remStr = Number(r.remaining) > 0
        ? t(locale, 'commands.vay.remaining_debt', { rem: fmt(r.remaining, locale), currency: config.CURRENCY })
        : t(locale, 'commands.vay.debt_cleared');

    return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.vay.repay_success_title'),
            description: t(locale, 'commands.vay.repay_success_desc', {
                lender: lender.id,
                paid: fmt(r.paid, locale),
                remaining: remStr,
                wallet: fmt(u?.wallet || 0, locale),
                currency: config.CURRENCY
            })
        })]
    });
}

// --- /vay doi: đòi nợ quá hạn (cưỡng chế thu) ---
async function subDoi(interaction, locale) {
    const me = interaction.user;
    const borrower = interaction.options.getUser('borrower');
    if (!borrower || borrower.id === me.id) return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.vay.err_borrower_missing')
        })]
    });

    const r = await db.loanCollect(me.id, borrower.id);
    if (!r) return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'error', {
            locale,
            description: t(locale, 'commands.vay.err_system')
        })]
    });
    if (r.status === 'not_overdue') return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.vay.err_not_overdue', { borrower: borrower.id })
        })]
    });
    if (r.status === 'broke') return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'error', {
            locale,
            description: t(locale, 'commands.vay.err_broke_borrower', { borrower: borrower.id, overdue: fmt(r.overdue, locale), currency: config.CURRENCY })
        })]
    });

    const remStr = Number(r.overdue_left) > 0
        ? t(locale, 'commands.vay.overdue_left', { left: fmt(r.overdue_left, locale), currency: config.CURRENCY })
        : t(locale, 'commands.vay.overdue_cleared');

    return interaction.editReply({
        embeds: [buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.vay.collect_success_title'),
            description: t(locale, 'commands.vay.collect_success_desc', {
                borrower: borrower.id,
                collected: fmt(r.collected, locale),
                currency: config.CURRENCY,
                wallet: fmt(r.from_wallet, locale),
                bank: fmt(r.from_bank, locale),
                overdueLeftText: remStr
            })
        })]
    });
}

// --- /vay so: xem sổ nợ ---
async function subSo(interaction, locale) {
    const { owing, owed } = await db.loansOf(interaction.user.id);
    const owingTotal = owing.reduce((s, l) => s + Number(l.remaining), 0);
    const owedTotal = owed.reduce((s, l) => s + Number(l.remaining), 0);

    const lines = [];
    lines.push(t(locale, 'commands.vay.total_owing', { amount: fmt(owingTotal, locale), currency: config.CURRENCY }));
    lines.push(t(locale, 'commands.vay.total_owed', { amount: fmt(owedTotal, locale), currency: config.CURRENCY }));
    lines.push('');

    lines.push(t(locale, 'commands.vay.header_owing'));
    if (owing.length) {
        owing.forEach(l => lines.push(loanLine(l, l.lender_id, locale)));
    } else {
        lines.push(t(locale, 'commands.vay.no_debts'));
    }
    lines.push('');

    lines.push(t(locale, 'commands.vay.header_owed'));
    if (owed.length) {
        owed.forEach(l => lines.push(loanLine(l, l.borrower_id, locale)));
    } else {
        lines.push(t(locale, 'commands.vay.no_lends'));
    }

    await sendPaginated(interaction, {
        title: t(locale, 'commands.vay.title_book'),
        color: config.COLORS.INFO,
        lines,
        perPage: 10,
        footerNote: t(locale, 'commands.vay.book_footer'),
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vay')
        .setDescription('Vay–trả nợ giữa người chơi 🤝 (muon · tra · doi · so)')
        .addSubcommand(s => s.setName('muon').setDescription('Xin vay tiền của người khác (họ phải đồng ý) 🤝')
            .addUserOption(o => o.setName('lender').setDescription('Người cậu muốn vay').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền muốn vay').setRequired(true).setMinValue(config.LOAN.MIN)))
        .addSubcommand(s => s.setName('tra').setDescription('Trả nợ cho chủ nợ 💵')
            .addUserOption(o => o.setName('lender').setDescription('Chủ nợ').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền trả (bỏ trống = trả hết có thể)').setMinValue(1)))
        .addSubcommand(s => s.setName('doi').setDescription('Đòi nợ — khoản QUÁ HẠN bị cưỡng chế thu (cả ví lẫn ngân hàng) 🧾')
            .addUserOption(o => o.setName('borrower').setDescription('Con nợ').setRequired(true)))
        .addSubcommand(s => s.setName('so').setDescription('Xem sổ nợ của cậu (đang vay & cho vay) 🧾')),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'muon') return subMuon(interaction, locale);
        if (sub === 'tra') return subTra(interaction, locale);
        if (sub === 'doi') return subDoi(interaction, locale);
        if (sub === 'so') return subSo(interaction, locale);
        return interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.vay.embed_title_warning'),
                description: t(locale, 'commands.vay.err_invalid_sub')
            })]
        });
    },
};
