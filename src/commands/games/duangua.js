const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { checkBet } = require('../../lib/bet');

const fmt = n => Number(n).toLocaleString('vi-VN');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const HORSES = [
    { n: 1, c: '🟥' }, { n: 2, c: '🟦' }, { n: 3, c: '🟩' }, { n: 4, c: '🟨' }, { n: 5, c: '🟪' },
];
const FINISH = 12;
const WINDOW_MS = 30000;
const WIN_MULT = Math.round(HORSES.length * (1 - config.PARTY.HOUSE_CUT) * 100) / 100; // ~4.75x

module.exports = {
    data: new SlashCommandBuilder()
        .setName('duangua')
        .setDescription('Đua ngựa 🐎 — đặt cửa 1 con, thắng nhân x' + WIN_MULT)
        .addIntegerOption(o => o.setName('bet').setDescription('Mức cược (mọi người cược bằng nhau)').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        const bet = interaction.options.getInteger('bet');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { description: `🌸 ${err}` });
            return interaction.reply({ embeds: [embed] });
        }

        const bets = new Map(); // userId -> { horse, username }
        const render = () => {
            const counts = HORSES.map((h, i) => `${h.c} **Ngựa ${h.n}**: ${[...bets.values()].filter(b => b.horse === i).length} người`).join('\n');
            return buildWaguriEmbed(interaction, 'info', {
                title: '🐎・Đua Ngựa — Đặt cửa!',
                description: `Cược **${fmt(bet)}** ${config.CURRENCY}/người, thắng nhận **x${WIN_MULT}**.\nChọn con cậu tin tưởng:\n\n${counts}\n\n⏰ Xuất phát sau ${WINDOW_MS / 1000}s.`
            });
        };
        const row = new ActionRowBuilder().addComponents(
            HORSES.map(h => new ButtonBuilder().setCustomId(`h${h.n}`).setLabel(`Ngựa ${h.n}`).setEmoji(h.c).setStyle(ButtonStyle.Secondary)));

        await interaction.reply({ embeds: [render()], components: [row] });
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: WINDOW_MS });

        collector.on('collect', async (i) => {
            if (bets.has(i.user.id)) return i.reply({ content: `Cậu đã đặt **Ngựa ${bets.get(i.user.id).horse + 1}** rồi nhé~`, flags: MessageFlags.Ephemeral });
            if (!await db.addMoney(i.user.id, -bet, 'wallet')) return i.reply({ content: `Cậu không đủ **${fmt(bet)}** ${config.CURRENCY} để cược~ 😟`, flags: MessageFlags.Ephemeral });
            const horse = Number(i.customId.slice(1)) - 1;
            bets.set(i.user.id, { horse, username: i.user.username });
            await i.reply({ content: `✅ Cậu đặt **Ngựa ${horse + 1}** ${HORSES[horse].c} (${fmt(bet)} ${config.CURRENCY}).`, flags: MessageFlags.Ephemeral });
            await interaction.editReply({ embeds: [render()], components: [row] }).catch(() => {});
        });

        collector.on('end', async () => {
            if (bets.size === 0) {
                return interaction.editReply({ embeds: [render().setColor(config.COLORS.WARNING).setTitle('🐎 Đua Ngựa — không ai cược~')], components: [] }).catch(() => {});
            }
            const pos = HORSES.map(() => 0);
            const lanes = () => HORSES.map((h, i) => `${h.c}\`${'─'.repeat(Math.min(pos[i], FINISH))}🐎${'─'.repeat(Math.max(0, FINISH - pos[i]))}\`🏁`).join('\n');
            // footer cố định khi đang đua (tránh quote đổi mỗi frame gây nhấp nháy)
            const raceEmbed = (title) => buildWaguriEmbed(interaction, 'jackpot', {
                title: title,
                description: lanes()
            }).setFooter({ text: '🐎 Đua Ngựa • Waguri' });

            await interaction.editReply({ embeds: [raceEmbed('🐎 Xuất phát!')], components: [] }).catch(() => {});
            let winner = null;
            while (winner === null) {
                await sleep(1500);
                for (let i = 0; i < HORSES.length; i++) pos[i] += Math.floor(Math.random() * 3) + 1;
                const done = pos.map((p, i) => ({ p, i })).filter(x => x.p >= FINISH);
                if (done.length) {
                    const max = Math.max(...done.map(x => x.p));
                    const tied = done.filter(x => x.p === max);
                    winner = tied[Math.floor(Math.random() * tied.length)].i;
                }
                await interaction.editReply({ embeds: [raceEmbed(winner === null ? '🐎 Đang đua...' : '🏁 Về đích!')] }).catch(() => {});
            }

            const wins = [], loses = [];
            for (const [id, b] of bets) {
                if (b.horse === winner) { const payout = Math.round(bet * WIN_MULT); await db.addMoney(id, payout, 'wallet'); db.questIncr(id, 'gamble_win', 1); wins.push(`<@${id}> (+${fmt(payout - bet)})`); }
                else loses.push(`<@${id}>`);
            }
            const winEmbed = buildWaguriEmbed(interaction, 'jackpot', {
                title: `🏆・Ngựa ${winner + 1} ${HORSES[winner].c} về nhất!`,
                description: `🎉 Thắng: ${wins.join(', ') || '*(không ai)*'}\n😢 Thua: ${loses.join(', ') || '*(không ai)*'}`
            });
            await interaction.followUp({ embeds: [winEmbed] }).catch(() => {});
        });
    },
};
