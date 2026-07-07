const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { getProgress } = require('../../lib/leveling');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

async function move(interaction, toBank) {
    const locale = await getInteractionLanguage(interaction);
    const raw = interaction.options.getString('amount');
    const title = toBank ? t(locale, 'commands.bank.deposit_title') : t(locale, 'commands.bank.withdraw_title');
    const user = await db.getUser(interaction.user.id);
    if (!user) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title, description: t(locale, 'common.db_error') })] });

    const amount = parseAmount(raw, toBank ? Number(user.wallet) : Number(user.bank)); // hỗ trợ 1k/2m/all
    if (!amount || amount <= 0) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title, description: t(locale, 'commands.bank.invalid_amount') })] });

    const ok = await db.transferBank(interaction.user.id, amount, toBank);
    if (!ok) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title, description: toBank ? t(locale, 'commands.bank.deposit_insufficient') : t(locale, 'commands.bank.withdraw_insufficient') })] });

    const u = await db.getUser(interaction.user.id);
    const bal = t(locale, 'commands.bank.balance_desc', { wallet: fmt(u?.wallet || 0, locale), bank: fmt(u?.bank || 0, locale), currency: config.CURRENCY });
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: toBank ? t(locale, 'commands.bank.deposit_success_title') : t(locale, 'commands.bank.withdraw_success_title'),
        description: (toBank ? t(locale, 'commands.bank.deposit_success_desc', { amount: fmt(amount, locale), currency: config.CURRENCY }) : t(locale, 'commands.bank.withdraw_success_desc', { amount: fmt(amount, locale), currency: config.CURRENCY })) + bal
    })] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Ngân hàng 🏦 — quản lý tài chính, gửi / rút tiền')
        .addSubcommand(s => s.setName('balance').setDescription('Xem ví, ngân hàng và cấp độ')
            .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)))
        .addSubcommand(s => s.setName('gui').setDescription('Gửi tiền từ ví vào ngân hàng')
            .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true)))
        .addSubcommand(s => s.setName('rut').setDescription('Rút tiền từ ngân hàng về ví')
            .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true))),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        if (sub === 'gui') return move(interaction, true);
        if (sub === 'rut') return move(interaction, false);

        if (sub === 'balance') {
            const target = interaction.options.getUser('target') || interaction.user;
            const user = await db.getUser(target.id);
            if (!user) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'common.db_error')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const p = getProgress(Number(user.exp));
            const wallet = fmt(Number(user.wallet), locale);
            const bank = fmt(Number(user.bank), locale);
            const energy = await db.getEnergy(target.id);

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                fields: [
                    { name: t(locale, 'commands.bank.fields.wallet'), value: `${wallet} ${config.CURRENCY}`, inline: true },
                    { name: t(locale, 'commands.bank.fields.bank'), value: `${bank} ${config.CURRENCY}`, inline: true },
                    { name: t(locale, 'commands.bank.fields.energy'), value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                    { name: t(locale, 'commands.bank.fields.level'), value: `Lv.${p.level}`, inline: true },
                    { name: t(locale, 'commands.bank.fields.progress', { current: p.expIntoLevel, total: p.expForNextLevel }), value: createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12), inline: false }
                ]
            });

            embed.setAuthor({ name: t(locale, 'commands.bank.author_title', { user: target.username }), iconURL: target.displayAvatarURL() });

            // Buff đang chạy (nếu có)
            if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
                const minsLeft = Math.ceil((new Date(user.buff_expires_at).getTime() - Date.now()) / 60000);
                const pct = Math.round((Number(user.buff_mult) - 1) * 100);
                embed.addFields({ name: t(locale, 'commands.bank.fields.buff'), value: t(locale, 'commands.bank.buff_desc', { pct, time: minsLeft }), inline: false });
                embed.setFooter({
                    text: t(locale, 'commands.bank.buff_footer', { pct, original: embed.data.footer.text }),
                    iconURL: embed.data.footer.icon_url
                });
            }

            embed.setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
