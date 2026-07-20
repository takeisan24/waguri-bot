const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed, getWaguriFooter } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const clanLevel = xp => Math.floor(Math.sqrt(Number(xp || 0) / 10000)) + 1;
// Cooldown tuyên chiến giờ lưu trên DB (clans.war_cd_until) — bền qua restart + shard-safe.
// (Trước đây là Map in-memory: restart là mất cooldown -> bypass; mỗi shard 1 bản.)
const clanPower = exps => exps.reduce((s, e) => s + getLevelFromExp(e) + 1, 0);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Bang hội 🏰 — lập bang, gia nhập, quỹ chung')
        .addSubcommand(s => s.setName('create').setDescription('Lập bang mới (tốn 50,000 VNĐ)')
            .addStringOption(o => o.setName('name').setDescription('Tên bang').setRequired(true).setMaxLength(30)))
        .addSubcommand(s => s.setName('join').setDescription('Gia nhập một bang')
            .addStringOption(o => o.setName('name').setDescription('Tên bang').setRequired(true)))
        .addSubcommand(s => s.setName('leave').setDescription('Rời bang'))
        .addSubcommand(s => s.setName('info').setDescription('Xem thông tin bang')
            .addStringOption(o => o.setName('name').setDescription('Tên bang (mặc định: bang của cậu)')))
        .addSubcommand(s => s.setName('list').setDescription('Bảng xếp hạng bang (theo quỹ)'))
        .addSubcommand(s => s.setName('deposit').setDescription('Góp tiền hoặc tài nguyên vào quỹ bang')
            .addIntegerOption(o => o.setName('amount').setDescription('Số lượng').setRequired(true).setMinValue(1))
            .addStringOption(o => o.setName('item').setDescription('Tài nguyên muốn góp (mặc định: xu)').setRequired(false)
                .addChoices(
                    { name: '🪵 Gỗ Tấm', value: 'tam_go' },
                    { name: '🪙 Thỏi Sắt', value: 'thoi_sat' }
                )))
        .addSubcommand(s => s.setName('withdraw').setDescription('Rút quỹ bang (chỉ trưởng bang)')
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('kick').setDescription('Đuổi thành viên (chỉ trưởng bang)')
            .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true)))
        .addSubcommand(s => s.setName('disband').setDescription('Giải tán bang (chỉ trưởng bang)'))
        .addSubcommand(s => s.setName('war').setDescription('Khai chiến với bang khác (chỉ trưởng bang)')
            .addStringOption(o => o.setName('clan').setDescription('Tên bang đối thủ').setRequired(true)))
        .addSubcommand(s => s.setName('shrine').setDescription('Xây dựng và nâng cấp Đền thờ bang hội để nhận buff EXP 🏛️')),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const me = interaction.user;
        const sub = interaction.options.getSubcommand();
        const C = config.CURRENCY;

        const replyEmbed = (type, titleKey, descKey, params = {}) => {
            const embed = buildWaguriEmbed(interaction, type, { 
                locale,
                title: t(locale, 'commands.clan.' + titleKey), 
                description: t(locale, 'commands.clan.' + descKey, params) 
            });
            return interaction.editReply({ embeds: [embed] });
        };

        if (sub === 'create') {
            const name = interaction.options.getString('name').trim();
            const r = await db.clanCreate(me.id, name);
            if (!r) return replyEmbed('error', 'create_title', 'error_generic');
            const msgKey = { in_clan: 'err_in_clan', name_taken: 'err_name_taken', poor: 'err_poor_create' }[r.status];
            if (msgKey) return replyEmbed('error', 'create_title', msgKey, { cost: fmt(config.CLAN.CREATE_COST, locale), currency: C });
            return replyEmbed('success', 'create_title', 'create_success', { name, cost: fmt(config.CLAN.CREATE_COST, locale), currency: C });
        }

        if (sub === 'join') {
            const name = interaction.options.getString('name').trim();
            const r = await db.clanJoin(me.id, name);
            if (!r) return replyEmbed('error', 'join_title', 'error_generic');
            const msgKey = { in_clan: 'err_in_clan_join', notfound: 'err_clan_not_found' }[r.status];
            if (msgKey) return replyEmbed('error', 'join_title', msgKey);
            return replyEmbed('success', 'join_title', 'join_success', { name: r.name });
        }

        if (sub === 'leave') {
            const r = await db.clanLeave(me.id);
            if (!r) return replyEmbed('error', 'leave_title', 'error_generic');
            const msgKey = { not_in: 'err_not_in_clan', is_leader: 'err_leave_leader' }[r.status];
            if (msgKey) return replyEmbed('error', 'leave_title', msgKey);
            return replyEmbed('success', 'leave_title', 'leave_success');
        }

        if (sub === 'deposit') {
            const amount = interaction.options.getInteger('amount');
            const itemId = interaction.options.getString('item');

            if (itemId) {
                const u = await db.getUser(me.id);
                if (!u?.clan_id) return replyEmbed('error', 'deposit_title', 'err_not_in_clan');

                const taken = await db.takeItem(me.id, itemId, amount);
                if (!taken) {
                    const embed = buildWaguriEmbed(interaction, 'error', {
                        locale,
                        title: t(locale, 'commands.clan.deposit_title'),
                        description: locale.startsWith('en') 
                            ? `You do not have enough items in inventory!`
                            : `Cậu không đủ vật phẩm trong kho đồ để đóng góp!`
                    });
                    return interaction.editReply({ embeds: [embed] });
                }

                const res = await db.clanDepositResource(u.clan_id, itemId, amount);
                if (!res) {
                    await db.giveItemAdmin(me.id, itemId, amount); // refund
                    return replyEmbed('error', 'deposit_title', 'error_generic');
                }

                const isEn = locale.startsWith('en');
                const itemName = itemId === 'tam_go' ? (isEn ? 'Wooden Planks' : 'Tấm Gỗ') : (isEn ? 'Iron Ingots' : 'Thỏi Sắt');
                const emoji = itemId === 'tam_go' ? '🪵' : '🪙';

                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.clan.deposit_title'),
                    description: isEn
                        ? `Successfully deposited **${amount}x ${emoji} ${itemName}** to Clan Bank! Total: ${res[itemId]} owned by Clan.`
                        : `Góp thành công **${amount}x ${emoji} ${itemName}** vào kho bang hội! Tổng số dư bang hội hiện có: ${res[itemId]}.`
                });
                return interaction.editReply({ embeds: [embed] });
            } else {
                const r = await db.clanDeposit(me.id, amount);
                if (!r) return replyEmbed('error', 'deposit_title', 'error_generic');
                if (r.status === 'not_in') return replyEmbed('error', 'deposit_title', 'err_not_in_clan');
                if (r.status === 'poor') return replyEmbed('error', 'deposit_title', 'err_poor_deposit');
                return replyEmbed('success', 'deposit_title', 'deposit_success', { amount: fmt(amount, locale), currency: C, bank: fmt(r.bank, locale) });
            }
        }

        if (sub === 'withdraw') {
            const amount = interaction.options.getInteger('amount');
            const r = await db.clanWithdraw(me.id, amount);
            if (!r) return replyEmbed('error', 'withdraw_title', 'error_generic');
            const msgKey = { not_in: 'err_not_in_clan', not_leader: 'err_not_leader', poor_clan: 'err_poor_clan' }[r.status];
            if (msgKey) return replyEmbed('error', 'withdraw_title', msgKey, { bank: fmt(r.bank, locale), currency: C });
            return replyEmbed('success', 'withdraw_title', 'withdraw_success', { amount: fmt(amount, locale), currency: C });
        }

        if (sub === 'kick') {
            const target = interaction.options.getUser('user');
            const r = await db.clanKick(me.id, target.id);
            if (!r) return replyEmbed('error', 'kick_title', 'error_generic');
            const msgKey = { not_in: 'err_not_in_clan', not_leader: 'err_not_leader', self: 'err_kick_self', not_member: 'err_kick_not_member' }[r.status];
            if (msgKey) return replyEmbed('error', 'kick_title', msgKey, { user: target.id });
            return replyEmbed('success', 'kick_title', 'kick_success', { user: target.id });
        }

        if (sub === 'disband') {
            const r = await db.clanDisband(me.id);
            if (!r) return replyEmbed('error', 'disband_title', 'error_generic');
            const msgKey = { not_in: 'err_not_in_clan', not_leader: 'err_not_leader' }[r.status];
            if (msgKey) return replyEmbed('error', 'disband_title', msgKey);
            const refundMsg = Number(r.refund) > 0 ? t(locale, 'commands.clan.disband_refund', { amount: fmt(r.refund, locale), currency: C }) : '';
            return replyEmbed('success', 'disband_title', 'disband_success', { refundMsg });
        }

        if (sub === 'list') {
            const clans = await db.clanList(15);
            if (!clans.length) return interaction.editReply(t(locale, 'commands.clan.no_clans'));
            const lines = clans.map((c, i) => {
                const rankEmoji = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
                return t(locale, 'commands.clan.list_line', { emoji: rankEmoji, name: c.name, level: clanLevel(c.xp), bank: fmt(c.bank, locale), currency: C, leader: c.leader_id });
            });
            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                locale,
                title: t(locale, 'commands.clan.list_title'),
                description: lines.join('\n')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'war') {
            const u = await db.getUser(me.id);
            if (!u?.clan_id) return replyEmbed('error', 'war_title', 'err_not_in_clan');
            const myClan = await db.clanById(u.clan_id);
            if (!myClan || myClan.leader_id !== me.id) return replyEmbed('error', 'war_title', 'err_not_leader');
            const cdUntil = myClan.war_cd_until ? new Date(myClan.war_cd_until).getTime() : 0;
            if (Date.now() < cdUntil) return replyEmbed('warning', 'war_title', 'err_war_cooldown', { time: `<t:${Math.floor(cdUntil / 1000)}:R>` });
            const foe = await db.clanByName(interaction.options.getString('clan').trim());
            if (!foe) return replyEmbed('error', 'war_title', 'err_foe_not_found');
            if (foe.id === myClan.id) return replyEmbed('error', 'war_title', 'err_war_self');
            const stake = Math.min(Number(myClan.bank), Number(foe.bank), config.CLAN.WAR_STAKE);
            if (stake <= 0) return replyEmbed('warning', 'war_title', 'err_war_no_stake', { cost: fmt(config.CLAN.WAR_STAKE, locale), currency: C });

            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.clan.war_declare_title'),
                description: t(locale, 'commands.clan.war_declare_desc', { attacker: myClan.name, defender: foe.name, cost: fmt(stake, locale), currency: C, leader: foe.leader_id })
            });
            const row = (dis = false) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('accept').setLabel(t(locale, 'commands.clan.btn_accept')).setStyle(ButtonStyle.Danger).setDisabled(dis),
                new ButtonBuilder().setCustomId('decline').setLabel(t(locale, 'commands.clan.btn_decline')).setStyle(ButtonStyle.Secondary).setDisabled(dis));
            const msg = await interaction.editReply({ content: `<@${foe.leader_id}>`, embeds: [embed], components: [row()] });
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
            let answered = false;
            collector.on('collect', async (i) => {
                if (i.user.id !== foe.leader_id) return i.reply({ content: t(locale, 'commands.clan.err_war_not_foe_leader'), flags: MessageFlags.Ephemeral });
                if (answered) return i.deferUpdate().catch(() => {}); // chống double-click
                answered = true;
                if (i.customId === 'decline') {
                    const decEmbed = buildWaguriEmbed(interaction, 'error', {
                        locale,
                        title: t(locale, 'commands.clan.war_decline_title'),
                        description: t(locale, 'commands.clan.war_decline_desc', { defender: foe.name })
                    });
                    await i.update({ embeds: [decEmbed], components: [] });
                    return collector.stop('done');
                }
                const [myExps, foeExps] = await Promise.all([db.clanMembersExp(myClan.id), db.clanMembersExp(foe.id)]);
                const pA = clanPower(myExps) * (0.8 + Math.random() * 0.4);
                const pB = clanPower(foeExps) * (0.8 + Math.random() * 0.4);
                const winner = pA >= pB ? myClan : foe;
                const loser = pA >= pB ? foe : myClan;
                const r = await db.clanWar(winner.id, loser.id, stake);
                const taken = r?.taken ?? 0;
                await db.setClanWarCooldown(myClan.id, Date.now() + 10 * 60000);
                const winEmbed = buildWaguriEmbed(interaction, 'jackpot', {
                    locale,
                    title: t(locale, 'commands.clan.war_result_title'),
                    description: t(locale, 'commands.clan.war_result_desc', {
                        attacker: myClan.name,
                        pA: Math.round(pA),
                        defender: foe.name,
                        pB: Math.round(pB),
                        winner: winner.name,
                        amount: fmt(taken, locale),
                        currency: C
                    })
                });
                await i.update({ embeds: [winEmbed], components: [] });
                collector.stop('done');
            });
            collector.on('end', async () => {
                if (!answered) {
                    const timeoutEmbed = buildWaguriEmbed(interaction, 'error', {
                        locale,
                        title: t(locale, 'commands.clan.war_timeout_title'),
                        description: t(locale, 'commands.clan.war_timeout_desc', { defender: foe.name })
                    });
                    await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                }
            });
            return;
        }

        if (sub === 'shrine') {
            const u = await db.getUser(me.id);
            if (!u?.clan_id) return replyEmbed('error', 'shrine_title', 'err_not_in_clan');
            const clan = await db.clanById(u.clan_id);
            if (!clan) return replyEmbed('error', 'shrine_title', 'err_clan_not_found_info');
            
            let upgrades = await db.getClanUpgrade(clan.id);
            const shrineLevel = upgrades ? upgrades.shrine_level : 0;
            
            const nextLevel = shrineLevel + 1;
            const reqGold = nextLevel * 20000;
            const reqWood = nextLevel * 50;
            const reqIron = nextLevel * 20;
            
            const isLeader = clan.leader_id === me.id;
            const isEn = locale.startsWith('en');
            
            const woodInBank = clan.resources?.tam_go || 0;
            const ironInBank = clan.resources?.thoi_sat || 0;
            
            const reqStatus = isEn
                ? `**Upgrade Cost (Level ${nextLevel}):**\n- 💵 Coins: ${fmt(reqGold, locale)} / ${fmt(clan.bank, locale)} in Clan Bank\n- 🪵 Wood: ${reqWood} / ${woodInBank} in Clan Bank\n- 🪙 Iron: ${reqIron} / ${ironInBank} in Clan Bank`
                : `**Chi phí nâng cấp (Cấp ${nextLevel}):**\n- 💵 Xu: ${fmt(reqGold, locale)} / ${fmt(clan.bank, locale)} trong quỹ bang\n- 🪵 Gỗ: ${reqWood} / ${woodInBank} trong quỹ bang\n- 🪙 Sắt: ${reqIron} / ${ironInBank} trong quỹ bang`;
            
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: isEn ? `🏛️ Clan Shrine — ${clan.name}` : `🏛️ Đền thờ Bang hội — ${clan.name}`,
                description: isEn 
                    ? `Welcome to the Clan Shrine! Upgrading the Shrine grants passive buffs to all members.\n\n**Current Buff:** +${shrineLevel * 2}% EXP gain from work.\n\n${reqStatus}`
                    : `Chào mừng tới Đền thờ Bang hội! Nâng cấp Đền thờ để nhận buff kinh nghiệm bị động cho tất cả thành viên.\n\n**Buff hiện tại:** +${shrineLevel * 2}% EXP khi làm việc.\n\n${reqStatus}`
            });
            
            if (isLeader) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('shrine:upgrade').setLabel(isEn ? 'Upgrade Shrine' : 'Nâng cấp Đền thờ').setStyle(ButtonStyle.Primary)
                );
                const msg = await interaction.editReply({ embeds: [embed], components: [row] });
                const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
                let answered = false;
                collector.on('collect', async (i) => {
                    if (i.user.id !== clan.leader_id) return i.reply({ content: isEn ? 'Only the leader can upgrade the shrine!' : 'Chỉ bang chủ mới có quyền nâng cấp đền thờ!', flags: MessageFlags.Ephemeral });
                    if (answered) return i.deferUpdate().catch(() => {});
                    answered = true;
                    
                    const r = await db.upgradeClanShrine(clan.id, reqGold, reqWood, reqIron);
                    if (r === 'ok') {
                        const successEmbed = buildWaguriEmbed(interaction, 'success', {
                            locale,
                            title: isEn ? 'Shrine Upgraded!' : 'Nâng cấp Đền thờ Thành công!',
                            description: isEn
                                ? `Congratulations! The Clan Shrine has been upgraded to **Level ${nextLevel}**! Active buff is now **+${nextLevel * 2}% EXP**.`
                                : `Chúc mừng! Đền thờ bang hội đã được nâng cấp lên **Cấp ${nextLevel}**! Buff EXP tăng lên **+${nextLevel * 2}%**.`
                        });
                        return i.update({ embeds: [successEmbed], components: [] });
                    } else if (r === 'insufficient_resources') {
                        return i.reply({ content: isEn ? 'Not enough resources in Clan Bank!' : 'Không đủ nguyên liệu hoặc xu trong kho bang hội!', flags: MessageFlags.Ephemeral });
                    } else {
                        return i.reply({ content: isEn ? 'An error occurred during upgrade.' : 'Lỗi hệ thống khi nâng cấp.', flags: MessageFlags.Ephemeral });
                    }
                });
            } else {
                await interaction.editReply({ embeds: [embed] });
            }
            return;
        }

        // info
        const name = interaction.options.getString('name');
        let clan;
        if (name) clan = await db.clanByName(name.trim());
        else { const u = await db.getUser(me.id); clan = u?.clan_id ? await db.clanById(u.clan_id) : null; }
        if (!clan) return replyEmbed('error', 'info_title_err', 'err_clan_not_found_info');

        const members = await db.clanMembers(clan.id);
        const memList = members.map(id => `${id === clan.leader_id ? '👑' : '▫️'} <@${id}>`).join('\n') || t(locale, 'common.empty');
        const embed = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.clan.info_title', { name: clan.name, level: clanLevel(clan.xp) }),
            fields: [
                { name: t(locale, 'commands.clan.info_leader'), value: `<@${clan.leader_id}>`, inline: true },
                { name: t(locale, 'commands.clan.info_bank'), value: `${fmt(clan.bank, locale)} ${C}`, inline: true },
                { name: t(locale, 'commands.clan.info_dividend'), value: t(locale, 'commands.clan.info_dividend_val', { amount: fmt(clanLevel(clan.xp) * 100, locale), currency: C }), inline: true },
                { name: t(locale, 'commands.clan.info_members', { count: members.length }), value: memList, inline: false },
            ]
        });
        const footerObj = getWaguriFooter(interaction.client);
        footerObj.text = t(locale, 'commands.clan.info_footer') + footerObj.text;
        embed.setFooter(footerObj);
        return interaction.editReply({ embeds: [embed] });
    },
};
