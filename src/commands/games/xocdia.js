const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { checkBet } = require('../../lib/bet');

const fmt = n => Number(n).toLocaleString('vi-VN');
const MULT = config.GAMBLE.COINFLIP_MULT; // chẵn/lẻ ~50/50 như tung xu
const WINDOW_MS = 30000;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xocdia')
        .setDescription('Xóc Đĩa 🥢 — nhiều người đặt Chẵn/Lẻ cùng lúc, 1 lần xóc')
        .addIntegerOption(o => o.setName('bet').setDescription('Mức cược (mọi người cược bằng nhau)').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        const bet = interaction.options.getInteger('bet');
        const err = checkBet(bet);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { description: `🌸 ${err}` });
            return interaction.reply({ embeds: [embed] });
        }

        const bets = new Map(); // userId -> { side, username }
        const counts = () => {
            const chan = [...bets.values()].filter(b => b.side === 'chan').length;
            const le = [...bets.values()].filter(b => b.side === 'le').length;
            return { chan, le };
        };
        const render = () => {
            const c = counts();
            return buildWaguriEmbed(interaction, 'info', {
                title: '🥢・Xóc Đĩa — Đặt cược!',
                description: `Cược **${fmt(bet)}** ${config.CURRENCY}/người. Thắng nhận **x${MULT}**.\n` +
                    `🔴 **Chẵn** (0/2/4 đỏ): ${c.chan} người\n⚪ **Lẻ** (1/3 đỏ): ${c.le} người\n\n⏰ Chốt sau ${WINDOW_MS / 1000}s.`
            });
        };
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('chan').setLabel('Chẵn').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
            new ButtonBuilder().setCustomId('le').setLabel('Lẻ').setStyle(ButtonStyle.Secondary).setEmoji('⚪'),
        );

        await interaction.reply({ embeds: [render()], components: [row] });
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: WINDOW_MS });

        collector.on('collect', async (i) => {
            if (bets.has(i.user.id)) return i.reply({ content: `Cậu đã đặt **${bets.get(i.user.id).side === 'chan' ? 'Chẵn' : 'Lẻ'}** rồi nhé~`, flags: MessageFlags.Ephemeral });
            if (!await db.addMoney(i.user.id, -bet, 'wallet')) return i.reply({ content: `Cậu không đủ **${fmt(bet)}** ${config.CURRENCY} để cược~ 😟`, flags: MessageFlags.Ephemeral });
            bets.set(i.user.id, { side: i.customId, username: i.user.username });
            await i.reply({ content: `✅ Cậu đặt **${i.customId === 'chan' ? 'Chẵn 🔴' : 'Lẻ ⚪'}** (${fmt(bet)} ${config.CURRENCY}).`, flags: MessageFlags.Ephemeral });
            await interaction.editReply({ embeds: [render()], components: [row] }).catch(() => {});
        });

        collector.on('end', async () => {
            if (bets.size === 0) {
                return interaction.editReply({ embeds: [render().setColor(config.COLORS.WARNING).setTitle('🥢 Xóc Đĩa — không ai cược~')], components: [] }).catch(() => {});
            }
            const coins = [0, 0, 0, 0].map(() => Math.random() < 0.5 ? 1 : 0); // 1 = đỏ
            const reds = coins.reduce((s, c) => s + c, 0);
            const result = reds % 2 === 0 ? 'chan' : 'le';
            const faces = coins.map(c => c ? '🔴' : '⚪').join(' ');

            const wins = [], loses = [];
            for (const [id, b] of bets) {
                if (b.side === result) { const payout = Math.round(bet * MULT); await db.addMoney(id, payout, 'wallet'); db.questIncr(id, 'gamble_win', 1); wins.push(`<@${id}> (+${fmt(payout - bet)})`); }
                else loses.push(`<@${id}> (-${fmt(bet)})`);
            }
            const embedResult = buildWaguriEmbed(interaction, 'jackpot', {
                title: '🥢・Kết quả Xóc Đĩa',
                description: `Đĩa mở: ${faces} → **${reds} đỏ** → **${result === 'chan' ? 'CHẴN 🔴' : 'LẺ ⚪'}**!\n\n` +
                    `🏆 Thắng: ${wins.join(', ') || '*(không ai)*'}\n💸 Thua: ${loses.join(', ') || '*(không ai)*'}`
            });
            await interaction.editReply({ embeds: [embedResult], components: [] }).catch(() => {});
        });
    },
};
