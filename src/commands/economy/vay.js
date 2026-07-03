const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

// Dòng hiển thị 1 khoản nợ (cho /vay so)
function loanLine(loan, counterpartId) {
    const ts = Math.floor(new Date(loan.due_at).getTime() / 1000);
    const overdue = new Date(loan.due_at).getTime() < Date.now();
    return `• <@${counterpartId}> — **${fmt(loan.remaining)}** ${config.CURRENCY} · hạn <t:${ts}:R>${overdue ? ' ⚠️ **QUÁ HẠN**' : ''}`;
}

// --- /vay muon: xin vay (chủ nợ bấm đồng ý) ---
async function subMuon(interaction) {
    const me = interaction.user;
    const lender = interaction.options.getUser('lender');
    const amount = interaction.options.getInteger('amount');
    const err = (d) => interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🤝・Vay tiền', description: d })] });

    if (!lender) return err('Cậu muốn vay ai? Nhập @người nhé~ 🌸');
    if (lender.bot) return err('Bot không cho vay đâu cậu ơi~ 😄');
    if (lender.id === me.id) return err('Cậu không thể tự vay chính mình~ 😅');
    if (!amount || amount < config.LOAN.MIN) return err(`Vay tối thiểu **${fmt(config.LOAN.MIN)}** ${config.CURRENCY} nhé~`);
    if (amount > config.LOAN.MAX) return err(`Mỗi lần vay tối đa **${fmt(config.LOAN.MAX)}** ${config.CURRENCY} thôi nhé~`);

    const due = Math.floor(amount * (1 + config.LOAN.INTEREST_PCT));
    const embed = buildWaguriEmbed(interaction, 'info', {
        title: '🤝・Lời đề nghị vay tiền',
        description: `<@${me.id}> muốn vay <@${lender.id}> **${fmt(amount)}** ${config.CURRENCY}.\n` +
            `Lãi **${Math.round(config.LOAN.INTEREST_PCT * 100)}%** → phải trả **${fmt(due)}** ${config.CURRENCY} trong **${config.LOAN.DUE_DAYS} ngày**.\n` +
            `*(Quá hạn, chủ nợ có quyền \`/vay doi\` cưỡng chế thu cả ví lẫn ngân hàng!)*\n\n<@${lender.id}> ơi, cậu có đồng ý cho vay không?`
    });
    const row = (dis = false) => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('yes').setLabel('Cho vay 💸').setStyle(ButtonStyle.Success).setDisabled(dis),
        new ButtonBuilder().setCustomId('no').setLabel('Từ chối').setStyle(ButtonStyle.Secondary).setDisabled(dis),
    );
    const msg = await interaction.editReply({ content: `<@${lender.id}>`, embeds: [embed], components: [row()] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });
    let answered = false;

    collector.on('collect', async (i) => {
        if (i.user.id !== lender.id) return i.reply({ content: 'Lời đề nghị này không dành cho cậu~ 😊', flags: MessageFlags.Ephemeral });
        if (answered) return i.deferUpdate().catch(() => {}); // chống double-click: chỉ xử lý lần bấm đầu (tránh tạo 2 khế ước / trừ ví 2 lần)
        answered = true;
        if (i.customId === 'no') {
            await i.update({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🤝・Vay tiền bị từ chối', description: `<@${lender.id}> đã từ chối cho <@${me.id}> vay. 💔` })], components: [] });
            return collector.stop('done');
        }
        const r = await db.loanCreate(lender.id, me.id, amount);
        if (!r || r.status !== 'ok') {
            const txt = r?.status === 'poor' ? `<@${lender.id}> không đủ **${fmt(amount)}** ${config.CURRENCY} trong ví để cho vay 😟` : 'Ơ, có lỗi khi lập khế ước, thử lại sau nhé~';
            await i.update({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🤝・Lỗi vay tiền', description: txt })], components: [] });
            return collector.stop('done');
        }
        const ts = Math.floor(new Date(r.due_at).getTime() / 1000);
        await i.update({ embeds: [buildWaguriEmbed(interaction, 'success', { title: '🤝・Đã cho vay!', description: `<@${lender.id}> đã cho <@${me.id}> vay **${fmt(amount)}** ${config.CURRENCY}.\n<@${me.id}> cần trả **${fmt(r.remaining)}** ${config.CURRENCY} trước <t:${ts}:R> (dùng \`/vay tra\`).` })], components: [] });
        collector.stop('done');
    });
    collector.on('end', async () => {
        if (!answered) await interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🤝・Lời đề nghị vay tiền hết hạn', description: `<@${lender.id}> chưa trả lời kịp~ Thử lại sau nhé.` })], components: [] }).catch(() => {});
    });
}

// --- /vay tra: trả nợ ---
async function subTra(interaction) {
    const me = interaction.user;
    const lender = interaction.options.getUser('lender');
    if (!lender || lender.id === me.id) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { description: 'Cậu muốn trả nợ cho ai? Nhập @chủ nợ nhé~ 🌸' })] });
    const amount = interaction.options.getInteger('amount');
    const payAmt = amount && amount > 0 ? amount : 999_999_999_999; // bỏ trống = trả tối đa có thể

    const r = await db.loanRepay(me.id, lender.id, payAmt);
    if (!r) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: 'Ơ, có lỗi khi trả nợ, thử lại sau nhé~ 🌸' })] });
    if (r.status === 'none') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { description: `Cậu không nợ <@${lender.id}> đồng nào cả~ 🌸` })] });
    if (r.status === 'poor') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '💵 Trả nợ', description: `Ví cậu đang trống, chưa trả được~ Còn nợ <@${lender.id}> **${fmt(r.remaining)}** ${config.CURRENCY}. 😟` })] });

    const u = await db.getUser(me.id);
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '💵 Trả nợ thành công!',
        description: `Cậu đã trả <@${lender.id}> **${fmt(r.paid)}** ${config.CURRENCY}.\n` +
            (Number(r.remaining) > 0 ? `Còn nợ: **${fmt(r.remaining)}** ${config.CURRENCY}.` : '🎉 Cậu đã trả hết nợ cho người này!') +
            `\n💵 Số dư ví: **${fmt(u?.wallet || 0)}** ${config.CURRENCY}`
    })] });
}

