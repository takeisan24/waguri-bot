const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { openLobby } = require('../../lib/lobby');
const { checkBet } = require('../../lib/bet');
const { ROLES, assignRoles, checkWin, resolveNight, tallyVotes } = require('../../lib/masoi/engine');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { randomUUID } = require('node:crypto');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
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
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const bet = interaction.options.getInteger('bet');
        const err = await checkBet(bet, interaction.guildId);
        if (err) {
            const embed = buildWaguriEmbed(interaction, 'warning', { locale, description: `🌸 ${err}` });
            return interaction.editReply({ embeds: [embed] });
        }

        const validate = async (userId) => {
            const u = await db.getUser(userId);
            return Number(u?.wallet || 0) >= bet ? null : t(locale, 'commands.masoi.err_poor', { cost: fmt(bet, locale), currency: config.CURRENCY });
        };
        const players = await openLobby(interaction, {
            title: t(locale, 'commands.masoi.lobby_title'),
            description: t(locale, 'commands.masoi.lobby_desc', { cost: fmt(bet, locale), currency: config.CURRENCY, cut: Math.round(config.PARTY.HOUSE_CUT * 100) }),
            minPlayers: 4, maxPlayers: 15, joinSeconds: config.PARTY.JOIN_SECONDS, validate,
        });
        if (!players) return;

        // Thu cược qua DB
        const sessionId = randomUUID();
        const staked = [];
        for (const p of players) { if (await db.stakeCollect(sessionId, 'masoi', interaction.channelId, p.id, bet)) staked.push(p); }
        if (staked.length < 4) {
            await db.stakeRefundSession(sessionId);
            const embed = buildWaguriEmbed(interaction, 'warning', { locale, description: t(locale, 'commands.masoi.err_refund') });
            return interaction.followUp({ embeds: [embed] });
        }

        let stakesResolved = false; // đảm bảo cược luôn được settle/refund dù lỗi ở BẤT KỲ phase nào
        try {
        const channel = interaction.channel;
        const roleMap = assignRoles(staked.map(p => p.id));
        const state = { players: {} };
        for (const p of staked) state.players[p.id] = { role: roleMap[p.id], alive: true, username: p.username };
        const pot = staked.length * bet;
        const ctx = { witchHeal: true, witchPoison: true, lastGuard: null };

        const name = id => state.players[id]?.username || 'Player';
        const aliveIds = () => Object.keys(state.players).filter(id => state.players[id].alive);
        const aliveOptions = (exclude = []) => aliveIds().filter(id => !exclude.includes(id))
            .map(id => ({ label: name(id), value: id }));

        const getRoleName = roleId => t(locale, `commands.masoi.roles.${roleId}.name`) || ROLES[roleId].name;
        const getRoleDesc = roleId => t(locale, `commands.masoi.roles.${roleId}.desc`) || ROLES[roleId].desc;

        // Ephemeral select
        async function askSelect(i, placeholder, opts, time = 35000) {
            if (!opts.length) { await i.reply({ content: t(locale, 'commands.masoi.err_no_targets'), flags: EPH }); return null; }
            const menu = new StringSelectMenuBuilder().setCustomId('ms_sel').setPlaceholder(placeholder).addOptions(opts.slice(0, 25));
            await i.reply({ content: placeholder, components: [new ActionRowBuilder().addComponents(menu)], flags: EPH });
            const rep = await i.fetchReply();
            try {
                const sel = await rep.awaitMessageComponent({ componentType: ComponentType.StringSelect, time });
                const lbl = opts.find(o => o.value === sel.values[0])?.label || '?';
                await sel.update({ content: t(locale, 'commands.masoi.selected', { name: lbl }), components: [] });
                return sel.values[0];
            } catch { return null; }
        }

        // ----- Phase: xem vai -----
        await channel.send({ embeds: [buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.masoi.start_title'),
            description: t(locale, 'commands.masoi.start_desc', { count: staked.length, cost: fmt(pot, locale), currency: config.CURRENCY })
        })] });

        const revealBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ms_reveal').setLabel(t(locale, 'commands.masoi.btn_reveal')).setStyle(ButtonStyle.Primary));
        const revealMsg = await channel.send({ content: t(locale, 'commands.masoi.reveal_timer', { time: REVEAL_MS / 1000 }), components: [revealBtn] });
        const rc = revealMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: REVEAL_MS });
        rc.on('collect', async (i) => {
            const me = state.players[i.user.id];
            if (!me) return i.reply({ content: t(locale, 'commands.masoi.err_not_in_game'), flags: EPH });
            const role = ROLES[me.role];
            let txt = t(locale, 'commands.masoi.your_role', { emoji: role.emoji, name: getRoleName(me.role), desc: getRoleDesc(me.role) });
            if (me.role === 'werewolf') {
                const mates = Object.keys(state.players).filter(id => state.players[id].role === 'werewolf' && id !== i.user.id).map(name);
                txt += '\n\n' + t(locale, 'commands.masoi.team_wolves', { mates: mates.join(', ') || t(locale, 'commands.masoi.solo_wolf') });
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
                announced.push(`${ROLES[p.role].emoji} <@${id}> — **${getRoleName(p.role)}**`);
                // Thợ săn được bắn theo 1 người KHI CHẾT — bất kể chết đêm hay bị treo cổ
                // (đúng mô tả vai). Trước đây loại trừ 'vote' khiến kỹ năng im lặng ở kiểu
                // chết phổ biến nhất, đọc như vai bị hỏng.
                if (p.role === 'hunter') {
                    const shot = await hunterShot(id);
                    if (shot && state.players[shot]?.alive) queue.push(shot);
                }
            }
            const title = cause === 'night' ? t(locale, 'commands.masoi.day_title') : t(locale, 'commands.masoi.vote_title');
            if (announced.length) {
                await channel.send({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title, description: t(locale, 'commands.masoi.deaths_announced', { deaths: announced.join('\n') }) })] });
            } else if (cause === 'night') {
                await channel.send({ embeds: [buildWaguriEmbed(interaction, 'success', { locale, title, description: t(locale, 'commands.masoi.no_deaths') })] });
            }
        }

        async function hunterShot(hunterId) {
            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ms_shoot').setLabel(t(locale, 'commands.masoi.btn_shoot')).setStyle(ButtonStyle.Danger));
            const msg = await channel.send({ content: t(locale, 'commands.masoi.hunter_message', { hunter: hunterId }), components: [btn] });
            try {
                const i = await msg.awaitMessageComponent({ componentType: ComponentType.Button, time: 30000, filter: x => x.user.id === hunterId });
                const target = await askSelect(i, t(locale, 'commands.masoi.ask_shoot'), aliveOptions([hunterId]));
                await msg.edit({ components: [] }).catch(() => {});
                return target;
            } catch { await msg.edit({ components: [] }).catch(() => {}); return null; }
        }

        // ----- Phase: đêm -----
        async function nightPhase() {
            const actions = { wolfVotes: {}, guard: null, witchHeal: false, witchPoison: null };
            const acted = new Set();
            const btn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ms_act').setLabel(t(locale, 'commands.masoi.btn_act')).setStyle(ButtonStyle.Primary));
            const msg = await channel.send({ embeds: [buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.masoi.night_title'),
                description: t(locale, 'commands.masoi.night_desc', { time: NIGHT_MS / 1000 })
            }).setColor(0x2b2d31)], components: [btn] });
            const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: NIGHT_MS });
            col.on('collect', async (i) => {
                const me = state.players[i.user.id];
                if (!me || !me.alive) return i.reply({ content: t(locale, 'commands.masoi.err_cannot_act'), flags: EPH });
                if (acted.has(i.user.id)) return i.reply({ content: t(locale, 'commands.masoi.err_already_acted'), flags: EPH });
                try {
                    if (me.role === 'werewolf') {
                        const wolves = Object.keys(state.players).filter(id => state.players[id].role === 'werewolf');
                        const target = await askSelect(i, t(locale, 'commands.masoi.ask_bite'), aliveOptions(wolves));
                        if (target) { actions.wolfVotes[i.user.id] = target; acted.add(i.user.id); }
                    } else if (me.role === 'seer') {
                        const target = await askSelect(i, t(locale, 'commands.masoi.ask_seer'), aliveOptions([i.user.id]));
                        if (target) {
                            const isWolf = ROLES[state.players[target].role].team === 'wolves';
                            const resKey = isWolf ? 'commands.masoi.seer_result_yes' : 'commands.masoi.seer_result_no';
                            await i.followUp({ content: t(locale, resKey, { name: name(target) }), flags: EPH });
                            acted.add(i.user.id);
                        }
                    } else if (me.role === 'guard') {
                        const target = await askSelect(i, t(locale, 'commands.masoi.ask_guard'), aliveOptions([ctx.lastGuard].filter(Boolean)));
                        if (target) { actions.guard = target; ctx.lastGuard = target; acted.add(i.user.id); }
                    } else if (me.role === 'witch') {
                        await witchTurn(i, actions);
                        acted.add(i.user.id);
                    } else {
                        await i.reply({ content: t(locale, 'commands.masoi.night_sleep'), flags: EPH });
                        acted.add(i.user.id);
                    }
                } catch (e) { /* ignore */ }
            });
            await waitEnd(col);
            await msg.edit({ components: [] }).catch(() => {});
            return actions;
        }

        async function witchTurn(i, actions) {
            const row = new ActionRowBuilder();
            if (ctx.witchHeal) row.addComponents(new ButtonBuilder().setCustomId('w_heal').setLabel(t(locale, 'commands.masoi.btn_heal')).setStyle(ButtonStyle.Success));
            if (ctx.witchPoison) row.addComponents(new ButtonBuilder().setCustomId('w_poison').setLabel(t(locale, 'commands.masoi.btn_poison')).setStyle(ButtonStyle.Danger));
            row.addComponents(new ButtonBuilder().setCustomId('w_skip').setLabel(t(locale, 'commands.masoi.btn_skip')).setStyle(ButtonStyle.Secondary));
            await i.reply({ content: t(locale, 'commands.masoi.witch_message', { healStatus: ctx.witchHeal ? t(locale, 'commands.masoi.status_yes') : t(locale, 'commands.masoi.status_no'), poisonStatus: ctx.witchPoison ? t(locale, 'commands.masoi.status_yes') : t(locale, 'commands.masoi.status_no') }), components: [row], flags: EPH });
            const rep = await i.fetchReply();
            try {
                const b = await rep.awaitMessageComponent({ componentType: ComponentType.Button, time: 35000 });
                if (b.customId === 'w_heal') { actions.witchHeal = true; ctx.witchHeal = false; await b.update({ content: t(locale, 'commands.masoi.witch_healed'), components: [] }); }
                else if (b.customId === 'w_poison') {
                    const target = await askSelect(b, t(locale, 'commands.masoi.ask_poison'), aliveOptions([i.user.id]));
                    if (target) { actions.witchPoison = target; ctx.witchPoison = false; }
                } else { await b.update({ content: t(locale, 'commands.masoi.witch_skipped'), components: [] }); }
            } catch { /* timeout */ }
        }

        // ----- Phase: bỏ phiếu ban ngày -----
        async function votePhase() {
            const votes = {};
            const menu = new StringSelectMenuBuilder().setCustomId('ms_vote').setPlaceholder(t(locale, 'commands.masoi.vote_placeholder')).addOptions(aliveOptions().slice(0, 25));
            const msg = await channel.send({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.masoi.vote_title'),
                description: t(locale, 'commands.masoi.vote_desc', { time: VOTE_MS / 1000 })
            })], components: [new ActionRowBuilder().addComponents(menu)] });
            const col = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: VOTE_MS });
            col.on('collect', async (i) => {
                if (!state.players[i.user.id]?.alive) return i.reply({ content: t(locale, 'commands.masoi.err_dead_vote'), flags: EPH });
                votes[i.user.id] = i.values[0];
                return i.reply({ content: t(locale, 'commands.masoi.voted', { name: name(i.values[0]) }), flags: EPH });
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
                    locale,
                    title: t(locale, 'commands.masoi.day_discuss_title', { round }),
                    description: t(locale, 'commands.masoi.day_discuss_desc', { alive: aliveIds().map(id => `<@${id}>`).join(', '), time: DISCUSS_MS / 1000 })
                })] });
                await sleep(DISCUSS_MS);

                const lynched = await votePhase();
                if (lynched) await applyDeaths([lynched], 'vote');
                else await channel.send(t(locale, 'commands.masoi.vote_no_agreement'));
                winner = checkWin(state.players);
            }
        } catch (e) {
            console.error('[MASOI ERROR]', e);
        }

        // ----- Kết thúc & chia thưởng -----
        const team = winner || (checkWin(state.players));
        const allRoles = Object.keys(state.players)
            .map(id => `${ROLES[state.players[id].role].emoji} <@${id}> — ${getRoleName(state.players[id].role)}${state.players[id].alive ? '' : ' 💀'}`).join('\n');

        if (!team) {
            await db.stakeRefundSession(sessionId);
            stakesResolved = true;
            const drawEmbed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.masoi.end_draw_title'),
                description: t(locale, 'commands.masoi.end_draw_desc', { roles: allRoles })
            });
            return channel.send({ embeds: [drawEmbed] });
        }

        const winIds = Object.keys(state.players).filter(id => ROLES[state.players[id].role].team === team);
        const aliveWin = winIds.filter(id => state.players[id].alive);
        const payees = aliveWin.length ? aliveWin : winIds;
        const prize = Math.floor(pot * (1 - config.PARTY.HOUSE_CUT));
        const share = Math.floor(prize / payees.length);
        for (const id of payees) { await db.addMoney(id, share, 'wallet'); db.questIncr(id, 'gamble_win', 1); }
        await db.stakeSettle(sessionId);
        stakesResolved = true;

        const winType = team === 'wolves' ? 'error' : 'success';
        const winEmbed = buildWaguriEmbed(interaction, winType, {
            locale,
            title: team === 'wolves' ? t(locale, 'commands.masoi.end_wolves_win') : t(locale, 'commands.masoi.end_village_win'),
            description: t(locale, 'commands.masoi.end_win_desc', { roles: allRoles, winners: payees.map(id => `<@${id}>`).join(', '), share: fmt(share, locale), currency: config.CURRENCY })
        });
        winEmbed.setFooter({
            text: t(locale, 'commands.masoi.end_footer', { pot: fmt(pot, locale), cut: Math.round(config.PARTY.HOUSE_CUT * 100) }) + ' • ' + winEmbed.data.footer.text,
            iconURL: winEmbed.data.footer.icon_url
        });
        await channel.send({ embeds: [winEmbed] });
        } catch (err) {
            console.error('[MASOI FATAL]', err);
        } finally {
            // Lưới an toàn: nếu vì lỗi mà chưa settle/refund thì hoàn cược cho mọi người (chống kẹt tiền tới restart).
            if (!stakesResolved) await db.stakeRefundSession(sessionId).catch(() => {});
        }
    },
};
