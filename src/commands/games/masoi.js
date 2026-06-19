const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { openLobby } = require('../../lib/lobby');
const { checkBet } = require('../../lib/bet');
const { ROLES, assignRoles, checkWin, resolveNight, tallyVotes } = require('../../lib/masoi/engine');

const fmt = n => Number(n).toLocaleString('vi-VN');
const EPH = MessageFlags.Ephemeral;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitEnd = collector => new Promise(r => collector.on('end', () => r()));

const NIGHT_MS = 50000, VOTE_MS = 45000, DISCUSS_MS = 30000, REVEAL_MS = 40000, MAX_ROUNDS = 20;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('masoi')
        .setDescription('Ma Sói 🐺 — trò chơi suy luận nhiều người (4-15 người)')
        .addIntegerOption(o => o.setName('bet').setDescription('Tiền cược mỗi người').setRequired(true).setMinValue(config.GAMBLE.MIN_BET)),
    async execute(interaction) {
        const bet = interaction.options.getInteger('bet');
        const err = checkBet(bet);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { description: `🌸 ${err}` });
            return interaction.reply({ embeds: [embed] });
        }

        const validate = async (userId) => {
            const u = await db.getUser(userId);
            return Number(u?.wallet || 0) >= bet ? null : `Cậu cần **${fmt(bet)}** ${config.CURRENCY} trong ví để chơi Ma Sói~ 😟`;
        };
        const players = await openLobby(interaction, {
            title: '🐺 Ma Sói',
            description: `Cược **${fmt(bet)}** ${config.CURRENCY}/người · cần **4-15** người. Phe thắng chia pot (nhà cái giữ ${Math.round(config.PARTY.HOUSE_CUT * 100)}%).`,
            minPlayers: 4, maxPlayers: 15, joinSeconds: config.PARTY.JOIN_SECONDS, validate,
        });
        if (!players) return;

        const staked = [];
        for (const p of players) { if (await db.addMoney(p.id, -bet, 'wallet')) staked.push(p); }
        if (staked.length < 4) {
            for (const p of staked) await db.addMoney(p.id, bet, 'wallet');
            const embed = buildWaguriEmbed(interaction, 'warning', { description: 'Không đủ người đủ tiền để chơi, đã hoàn cược~ 🌸' });
            return interaction.followUp({ embeds: [embed] });
        }

        const channel = interaction.channel;
        const roleMap = assignRoles(staked.map(p => p.id));
        const state = { players: {} };
        for (const p of staked) state.players[p.id] = { role: roleMap[p.id], alive: true, username: p.username };
        const pot = staked.length * bet;
        const ctx = { witchHeal: true, witchPoison: true, lastGuard: null };

        const name = id => state.players[id]?.username || 'Người chơi';
        const aliveIds = () => Object.keys(state.players).filter(id => state.players[id].alive);
        const aliveOptions = (exclude = []) => aliveIds().filter(id => !exclude.includes(id))
            .map(id => ({ label: name(id), value: id }));

        // Ephemeral select: hỏi 1 mục tiêu. Trả id hoặc null (timeout/không có mục tiêu).
        async function askSelect(i, placeholder, opts, time = 35000) {
            if (!opts.length) { await i.reply({ content: 'Không có mục tiêu hợp lệ~', flags: EPH }); return null; }
            const menu = new StringSelectMenuBuilder().setCustomId('ms_sel').setPlaceholder(placeholder).addOptions(opts.slice(0, 25));
            await i.reply({ content: placeholder, components: [new ActionRowBuilder().addComponents(menu)], flags: EPH });
            const rep = await i.fetchReply();
            try {
                const sel = await rep.awaitMessageComponent({ componentType: ComponentType.StringSelect, time });
                const lbl = opts.find(o => o.value === sel.values[0])?.label || '?';
                await sel.update({ content: `✅ Đã chọn **${lbl}**.`, components: [] });
                return sel.values[0];
            } catch { return null; }
        }

        // ----- Phase: xem vai -----
        await channel.send({ embeds: [buildWaguriEmbed(interaction, 'info', {
            title: '🐺・Ván Ma Sói bắt đầu!',
            description: `**${staked.length}** người chơi · pot **${fmt(pot)}** ${config.CURRENCY}.\nNhấn nút bên dưới để **xem vai bí mật** của mình nhé~`
        })] });

        const revealBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ms_reveal').setLabel('👁️ Xem vai của tôi').setStyle(ButtonStyle.Primary));
        const revealMsg = await channel.send({ content: `⏳ Xem vai trong ${REVEAL_MS / 1000}s...`, components: [revealBtn] });
        const rc = revealMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: REVEAL_MS });
        rc.on('collect', async (i) => {
            const me = state.players[i.user.id];
            if (!me) return i.reply({ content: 'Cậu không có trong ván này~', flags: EPH });
            const role = ROLES[me.role];
            let txt = `Vai của cậu: ${role.emoji} **${role.name}**\n${role.desc}`;
            if (me.role === 'werewolf') {
                const mates = Object.keys(state.players).filter(id => state.players[id].role === 'werewolf' && id !== i.user.id).map(name);
                txt += `\n\n🐺 Đồng bọn: ${mates.join(', ') || '(chỉ mình cậu)'}`;
            }
            return i.reply({ content: txt, flags: EPH });
        });
        await waitEnd(rc);
        await revealMsg.edit({ components: [] }).catch(() => {});

        // ----- Áp dụng cái chết + xử lý Thợ săn -----
        async function applyDeaths(ids, cause) {
            const queue = [...new Set(ids)];
            const announced = [];
            while (queue.length) {
                const id = queue.shift();
                const p = state.players[id];
                if (!p || !p.alive) continue;
                p.alive = false;
                announced.push(`${ROLES[p.role].emoji} <@${id}> — **${ROLES[p.role].name}**`);
                if (p.role === 'hunter') {
                    const shot = await hunterShot(id);
                    if (shot && state.players[shot]?.alive) queue.push(shot);
                }
            }
            const title = cause === 'night' ? '🌅 Trời sáng' : '⚖️ Kết quả bỏ phiếu';
            if (announced.length) {
                await channel.send({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: `Đã khuất:\n${announced.join('\n')}` })] });
            } else if (cause === 'night') {
                await channel.send({ embeds: [buildWaguriEmbed(interaction, 'success', { title, description: 'Đêm qua bình yên, không ai thiệt mạng! 🌸' })] });
            }
        }

        async function hunterShot(hunterId) {
            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ms_shoot').setLabel('🏹 Bắn theo').setStyle(ButtonStyle.Danger));
            const msg = await channel.send({ content: `<@${hunterId}> **Thợ săn** trúng tử — hãy chọn người bắn theo (30s)!`, components: [btn] });
            try {
                const i = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30000, filter: x => x.user.id === hunterId });
                const target = await askSelect(i, 'Bắn ai? 🏹', aliveOptions([hunterId]));
                await msg.edit({ components: [] }).catch(() => {});
                return target;
            } catch { await msg.edit({ components: [] }).catch(() => {}); return null; }
        }

        // ----- Phase: đêm -----
        async function nightPhase() {
            const actions = { wolfVotes: {}, guard: null, witchHeal: false, witchPoison: null };
            const acted = new Set();
            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ms_act').setLabel('🎭 Hành động đêm').setStyle(ButtonStyle.Primary));
            const msg = await channel.send({ embeds: [buildWaguriEmbed(interaction, 'info', {
                title: '🌙・Đêm xuống...',
                description: `Cả làng chìm vào giấc ngủ. Các vai đêm hãy nhấn **Hành động đêm** (riêng tư).\n⏰ ${NIGHT_MS / 1000}s.`
            }).setColor(0x2b2d31)], components: [btn] });
            const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: NIGHT_MS });
            col.on('collect', async (i) => {
                const me = state.players[i.user.id];
                if (!me || !me.alive) return i.reply({ content: 'Cậu không hành động đêm nay được~', flags: EPH });
                if (acted.has(i.user.id)) return i.reply({ content: 'Cậu đã hành động rồi nhé~', flags: EPH });
                try {
                    if (me.role === 'werewolf') {
                        const wolves = Object.keys(state.players).filter(id => state.players[id].role === 'werewolf');
                        const target = await askSelect(i, 'Chọn người để cắn 🐺', aliveOptions(wolves));
                        if (target) { actions.wolfVotes[i.user.id] = target; acted.add(i.user.id); }
                    } else if (me.role === 'seer') {
                        const target = await askSelect(i, 'Soi ai? 🔮', aliveOptions([i.user.id]));
                        if (target) { const isWolf = ROLES[state.players[target].role].team === 'wolves'; await i.followUp({ content: `🔮 **${name(target)}** ${isWolf ? 'LÀ Sói 🐺' : 'KHÔNG phải Sói ✅'}`, flags: EPH }); acted.add(i.user.id); }
                    } else if (me.role === 'guard') {
                        const target = await askSelect(i, 'Bảo vệ ai? 🛡️', aliveOptions([ctx.lastGuard].filter(Boolean)));
                        if (target) { actions.guard = target; ctx.lastGuard = target; acted.add(i.user.id); }
                    } else if (me.role === 'witch') {
                        await witchTurn(i, actions);
                        acted.add(i.user.id);
                    } else {
                        await i.reply({ content: 'Cậu ngủ ngon 😴 — không có hành động đêm.', flags: EPH });
                        acted.add(i.user.id);
                    }
                } catch (e) { /* timeout / lỗi nhỏ, bỏ qua */ }
            });
            await waitEnd(col);
            await msg.edit({ components: [] }).catch(() => {});
            return actions;
        }

        async function witchTurn(i, actions) {
            const row = new ActionRowBuilder();
            if (ctx.witchHeal) row.addComponents(new ButtonBuilder().setCustomId('w_heal').setLabel('🧪 Cứu nạn nhân đêm nay').setStyle(ButtonStyle.Success));
            if (ctx.witchPoison) row.addComponents(new ButtonBuilder().setCustomId('w_poison').setLabel('☠️ Đầu độc').setStyle(ButtonStyle.Danger));
            row.addComponents(new ButtonBuilder().setCustomId('w_skip').setLabel('Bỏ qua').setStyle(ButtonStyle.Secondary));
            await i.reply({ content: `🧙 Phù thủy — bình cứu: ${ctx.witchHeal ? 'còn' : 'hết'}, bình độc: ${ctx.witchPoison ? 'còn' : 'hết'}.`, components: [row], flags: EPH });
            const rep = await i.fetchReply();
            try {
                const b = await rep.awaitMessageComponent({ componentType: ComponentType.Button, time: 35000 });
                if (b.customId === 'w_heal') { actions.witchHeal = true; ctx.witchHeal = false; await b.update({ content: '🧪 Đã dùng bình cứu cho nạn nhân đêm nay.', components: [] }); }
                else if (b.customId === 'w_poison') {
                    const target = await askSelect(b, 'Đầu độc ai? ☠️', aliveOptions([i.user.id]));
                    if (target) { actions.witchPoison = target; ctx.witchPoison = false; }
                } else { await b.update({ content: 'Cậu quyết định không làm gì đêm nay.', components: [] }); }
            } catch { /* timeout */ }
        }

        // ----- Phase: bỏ phiếu ban ngày -----
        async function votePhase() {
            const votes = {};
            const menu = new StringSelectMenuBuilder().setCustomId('ms_vote').setPlaceholder('Bỏ phiếu treo cổ...').addOptions(aliveOptions().slice(0, 25));
            const msg = await channel.send({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                title: '🗳️・Bỏ phiếu treo cổ',
                description: `Người còn sống hãy chọn nghi phạm. ⏰ ${VOTE_MS / 1000}s.`
            })], components: [new ActionRowBuilder().addComponents(menu)] });
            const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: VOTE_MS });
            col.on('collect', async (i) => {
                if (!state.players[i.user.id]?.alive) return i.reply({ content: 'Người đã khuất không bỏ phiếu được~', flags: EPH });
                votes[i.user.id] = i.values[0];
                return i.reply({ content: `✅ Cậu đã bỏ phiếu treo **${name(i.values[0])}**.`, flags: EPH });
            });
            await waitEnd(col);
            await msg.edit({ components: [] }).catch(() => {});
            return tallyVotes(votes);
        }

        // ----- Vòng lặp chính -----
        let winner = null, round = 0;
        try {
            while (!winner && round < MAX_ROUNDS) {
                round++;
                const actions = await nightPhase();
                const { deaths } = resolveNight(actions);
                await applyDeaths(deaths, 'night');
                winner = checkWin(state.players);
                if (winner) break;

                await channel.send({ embeds: [buildWaguriEmbed(interaction, 'info', {
                    title: `☀️・Ngày ${round} — Thảo luận`,
                    description: `Còn sống: ${aliveIds().map(id => `<@${id}>`).join(', ')}\n💬 Thảo luận **${DISCUSS_MS / 1000}s** rồi bỏ phiếu.`
                })] });
                await sleep(DISCUSS_MS);

                const lynched = await votePhase();
                if (lynched) await applyDeaths([lynched], 'vote');
                else await channel.send('🤝 Dân làng không thống nhất — không ai bị treo cổ.');
                winner = checkWin(state.players);
            }
        } catch (e) {
            console.error('[MASOI ERROR]', e);
        }

        // ----- Kết thúc & chia thưởng -----
        const team = winner || (checkWin(state.players));
        const allRoles = Object.keys(state.players)
            .map(id => `${ROLES[state.players[id].role].emoji} <@${id}> — ${ROLES[state.players[id].role].name}${state.players[id].alive ? '' : ' 💀'}`).join('\n');

        if (!team) {
            // hết vòng / lỗi -> hoàn cược
            for (const p of staked) await db.addMoney(p.id, bet, 'wallet');
            const drawEmbed = buildWaguriEmbed(interaction, 'warning', {
                title: '🐺・Ván Ma Sói kết thúc bất phân thắng bại',
                description: `Đã hoàn cược cho mọi người.\n\n${allRoles}`
            });
            return channel.send({ embeds: [drawEmbed] });
        }

        const winIds = Object.keys(state.players).filter(id => ROLES[state.players[id].role].team === team);
        const aliveWin = winIds.filter(id => state.players[id].alive);
        const payees = aliveWin.length ? aliveWin : winIds;
        const prize = Math.floor(pot * (1 - config.PARTY.HOUSE_CUT));
        const share = Math.floor(prize / payees.length);
        for (const id of payees) { await db.addMoney(id, share, 'wallet'); db.questIncr(id, 'gamble_win', 1); }

        const winType = team === 'wolves' ? 'error' : 'success';
        const winEmbed = buildWaguriEmbed(interaction, winType, {
            title: team === 'wolves' ? '🐺・BẦY SÓI THẮNG!' : '🎉・DÂN LÀNG THẮNG!',
            description: `${allRoles}\n\n🏆 ${payees.map(id => `<@${id}>`).join(', ')} chia nhau **${fmt(share)}** ${config.CURRENCY} mỗi người!`
        });
        winEmbed.setFooter({
            text: `Pot ${fmt(pot)} · nhà cái giữ ${Math.round(config.PARTY.HOUSE_CUT * 100)}% • ${winEmbed.data.footer.text}`,
            iconURL: winEmbed.data.footer.icon_url
        });
        await channel.send({ embeds: [winEmbed] });
    },
};