// --- /vay doi: đòi nợ quá hạn (cưỡng chế thu) ---
async function subDoi(interaction) {
    const me = interaction.user;
    const borrower = interaction.options.getUser('borrower');
    if (!borrower || borrower.id === me.id) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { description: 'Cậu muốn đòi nợ ai? Nhập @con nợ nhé~ 🌸' })] });

    const r = await db.loanCollect(me.id, borrower.id);
    if (!r) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: 'Ơ, có lỗi khi đòi nợ, thử lại sau nhé~ 🌸' })] });
    if (r.status === 'not_overdue') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { description: `<@${borrower.id}> chưa có khoản nào **quá hạn** để đòi (hoặc không nợ cậu). Kiên nhẫn chút nha~ 🌸` })] });
    if (r.status === 'broke') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: `<@${borrower.id}> đang **cháy túi**, chưa moi được đồng nào 😤 Khoản quá hạn còn lại: **${fmt(r.overdue)}** ${config.CURRENCY}.` })] });

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🧾 Cưỡng chế đòi nợ thành công!',
        description: `Cậu đã cưỡng chế thu của <@${borrower.id}> **${fmt(r.collected)}** ${config.CURRENCY} *(ví ${fmt(r.from_wallet)} + ngân hàng ${fmt(r.from_bank)})*.\n` +
            (Number(r.overdue_left) > 0 ? `Còn nợ quá hạn: **${fmt(r.overdue_left)}** ${config.CURRENCY} — đòi tiếp khi họ có tiền nhé!` : '🎉 Đã thu đủ phần quá hạn!')
    })] });
}

// --- /vay so: xem sổ nợ ---
async function subSo(interaction) {
    const { owing, owed } = await db.loansOf(interaction.user.id);
    const owingTotal = owing.reduce((s, l) => s + Number(l.remaining), 0);
    const owedTotal = owed.reduce((s, l) => s + Number(l.remaining), 0);

    const embed = buildWaguriEmbed(interaction, 'info', {
        title: '🧾 Sổ nợ của cậu',
        fields: [
            { name: `💸 Cậu đang nợ (tổng ${fmt(owingTotal)} ${config.CURRENCY})`, value: owing.length ? owing.map(l => loanLine(l, l.lender_id)).join('\n') : '*(không nợ ai cả~)*', inline: false },
            { name: `🤝 Người khác nợ cậu (tổng ${fmt(owedTotal)} ${config.CURRENCY})`, value: owed.length ? owed.map(l => loanLine(l, l.borrower_id)).join('\n') : '*(chưa cho ai vay)*', inline: false },
        ]
    });
    embed.setFooter({ text: `Trả nợ: /vay tra · Đòi nợ quá hạn: /vay doi • ${embed.data.footer.text}`, iconURL: embed.data.footer.icon_url });
    return interaction.editReply({ embeds: [embed] });
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
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'muon') return subMuon(interaction);
        if (sub === 'tra') return subTra(interaction);
        if (sub === 'doi') return subDoi(interaction);
        if (sub === 'so') return subSo(interaction);
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🤝・Vay tiền', description: 'Lệnh con không hợp lệ~ Thử `/vay muon`, `/vay tra`, `/vay doi`, hoặc `/vay so` nhé!' })] });
    },
};
