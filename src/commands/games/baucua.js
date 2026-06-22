const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { checkBet } = require('../../lib/bet');
const { applyPolice } = require('../../lib/police');
const { policeJailEnabled } = require('../../lib/guildflags');
const { buildWaguriEmbed } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');
const SYMBOLS = [
    { id: 'bau', name: 'Bầu', emoji: '🍐' },
    { id: 'cua', name: 'Cua', emoji: '🦀' },
    { id: 'tom', name: 'Tôm', emoji: '🦐' },
    { id: 'ca', name: 'Cá', emoji: '🐟' },
    { id: 'ga', name: 'Gà', emoji: '🐓' },
    { id: 'nai', name: 'Nai', emoji: '🦌' },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('baucua')
        .setDescription('Bầu Cua Tôm Cá: đặt 1 con, đổ 3 xúc xắc')
        .addStringOption(o => o.setName('bet').setDescription('Số tiền cược (vd 1000, 1k, all)').setRequired(true))
        .addStringOption(o => o.setName('choice').setDescription('Đặt con nào?').setRequired(true)
            .addChoices(...SYMBOLS.map(s => ({ name: `${s.emoji} ${s.name}`, value: s.id })))),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const user = await db.getUser(userId);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const bet = parseAmount(interaction.options.getString('bet'), Number(user.wallet));
        const choice = interaction.options.getString('choice');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `🌸 ${err}`
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!await db.addMoney(userId, -bet, 'wallet')) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: 'Ví cậu không đủ để cược~ 😟'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const rolled = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
        const matches = rolled.filter(s => s.id === choice).length;
        const picked = SYMBOLS.find(s => s.id === choice);

        let desc = `🎲 Kết quả: ${rolled.map(s => s.emoji).join(' ')}\n` +
            `Cậu đặt ${picked.emoji} **${picked.name}** — trúng **${matches}** con\n`;
        let win = matches > 0;
        if (win) {
            const payout = bet * (1 + matches);
            await db.addMoney(userId, payout, 'wallet');
            db.questIncr(userId, 'gamble_win', 1);
            desc += `🎉 Thắng **+${fmt(payout - bet)}** ${config.CURRENCY}!`;
        } else {
            desc += `😢 Thua **-${fmt(bet)}** ${config.CURRENCY}. Lần sau nhé~`;
        }
        const policeRes = await applyPolice(userId);
        if (policeRes !== null) {
            const { fine, usedIns } = policeRes;
            let jailTime = config.POLICE.JAIL_MS;
            if (usedIns) jailTime = Math.round(jailTime * 0.5); // Giảm 50% thời gian giam giữ
            let jailed = false;
            if (await policeJailEnabled(interaction.guildId)) {
                try { await interaction.member?.timeout?.(jailTime, 'Vi phạm luật trò may rủi'); jailed = true; } catch { /* bot thiếu quyền timeout */ }
            }
            desc += `\n\n🚨 **Công an ập tới!** Cậu bị phạt **${fmt(fine)}** ${config.CURRENCY}`
                + (usedIns ? ` (đã giảm 50% nhờ 🛡️ **Bảo hiểm Đường phố**)` : '')
                + (jailed ? ` và **tạm giam ${Math.round(jailTime / 60000)} phút**! 🚓` : '! 😱');
        }

        const afterBal = await db.getUser(userId);
        desc += `\n💵 Số dư ví: **${fmt(afterBal?.wallet || 0)}** ${config.CURRENCY}`;

        const embed = buildWaguriEmbed(interaction, win ? 'success' : 'error', {
            title: '🦀・Bầu Cua Tôm Cá',
            description: desc
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
