const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vay')
        .setDescription('Xin vay tiền của người khác (họ phải đồng ý) 🤝')
        .addUserOption(o => o.setName('lender').setDescription('Người cậu muốn vay').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Số tiền muốn vay').setRequired(true).setMinValue(config.LOAN.MIN)),
    async execute(interaction) {
        await interaction.deferReply();
        const me = interaction.user;
        const lender = interaction.options.getUser('lender');
        const amount = interaction.options.getInteger('amount');

        if (!lender) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🤝・Vay tiền', description: 'Cậu muốn vay ai? Nhập @người nhé~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (lender.bot) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🤝・Vay tiền', description: 'Bot không cho vay đâu cậu ơi~ 😄' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (lender.id === me.id) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🤝・Vay tiền', description: 'Cậu không thể tự vay chính mình~ 😅' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (amount > config.LOAN.MAX) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🤝・Vay tiền', description: `Mỗi lần vay tối đa **${fmt(config.LOAN.MAX)}** ${config.CURRENCY} thôi nhé~` });
            return interaction.editReply({ embeds: [embed] });
        }

        const due = Math.floor(amount * (1 + config.LOAN.INTEREST_PCT));
        const embed = buildWaguriEmbed(interaction, 'info', {
            title: '🤝・Lời đề nghị vay tiền',
            description: `<@${me.id}> muốn vay <@${lender.id}> **${fmt(amount)}** ${config.CURRENCY}.\n` +
                `Lãi **${Math.round(config.LOAN.INTEREST_PCT * 100)}%** → phải trả **${fmt(due)}** ${config.CURRENCY} trong **${config.LOAN.DUE_DAYS} ngày**.\n` +
                `*(Quá hạn, chủ nợ có quyền \`/donno\` cưỡng chế thu cả ví lẫn ngân hàng!)*\n\n<@${lender.id}> ơi, cậu có đồng ý cho vay không?`
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
            answered = true;
            if (i.customId === 'no') {
                const decEmbed = buildWaguriEmbed(interaction, 'error', {
                    title: '🤝・Vay tiền bị từ chối',
                    description: `<@${lender.id}> đã từ chối cho <@${me.id}> vay. 💔`
                });
                await i.update({ embeds: [decEmbed], components: [] });
                return collector.stop('done');
            }
            const r = await db.loanCreate(lender.id, me.id, amount);
            if (!r || r.status !== 'ok') {
                const txt = r?.status === 'poor' ? `<@${lender.id}> không đủ **${fmt(amount)}** ${config.CURRENCY} trong ví để cho vay 😟` : 'Ơ, có lỗi khi lập khế ước, thử lại sau nhé~';
                const errEmbed = buildWaguriEmbed(interaction, 'error', { title: '🤝・Lỗi vay tiền', description: txt });
                await i.update({ embeds: [errEmbed], components: [] });
                return collector.stop('done');
            }
            const ts = Math.floor(new Date(r.due_at).getTime() / 1000);
            const succEmbed = buildWaguriEmbed(interaction, 'success', {
                title: '🤝・Đã cho vay!',
                description: `<@${lender.id}> đã cho <@${me.id}> vay **${fmt(amount)}** ${config.CURRENCY}.\n<@${me.id}> cần trả **${fmt(r.remaining)}** ${config.CURRENCY} trước <t:${ts}:R> (dùng \`/trano\`).`
            });
            await i.update({ embeds: [succEmbed], components: [] });
            collector.stop('done');
        });
        collector.on('end', async () => {
            if (!answered) {
                const timeoutEmbed = buildWaguriEmbed(interaction, 'warning', {
                    title: '🤝・Lời đề nghị vay tiền hết hạn',
                    description: `<@${lender.id}> chưa trả lời kịp~ Thử lại sau nhé.`
                });
                await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
            }
        });
    },
};
