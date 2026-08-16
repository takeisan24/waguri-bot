// ============================================================
// commands/admin/antinuke.js — Bảng điều khiển hệ chống nuke.
//
// PHÂN QUYỀN CÓ CHỦ Ý, KHÁC MỌI LỆNH ADMIN KHÁC CỦA BOT:
// mọi thao tác GHI ở đây chỉ **CHỦ SERVER** làm được, không phải "ai có quyền
// Administrator". Lý do rất thực tế: kẻ tấn công điển hình CHÍNH LÀ một tài khoản
// admin bị chiếm. Nếu admin tắt được lá chắn thì lá chắn chỉ chặn được người không
// có ý định tấn công.
//
// Các thao tác ĐỌC (status/check/incidents/whitelist-list) mở cho Manage Guild —
// đội mod cần xem được tình hình mà không cần đánh thức chủ server.
// ============================================================
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const cache = require('../../lib/antinuke/config');
const { khoa, moKhoa, dangKhoa } = require('../../lib/antinuke/lockdown');

const CHI_GHI = new Set(['enable', 'mode', 'whitelist-add', 'whitelist-remove', 'logchannel', 'lockdown']);

/** Embed gọn, KHÔNG dùng buildWaguriEmbed: ảnh Waguri ngẫu nhiên đẩy thông tin an ninh xuống dưới màn hình. */
function embed(mau, title, description) {
    const e = new EmbedBuilder().setColor(config.COLORS[mau] || config.COLORS.INFO).setTimestamp();
    if (title) e.setTitle(title);
    if (description) e.setDescription(description);
    return e;
}

