const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed, getWaguriFooter } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');

const fmt = n => Number(n).toLocaleString('vi-VN');
const clanLevel = xp => Math.floor(Math.sqrt(Number(xp || 0) / 10000)) + 1;
const warCooldown = new Map(); // clanId -> hết cooldown (ms)
const clanPower = exps => exps.reduce((s, e) => s + getLevelFromExp(e) + 1, 0);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Bang hội 🏰 — lập bang, gia nhập, quỹ chung')
        .addSubcommand(s => s.setName('create').setDescription(`Lập bang mới (tốn ${50000} VNĐ)`)
            .addStringOption(o => o.setName('name').setDescription('Tên bang').setRequired(true).setMaxLength(30)))
        .addSubcommand(s => s.setName('join').setDescription('Gia nhập một bang')
            .addStringOption(o => o.setName('name').setDescription('Tên bang').setRequired(true)))
        .addSubcommand(s => s.setName('leave').setDescription('Rời bang'))
        .addSubcommand(s => s.setName('info').setDescription('Xem thông tin bang')
            .addStringOption(o => o.setName('name').setDescription('Tên bang (mặc định: bang của cậu)')))
        .addSubcommand(s => s.setName('list').setDescription('Bảng xếp hạng bang (theo quỹ)'))
        .addSubcommand(s => s.setName('deposit').setDescription('Góp tiền vào quỹ bang')
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('withdraw').setDescription('Rút quỹ bang (chỉ trưởng bang)')
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('kick').setDescription('Đuổi thành viên (chỉ trưởng bang)')
            .addUserOption(o => o.setName('user').setDescription('Thành viên').setRequired(true)))
        .addSubcommand(s => s.setName('disband').setDescription('Giải tán bang (chỉ trưởng bang)'))
        .addSubcommand(s => s.setName('war').setDescription('Khai chiến với bang khác (chỉ trưởng bang)')
            .addStringOption(o => o.setName('clan').setDescription('Tên bang đối thủ').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply();
        const me = interaction.user;
        const sub = interaction.options.getSubcommand();
        const C = config.CURRENCY;

        const replyEmbed = (type, title, desc) => {
            const embed = buildWaguriEmbed(interaction, type, { title, description: desc });
            return interaction.editReply({ embeds: [embed] });
        };

        if (sub === 'create') {
            const name = interaction.options.getString('name').trim();
            const r = await db.clanCreate(me.id, name);
            if (!r) return replyEmbed('error', '🏰・Lập Bang Hội', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            const msg = { in_clan: 'Cậu đang ở trong một bang rồi~ Rời bang trước đã nhé.', name_taken: 'Tên bang này đã có người dùng rồi~', poor: `Cần **${fmt(config.CLAN.CREATE_COST)}** ${C} để lập bang mà ví chưa đủ~ 😟` }[r.status];
            if (msg) return replyEmbed('error', '🏰・Lập Bang Hội', msg);
            return replyEmbed('success', '🏰・Lập Bang Hội', `Chúc mừng! Cậu đã lập bang **${name}** (phí ${fmt(config.CLAN.CREATE_COST)} ${C}).\nRủ bạn bè dùng \`/clan join ${name}\` nhé~`);
        }

        if (sub === 'join') {
            const name = interaction.options.getString('name').trim();
            const r = await db.clanJoin(me.id, name);
            if (!r) return replyEmbed('error', '🏰・Gia nhập Bang', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            const msg = { in_clan: 'Cậu đang ở trong một bang rồi~', notfound: 'Không tìm thấy bang này~' }[r.status];
            if (msg) return replyEmbed('error', '🏰・Gia nhập Bang', msg);
            return replyEmbed('success', '🏰・Gia nhập Bang', `Cậu đã gia nhập bang **${r.name}**! Chào mừng tân binh~ 🎉`);
        }

        if (sub === 'leave') {
            const r = await db.clanLeave(me.id);
            if (!r) return replyEmbed('error', '🏰・Rời Bang', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            const msg = { not_in: 'Cậu đâu có ở bang nào~', is_leader: 'Cậu là trưởng bang — phải `/clan disband` hoặc chuyển giao trước nhé.' }[r.status];
            if (msg) return replyEmbed('error', '🏰・Rời Bang', msg);
            return replyEmbed('success', '🏰・Rời Bang', 'Cậu đã rời bang. Hẹn gặp lại~ 👋');
        }

        if (sub === 'deposit') {
            const amount = interaction.options.getInteger('amount');
            const r = await db.clanDeposit(me.id, amount);
            if (!r) return replyEmbed('error', '💰・Góp Quỹ Bang', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            if (r.status === 'not_in') return replyEmbed('error', '💰・Góp Quỹ Bang', 'Cậu chưa ở bang nào~');
            if (r.status === 'poor') return replyEmbed('error', '💰・Góp Quỹ Bang', 'Ví cậu không đủ để góp~ 😟');
            return replyEmbed('success', '💰・Góp Quỹ Bang', `Cậu đã góp **${fmt(amount)}** ${C} vào quỹ bang. Quỹ hiện có: **${fmt(r.bank)}** ${C}.`);
        }

        if (sub === 'withdraw') {
            const amount = interaction.options.getInteger('amount');
            const r = await db.clanWithdraw(me.id, amount);
            if (!r) return replyEmbed('error', '💸・Rút Quỹ Bang', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            const msg = { not_in: 'Cậu chưa ở bang nào~', not_leader: 'Chỉ trưởng bang mới rút quỹ được nhé~', poor_clan: `Quỹ bang chỉ còn **${fmt(r.bank)}** ${C}, không đủ~` }[r.status];
            if (msg) return replyEmbed('error', '💸・Rút Quỹ Bang', msg);
            return replyEmbed('success', '💸・Rút Quỹ Bang', `Đã rút **${fmt(amount)}** ${C} từ quỹ bang về ví của cậu.`);
        }

        if (sub === 'kick') {
            const target = interaction.options.getUser('user');
            const r = await db.clanKick(me.id, target.id);
            if (!r) return replyEmbed('error', '👢・Trục xuất Thành viên', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            const msg = { not_in: 'Cậu chưa ở bang nào~', not_leader: 'Chỉ trưởng bang mới đuổi được~', self: 'Không tự đuổi mình được đâu~ 😄', not_member: `<@${target.id}> không ở trong bang của cậu~` }[r.status];
            if (msg) return replyEmbed('error', '👢・Trục xuất Thành viên', msg);
            return replyEmbed('success', '👢・Trục xuất Thành viên', `Đã đuổi <@${target.id}> khỏi bang.`);
        }

        if (sub === 'disband') {
            const r = await db.clanDisband(me.id);
            if (!r) return replyEmbed('error', '🏚️・Giải tán Bang', 'Ơ, có lỗi, thử lại sau nhé~ 🌸');
            const msg = { not_in: 'Cậu chưa ở bang nào~', not_leader: 'Chỉ trưởng bang mới giải tán được~' }[r.status];
            if (msg) return replyEmbed('error', '🏚️・Giải tán Bang', msg);
            return replyEmbed('success', '🏚️・Giải tán Bang', `Bang đã giải tán. ${Number(r.refund) > 0 ? `Quỹ còn lại **${fmt(r.refund)}** ${C} đã trả về ví cậu.` : ''}`);
        }

        if (sub === 'list') {
            const clans = await db.clanList(15);
            if (!clans.length) return interaction.editReply('Chưa có bang nào được lập~ Hãy là người đầu tiên với `/clan create`!');
            const lines = clans.map((c, i) => `${['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`} **${c.name}** (Lv.${clanLevel(c.xp)}) — quỹ **${fmt(c.bank)}** ${C} · <@${c.leader_id}>`);
            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                title: '🏰・Bảng xếp hạng Bang hội',
                description: lines.join('\n')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'war') {
            const u = await db.getUser(me.id);
            if (!u?.clan_id) return replyEmbed('error', '⚔️・Chiến tranh Bang hội', 'Cậu chưa ở bang nào~');
            const myClan = await db.clanById(u.clan_id);
            if (!myClan || myClan.leader_id !== me.id) return replyEmbed('error', '⚔️・Chiến tranh Bang hội', 'Chỉ trưởng bang mới khai chiến được nhé~');
            const cdUntil = warCooldown.get(myClan.id) || 0;
            if (Date.now() < cdUntil) return replyEmbed('warning', '⚔️・Chiến tranh Bang hội', `Bang cậu vừa chinh chiến xong, nghỉ ngơi đã~ Quay lại sau <t:${Math.floor(cdUntil / 1000)}:R>.`);
            const foe = await db.clanByName(interaction.options.getString('clan').trim());
            if (!foe) return replyEmbed('error', '⚔️・Chiến tranh Bang hội', 'Không tìm thấy bang đối thủ~');
            if (foe.id === myClan.id) return replyEmbed('error', '⚔️・Chiến tranh Bang hội', 'Không thể tự đánh bang mình đâu~ 😅');
            const stake = Math.min(Number(myClan.bank), Number(foe.bank), config.CLAN.WAR_STAKE);
            if (stake <= 0) return replyEmbed('warning', '⚔️・Chiến tranh Bang hội', `Cả hai bang đều cần có quỹ (cược tối đa ${fmt(config.CLAN.WAR_STAKE)} ${C}) mới khai chiến được. Góp quỹ thêm nhé~`);

            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '⚔️・Lời tuyên chiến!',
                description: `Bang **${myClan.name}** tuyên chiến với bang **${foe.name}**!\nCược: **${fmt(stake)}** ${C} — bang thua mất, bang thắng cướp.\n\n<@${foe.leader_id}> (trưởng bang **${foe.name}**) có chấp nhận không?`
            });
            const row = (dis = false) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('accept').setLabel('Chấp nhận ⚔️').setStyle(ButtonStyle.Danger).setDisabled(dis),
                new ButtonBuilder().setCustomId('decline').setLabel('Từ chối 🏳️').setStyle(ButtonStyle.Secondary).setDisabled(dis));
            const msg = await interaction.editReply({ content: `<@${foe.leader_id}>`, embeds: [embed], components: [row()] });
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
            let answered = false;
            collector.on('collect', async (i) => {
                if (i.user.id !== foe.leader_id) return i.reply({ content: 'Chỉ trưởng bang đối thủ mới trả lời được~', flags: MessageFlags.Ephemeral });
                if (answered) return i.deferUpdate().catch(() => {}); // chống double-click: chỉ xử lý lần bấm đầu (tránh xử chiến 2 lần / cướp quỹ x2)
                answered = true;
                if (i.customId === 'decline') {
                    const decEmbed = buildWaguriEmbed(interaction, 'error', {
                        title: '⚔️・Từ chối chiến đấu',
                        description: `Bang **${foe.name}** đã từ chối lời thách đấu của bang cậu. 🏳️`
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
                warCooldown.set(myClan.id, Date.now() + 10 * 60000);
                const winEmbed = buildWaguriEmbed(interaction, 'jackpot', {
                    title: '⚔️・Kết quả chiến tranh bang',
                    description: `**${myClan.name}** (sức mạnh ${Math.round(pA)}) ⚔️ **${foe.name}** (sức mạnh ${Math.round(pB)})\n\n🏆 Bang **${winner.name}** chiến thắng, cướp **${fmt(taken)}** ${C} vào quỹ!`
                });
                await i.update({ embeds: [winEmbed], components: [] });
                collector.stop('done');
            });
            collector.on('end', async () => {
                if (!answered) {
                    const timeoutEmbed = buildWaguriEmbed(interaction, 'error', {
                        title: '⚔️・Huỷ thách đấu',
                        description: `Bang **${foe.name}** không phản hồi kịp. Lời tuyên chiến đã hết hạn.`
                    });
                    await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                }
            });
            return;
        }

        // info
        const name = interaction.options.getString('name');
        let clan;
        if (name) clan = await db.clanByName(name.trim());
        else { const u = await db.getUser(me.id); clan = u?.clan_id ? await db.clanById(u.clan_id) : null; }
        if (!clan) return replyEmbed('error', '🏰・Thông tin Bang hội', name ? 'Không tìm thấy bang này~' : 'Cậu chưa ở bang nào~ Gõ `/clan list` để xem các bang nhé.');

        const members = await db.clanMembers(clan.id);
        const memList = members.map(id => `${id === clan.leader_id ? '👑' : '▫️'} <@${id}>`).join('\n') || '*(trống)*';
        const embed = buildWaguriEmbed(interaction, 'info', {
            title: `🏰・Bang: ${clan.name} (Lv.${clanLevel(clan.xp)})`,
            fields: [
                { name: 'Trưởng bang', value: `<@${clan.leader_id}>`, inline: true },
                { name: 'Quỹ bang', value: `${fmt(clan.bank)} ${C}`, inline: true },
                { name: 'Cổ tức/ngày', value: `${fmt(clanLevel(clan.xp) * 100)} ${C}/thành viên`, inline: true },
                { name: `Thành viên (${members.length})`, value: memList, inline: false },
            ]
        });
        const footerObj = getWaguriFooter(interaction.client);
        footerObj.text = 'Góp quỹ (/clan deposit) để bang lên cấp & cổ tức cao hơn · ' + footerObj.text;
        embed.setFooter(footerObj);
        return interaction.editReply({ embeds: [embed] });
    },
};