const dau = ok => (ok ? '✅' : '❌');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('antinuke')
        .setDescription('Chống nuke server: phát hiện & chặn xoá kênh/role, ban hàng loạt, tự phong quyền')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(s => s.setName('enable').setDescription('Bật/tắt lá chắn (TẮT có độ trễ 5 phút + báo động)')
            .addBooleanOption(o => o.setName('enabled').setDescription('Bật lá chắn?').setRequired(true)))
        .addSubcommand(s => s.setName('mode').setDescription('Chế độ: chỉ ghi log (thử) hay thi hành thật')
            .addStringOption(o => o.setName('mode').setDescription('Chế độ').setRequired(true)
                .addChoices(
                    { name: 'Chỉ ghi log (an toàn, nên dùng 7 ngày đầu)', value: 'dryrun' },
                    { name: 'Thi hành thật (trừng phạt + khoá server)', value: 'enforce' },
                )))
        .addSubcommand(s => s.setName('status').setDescription('Xem cấu hình & trạng thái lá chắn'))
        .addSubcommand(s => s.setName('check').setDescription('Kiểm tra bot có ĐỦ ĐIỀU KIỆN chống nuke không'))
        .addSubcommand(s => s.setName('whitelist-add').setDescription('Miễn trừ một người hoặc một role')
            .addUserOption(o => o.setName('user').setDescription('Người được miễn trừ'))
            .addRoleOption(o => o.setName('role').setDescription('Role được miễn trừ')))
        .addSubcommand(s => s.setName('whitelist-remove').setDescription('Gỡ miễn trừ')
            .addUserOption(o => o.setName('user').setDescription('Người cần gỡ'))
            .addRoleOption(o => o.setName('role').setDescription('Role cần gỡ')))
        .addSubcommand(s => s.setName('whitelist-list').setDescription('Xem danh sách miễn trừ'))
        .addSubcommand(s => s.setName('logchannel').setDescription('Kênh nhận báo động (bỏ trống để gỡ)')
            .addChannelOption(o => o.setName('channel').setDescription('Kênh text').addChannelTypes(ChannelType.GuildText)))
        .addSubcommand(s => s.setName('lockdown').setDescription('Khoá/mở khoá server thủ công')
            .addStringOption(o => o.setName('state').setDescription('Khoá hay mở').setRequired(true)
                // Giá trị 'lock'/'unlock' chứ không phải 'on'/'off': bảng CHOICE_LOCALIZATIONS
                // tra theo GIÁ TRỊ và dùng chung toàn bot, nên giá trị càng chung chung càng
                // dễ đụng nhau với lệnh khác sau này.
                .addChoices({ name: 'Khoá', value: 'lock' }, { name: 'Mở khoá', value: 'unlock' })))
        .addSubcommand(s => s.setName('incidents').setDescription('Nhật ký sự cố gần đây')),

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const gid = interaction.guild?.id;
        if (!gid) {
            return interaction.reply({
                embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.guild_only'))],
                flags: MessageFlags.Ephemeral,
            });
        }

        // Ghi -> chỉ chủ server. Đọc -> Manage Guild.
        if (CHI_GHI.has(sub)) {
            if (interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({
                    embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.owner_only'))],
                    flags: MessageFlags.Ephemeral,
                });
            }
        } else if (!interaction.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.need_manage_guild'))],
                flags: MessageFlags.Ephemeral,
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // ---------------------------------------------------------------
        if (sub === 'enable') {
            const bat = interaction.options.getBoolean('enabled');
            if (bat) {
                // Kiểm kết quả ghi: báo "đã bật lá chắn" trong khi DB từ chối là kiểu
                // thất bại tệ nhất của cả tính năng — chủ server yên tâm nhầm.
                const kq = await db.antinukeSetFlag(gid, 'enabled', '1', interaction.user.id);
                if (kq !== 'ok') {
                    return interaction.editReply({ embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.save_failed'))] });
                }
                await db.antinukeSetConfig(gid, 'disable_at', '', interaction.user.id); // huỷ lệnh tắt đang chờ
                await cache.invalidate(gid);
                const e = cache.get(gid);
                return interaction.editReply({ embeds: [embed('SUCCESS', t(locale, 'antinuke.cmd.enabled_title'),
                    t(locale, e.mode === 'enforce' ? 'antinuke.cmd.enabled_enforce' : 'antinuke.cmd.enabled_dryrun'))] });
            }
            // TẮT CÓ ĐỘ TRỄ: đây là bước đầu tiên kẻ chiếm được tài khoản chủ server sẽ
            // làm. 5 phút chờ + báo động ngay là cửa sổ để chủ server thật kịp can thiệp.
            const moc = Date.now() + config.ANTINUKE.DISABLE_DELAY_MS;
            if (await db.antinukeSetConfig(gid, 'disable_at', String(moc), interaction.user.id) !== 'ok') {
                return interaction.editReply({ embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.save_failed'))] });
            }
            await cache.invalidate(gid);
            const kenhId = cache.get(gid).config?.log_channel;
            if (kenhId) {
                const ch = interaction.guild.channels.cache.get(kenhId);
                if (ch?.isTextBased()) {
                    ch.send({ embeds: [embed('WARNING', t(locale, 'antinuke.cmd.disable_alert_title'),
                        t(locale, 'antinuke.cmd.disable_alert_body', { user: `<@${interaction.user.id}>`, ts: Math.floor(moc / 1000) }))] })
                        .catch(() => {});
                }
            }
            return interaction.editReply({ embeds: [embed('WARNING', t(locale, 'antinuke.cmd.disable_pending_title'),
                t(locale, 'antinuke.cmd.disable_pending_body', { ts: Math.floor(moc / 1000) }))] });
        }

        // ---------------------------------------------------------------
        if (sub === 'mode') {
            const mode = interaction.options.getString('mode');
            const kq = await db.antinukeSetFlag(gid, 'mode', mode, interaction.user.id);
            // `mode_invalid` không tới được qua slash (đã có addChoices) nhưng TỚI ĐƯỢC
            // qua prefix shim `w!antinuke mode abc` — đúng lớp lỗi đã làm /market câm.
            if (kq === 'mode_invalid' || kq === 'field_invalid') {
                return interaction.editReply({ embeds: [embed('WARNING', null, t(locale, 'antinuke.cmd.mode_invalid'))] });
            }
            if (kq !== 'ok') {
                return interaction.editReply({ embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.save_failed'))] });
            }
            await cache.invalidate(gid);
            return interaction.editReply({ embeds: [embed(mode === 'enforce' ? 'SUCCESS' : 'INFO',
                t(locale, 'antinuke.cmd.mode_title'),
                t(locale, mode === 'enforce' ? 'antinuke.cmd.mode_enforce' : 'antinuke.cmd.mode_dryrun'))] });
        }

        // ---------------------------------------------------------------
        if (sub === 'status') {
            const e = cache.get(gid);
            const dangTat = e.disableAt && Date.now() < e.disableAt;
            const luat = Object.entries(config.ANTINUKE.RULES)
                .map(([k, v]) => `${t(locale, `antinuke.action.${k}`)}: **${v.limit}**/${Math.round(v.windowMs / 1000)}s → ${t(locale, `antinuke.verdict.${v.verdict}`)}`)
                .join('\n');
            return interaction.editReply({
                embeds: [embed(cache.dangBaoVe(gid) ? 'SUCCESS' : 'WARNING', t(locale, 'antinuke.cmd.status_title'), null).addFields(
                    { name: t(locale, 'antinuke.cmd.f_shield'), value: cache.dangBaoVe(gid) ? t(locale, 'antinuke.cmd.on') : t(locale, 'antinuke.cmd.off'), inline: true },
                    { name: t(locale, 'antinuke.cmd.f_mode'), value: t(locale, e.mode === 'enforce' ? 'antinuke.cmd.mode_name_enforce' : 'antinuke.cmd.mode_name_dryrun'), inline: true },
                    { name: t(locale, 'antinuke.cmd.f_lockdown'), value: dangKhoa(gid) ? t(locale, 'antinuke.cmd.locked') : t(locale, 'antinuke.cmd.unlocked'), inline: true },
                    { name: t(locale, 'antinuke.cmd.f_logchannel'), value: e.config?.log_channel ? `<#${e.config.log_channel}>` : t(locale, 'antinuke.cmd.not_set'), inline: true },
                    { name: t(locale, 'antinuke.cmd.f_whitelist'), value: `${e.mtNguoi.size} 👤 · ${e.mtRole.size} 🎭`, inline: true },
                    { name: t(locale, 'antinuke.cmd.f_pending_disable'), value: dangTat ? `<t:${Math.floor(e.disableAt / 1000)}:R>` : t(locale, 'antinuke.cmd.none'), inline: true },
                    { name: t(locale, 'antinuke.cmd.f_rules'), value: luat.slice(0, 1024) },
                )],
            });
        }

        // ---------------------------------------------------------------
        if (sub === 'check') {
            const me = interaction.guild.members.me;
            const p = me?.permissions;
            const mucQuyen = [
                ['ViewAuditLog', PermissionFlagsBits.ViewAuditLog],
                ['ManageRoles', PermissionFlagsBits.ManageRoles],
                ['BanMembers', PermissionFlagsBits.BanMembers],
                ['KickMembers', PermissionFlagsBits.KickMembers],
                ['ManageGuild', PermissionFlagsBits.ManageGuild],
                ['ManageChannels', PermissionFlagsBits.ManageChannels],
            ];
            const dong = mucQuyen.map(([ten, bit]) => `${dau(Boolean(p?.has(bit)))} \`${ten}\``);

            // Thứ bậc role: Discord từ chối MỌI thao tác lên người có role cao hơn bot.
            // Đây là lý do phổ biến nhất khiến anti-nuke "chạy mà không chặn được gì".
            const viTriBot = me?.roles?.highest?.position ?? 0;
            const bitNguyHiem = config.ANTINUKE.DANGEROUS_PERMS
                .map(n => PermissionFlagsBits[n]).filter(Boolean).reduce((a, b) => a | b, 0n);
            const roleTren = interaction.guild.roles.cache.filter(r =>
                r.id !== interaction.guild.id && r.position >= viTriBot && (r.permissions.bitfield & bitNguyHiem) !== 0n);
            dong.push(`${dau(roleTren.size === 0)} ${t(locale, 'antinuke.cmd.check_hierarchy', { count: roleTren.size })}`);

            const e = cache.get(gid);
            dong.push(`${dau(cache.dangBaoVe(gid))} ${t(locale, 'antinuke.cmd.check_enabled')}`);
            dong.push(`${dau(e.mode === 'enforce')} ${t(locale, 'antinuke.cmd.check_enforce')}`);
            dong.push(`${dau(Boolean(e.config?.log_channel))} ${t(locale, 'antinuke.cmd.check_logchannel')}`);

            const thieu = dong.filter(d => d.startsWith('❌')).length;
            return interaction.editReply({
                embeds: [embed(thieu ? 'WARNING' : 'SUCCESS', t(locale, 'antinuke.cmd.check_title'), dong.join('\n'))
                    .addFields({ name: t(locale, 'antinuke.cmd.check_native_title'), value: t(locale, 'antinuke.cmd.check_native_body') })],
            });
        }

        // ---------------------------------------------------------------
        if (sub === 'whitelist-add' || sub === 'whitelist-remove') {
            const u = interaction.options.getUser('user');
            const r = interaction.options.getRole('role');
            if (!u && !r) {
                return interaction.editReply({ embeds: [embed('WARNING', null, t(locale, 'antinuke.cmd.wl_need_target'))] });
            }
            // Nhận cả hai thì im lặng bỏ qua một cái là kiểu hỏng tệ nhất ở đây: chủ
            // server tưởng đã miễn trừ role, thực tế chỉ miễn trừ mỗi người kia.
            if (u && r) {
                return interaction.editReply({ embeds: [embed('WARNING', null, t(locale, 'antinuke.cmd.wl_one_at_a_time'))] });
            }
            const id = u ? u.id : r.id;
            const kind = u ? 'user' : 'role';

            if (sub === 'whitelist-add') {
                const kq = await db.antinukeWhitelistAdd(gid, id, kind, interaction.user.id);
                await cache.invalidate(gid);
                if (kq === 'whitelist_full') {
                    return interaction.editReply({ embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.wl_full', { max: config.ANTINUKE.WHITELIST_MAX }))] });
                }
                // Gom mọi status còn lại ('kind_invalid' chỉ tới được nếu call-site bị sửa
                // sai, vì `kind` suy ra từ chính option người dùng chọn).
                if (kq !== 'ok') {
                    return interaction.editReply({ embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.wl_error'))] });
                }
                return interaction.editReply({ embeds: [embed('SUCCESS', null,
                    t(locale, 'antinuke.cmd.wl_added', { target: u ? `<@${id}>` : `<@&${id}>` }))] });
            }

            const kq = await db.antinukeWhitelistRemove(gid, id);
            await cache.invalidate(gid);
            return interaction.editReply({ embeds: [embed(kq === 'ok' ? 'SUCCESS' : 'WARNING', null,
                t(locale, kq === 'ok' ? 'antinuke.cmd.wl_removed' : 'antinuke.cmd.wl_not_found',
                    { target: u ? `<@${id}>` : `<@&${id}>` }))] });
        }

        // ---------------------------------------------------------------
        if (sub === 'whitelist-list') {
            const e = cache.get(gid);
            const ds = [
                ...[...e.mtNguoi].map(i => `<@${i}>`),
                ...[...e.mtRole].map(i => `<@&${i}>`),
            ];
            return interaction.editReply({
                embeds: [embed('INFO', t(locale, 'antinuke.cmd.wl_title'),
                    ds.length ? ds.join(' · ').slice(0, 4000) : t(locale, 'antinuke.cmd.wl_empty'))],
            });
        }

        // ---------------------------------------------------------------
        if (sub === 'logchannel') {
            const ch = interaction.options.getChannel('channel');
            if (await db.antinukeSetConfig(gid, 'log_channel', ch ? ch.id : '', interaction.user.id) !== 'ok') {
                return interaction.editReply({ embeds: [embed('ERROR', null, t(locale, 'antinuke.cmd.save_failed'))] });
            }
            await cache.invalidate(gid);
            return interaction.editReply({ embeds: [embed('SUCCESS', null,
                ch ? t(locale, 'antinuke.cmd.logchannel_set', { channelId: ch.id }) : t(locale, 'antinuke.cmd.logchannel_cleared'))] });
        }

        // ---------------------------------------------------------------
        if (sub === 'lockdown') {
            const state = interaction.options.getString('state');
            if (state === 'lock') {
                const r = await khoa(interaction.guild, `Waguri anti-nuke: khoá thủ công bởi ${interaction.user.tag}`);
                return interaction.editReply({ embeds: [embed('WARNING', t(locale, 'antinuke.cmd.lockdown_on_title'),
                    r.daLam.length ? t(locale, 'antinuke.cmd.lockdown_on_body', { steps: r.daLam.join(', ') })
                        : t(locale, 'antinuke.cmd.lockdown_nothing'))] });
            }
            const r = await moKhoa(interaction.guild);
            if (!r.ok) {
                return interaction.editReply({ embeds: [embed('WARNING', null,
                    t(locale, r.reason === 'khong_khoa' ? 'antinuke.cmd.lockdown_not_locked' : 'antinuke.cmd.lockdown_state_broken'))] });
            }
            return interaction.editReply({ embeds: [embed('SUCCESS', t(locale, 'antinuke.cmd.lockdown_off_title'),
                t(locale, 'antinuke.cmd.lockdown_off_body', { steps: r.daTra.join(', ') || '—' }))] });
        }

        // ---------------------------------------------------------------
        if (sub === 'incidents') {
            const ds = await db.antinukeIncidentsRecent(gid, 10);
            if (!ds.length) {
                return interaction.editReply({ embeds: [embed('INFO', t(locale, 'antinuke.cmd.inc_title'), t(locale, 'antinuke.cmd.inc_empty'))] });
            }
            const dong = ds.map(r => {
                const ts = Math.floor(new Date(r.created_at).getTime() / 1000);
                const ai = r.executor_id ? `<@${r.executor_id}>` : t(locale, 'antinuke.cmd.inc_unknown');
                return `\`#${r.id}\` <t:${ts}:R> · ${t(locale, `antinuke.action.${r.action_type}`)} ×${r.hit_count} · ${ai} · `
                     + `${t(locale, `antinuke.verdict.${r.verdict}`)} ${r.punished ? '✅' : '⚠️'}`;
            });
            return interaction.editReply({ embeds: [embed('INFO', t(locale, 'antinuke.cmd.inc_title'), dong.join('\n').slice(0, 4000))] });
        }
    },
};
