const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { isOwner } = require('../../lib/owner');
const { setBan } = require('../../lib/bans');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale?.startsWith('en') ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eco-admin')
        .setDescription('Công cụ quản trị economy (chỉ owner)')
        .setDefaultMemberPermissions(0)
        .addSubcommand(s => s.setName('addmoney').setDescription('Cộng/trừ tiền')
            .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền (âm để trừ)').setRequired(true))
            .addStringOption(o => o.setName('field').setDescription('Ví hay ngân hàng').addChoices({ name: 'Ví', value: 'wallet' }, { name: 'Ngân hàng', value: 'bank' })))
        .addSubcommand(s => s.setName('setmoney').setDescription('Đặt cứng số dư')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(0))
            .addStringOption(o => o.setName('field').setDescription('Ví hay ngân hàng').addChoices({ name: 'Ví', value: 'wallet' }, { name: 'Ngân hàng', value: 'bank' })))
        .addSubcommand(s => s.setName('setenergy').setDescription('Đặt năng lượng')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('value').setDescription('Giá trị').setRequired(true).setMinValue(0)))
        .addSubcommand(s => s.setName('setexp').setDescription('Đặt EXP')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('value').setDescription('Giá trị').setRequired(true).setMinValue(0)))
        .addSubcommand(s => s.setName('giveitem').setDescription('Cấp vật phẩm miễn phí')
            .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
            .addStringOption(o => o.setName('item').setDescription('Vật phẩm').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('setjob').setDescription('Bổ nhiệm công việc')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addStringOption(o => o.setName('job').setDescription('Nghề nghiệp').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('premium').setDescription('Cấp/gia hạn Premium cho người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('days').setDescription('Số ngày').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('ban').setDescription('Chặn user dùng bot')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('unban').setDescription('Bỏ chặn user')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('resetuser').setDescription('Xóa sạch dữ liệu một người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('report').setDescription('📊 Báo cáo telemetry kinh tế (cung tiền, hoạt động, dòng tiền, top nhận)'))
        .addSubcommand(s => s.setName('trace').setDescription('🔎 Xem nhật ký giao dịch của một người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi cần truy vết').setRequired(true))
            .addIntegerOption(o => o.setName('limit').setDescription('Số dòng (mặc định 20, tối đa 50)').setMinValue(1).setMaxValue(50)))
        .addSubcommand(s => s.setName('code-create').setDescription('🎁 Tạo mã quà')
            .addStringOption(o => o.setName('code').setDescription('Mã quà (4-32 ký tự: A-Z, 0-9, dấu -)').setRequired(true).setMaxLength(32))
            .addStringOption(o => o.setName('note').setDescription('Mã này để làm gì? (bắt buộc — 6 tháng sau còn tra được)').setRequired(true).setMaxLength(200))
            .addIntegerOption(o => o.setName('coins').setDescription('Số xu mỗi lượt (trần 50.000)').setMinValue(0))
            .addStringOption(o => o.setName('item').setDescription('Vật phẩm kèm theo').setAutocomplete(true))
            .addIntegerOption(o => o.setName('item-qty').setDescription('Số lượng vật phẩm (mặc định 1)').setMinValue(1))
            .addIntegerOption(o => o.setName('premium-days').setDescription('Số ngày Premium (trần 90)').setMinValue(0))
            .addIntegerOption(o => o.setName('max-uses').setDescription('Số lượt đổi tối đa (mặc định 1)').setMinValue(1))
            .addUserOption(o => o.setName('only-user').setDescription('Chỉ riêng một người mới đổi được (mã đền bù)'))
            .addIntegerOption(o => o.setName('expires-hours').setDescription('Hết hạn sau bao nhiêu giờ').setMinValue(1))
            .addIntegerOption(o => o.setName('min-account-age').setDescription('Tuổi tài khoản Discord tối thiểu (ngày)').setMinValue(0)))
        .addSubcommand(s => s.setName('code-list').setDescription('🎁 Xem các mã quà đã tạo')
            .addIntegerOption(o => o.setName('limit').setDescription('Số dòng (mặc định 20, tối đa 50)').setMinValue(1).setMaxValue(50)))
        .addSubcommand(s => s.setName('code-revoke').setDescription('🎁 Thu hồi một mã quà')
            .addStringOption(o => o.setName('code').setDescription('Mã cần thu hồi').setRequired(true).setMaxLength(32))),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const sub = interaction.options.getSubcommand();
        if (sub === 'giveitem' || sub === 'code-create') {
            const items = await db.getItems();
            await interaction.respond(items
                .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
                .slice(0, 25)
                .map(i => ({ name: i.name, value: i.id })));
        } else if (sub === 'setjob') {
            const jobs = await db.getJobs();
            await interaction.respond(jobs
                .filter(j => j.name.toLowerCase().includes(focused) || j.id.includes(focused))
                .slice(0, 25)
                .map(j => ({ name: j.name, value: j.id })));
        }
    },

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');

        // Chặn người không phải owner (chủ app tự nhận + OWNER_IDS env)
        if (!await isOwner(interaction.client, interaction.user.id)) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.eco-admin.only_owner')
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        // Nhánh mã quà phải trả lời RIÊNG TƯ. Không thì `/eco-admin code-create` in thẳng mã
        // vào kênh cho mọi người đang xem — mã 100 lượt bị hốt sạch trước khi kịp đem phát.
        // `code-list` còn nặng hơn: nó phơi TOÀN BỘ mã đang sống cùng giá trị từng mã.
        // (Đọc `sub` trước defer là an toàn: `getSubcommand()` thuần bộ nhớ, không chạm DB.)
        const sub = interaction.options.getSubcommand();
        await interaction.deferReply(sub.startsWith('code-') ? { flags: MessageFlags.Ephemeral } : undefined);
        // Khai báo MỘT lần ở đầu scope hàm, trước mọi nhánh `sub`. Trước đây có tới hai
        // `const C`: một trong khối `report`, một ở cuối hàm. Nhánh `trace` không có bản
        // cục bộ nên giải về bản cuối hàm — đang trong vùng chết (TDZ) vì `const` không
        // được khởi tạo lúc hoisted -> `/eco-admin trace` ném ReferenceError và không bao
        // giờ phản hồi. Mọi nhánh dùng chung một khai báo thì không còn chỗ cho lỗi đó.
        const C = config.CURRENCY;

        // --- Mã quà (redeem code) ---
        // Mọi nhánh dưới đây đều PHẢI nhìn chuỗi trạng thái RPC trả về rồi mới nói.
        // Không nhánh nào được mặc định 'thành công' — đó là lỗi lặp lại ở 6 lô đã audit.
        if (sub === 'code-create') {
            const ma = interaction.options.getString('code');
            const itemId = interaction.options.getString('item');
            const rewards = {};
            const coins = interaction.options.getInteger('coins') || 0;
            const days = interaction.options.getInteger('premium-days') || 0;
            if (coins > 0) rewards.coins = coins;
            if (days > 0) rewards.premium_days = days;
            if (itemId) rewards.items = [{ id: itemId, qty: interaction.options.getInteger('item-qty') || 1 }];

            // Mã không thưởng gì là mã vô nghĩa — chặn ngay, đừng để tạo rồi mới ngơ ngác.
            if (!Object.keys(rewards).length) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.eco-admin.code.empty_reward') })] });
            }

            const gio = interaction.options.getInteger('expires-hours');
            const onlyUser = interaction.options.getUser('only-user');
            const kq = await db.createRedeemCode({
                code: ma,
                rewards,
                maxUses: interaction.options.getInteger('max-uses') || 1,
                perUserLimit: 1,
                onlyUserId: onlyUser?.id || null,
                startsAt: null,
                expiresAt: gio ? new Date(Date.now() + gio * 3600000).toISOString() : null,
                minAccountAgeDays: interaction.options.getInteger('min-account-age') || 0,
                note: interaction.options.getString('note'),
                createdBy: interaction.user.id,
            });

            if (kq !== 'ok') {
                const khoa = `commands.eco-admin.code.err_${kq}`;
                // Chuỗi lạ (hợp đồng RPC đổi mà đây chưa theo) rơi về thông báo chung,
                // KHÔNG rơi về "đã tạo".
                const mo = t(locale, khoa) === khoa ? t(locale, 'commands.eco-admin.code.err_error') : t(locale, khoa);
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { description: mo })] });
            }

            console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=code-create code=${String(ma).toUpperCase()} rewards=${JSON.stringify(rewards)}`);
            const tomTat = [
                coins > 0 ? t(locale, 'commands.eco-admin.code.sum_coins', { amount: fmt(coins, locale), currency: C }) : null,
                itemId ? t(locale, 'commands.eco-admin.code.sum_item', { qty: interaction.options.getInteger('item-qty') || 1, id: itemId }) : null,
                days > 0 ? t(locale, 'commands.eco-admin.code.sum_premium', { days }) : null,
            ].filter(Boolean);
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
                description: t(locale, 'commands.eco-admin.code.created', {
                    code: String(ma).toUpperCase(),
                    uses: interaction.options.getInteger('max-uses') || 1,
                }) + (tomTat.length ? `\n${tomTat.join('\n')}` : ''),
            })] });
        }

        if (sub === 'code-list') {
            const ds = await db.listRedeemCodes(interaction.options.getInteger('limit') || 20);
            // null = DB hỏng, [] = chưa có mã nào. Hai chuyện khác nhau, hai câu khác nhau.
            if (ds === null) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    description: t(locale, 'common.retry_later') })] });
            }
            if (!ds.length) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
                    description: t(locale, 'commands.eco-admin.code.list_empty') })] });
            }
            const cat = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
            const dong = ds.map(c => {
                const het = c.revoked ? '🚫' : (c.expires_at && new Date(c.expires_at) <= new Date() ? '⏰' : '✅');
                const r = c.rewards || {};
                const thuong = [
                    r.coins ? `${fmt(r.coins, locale)} ${C}` : null,
                    // Không ghi cứng "vật phẩm" ở đây: chủ bot đọc tiếng Anh sẽ thấy chữ Việt
                    // lẫn vào. Đúng lớp lỗi L2 mà máy quét của chính repo này đi tìm.
                    Array.isArray(r.items) && r.items.length
                        ? t(locale, 'commands.eco-admin.code.sum_items_n', { n: r.items.length }) : null,
                    r.premium_days ? `${r.premium_days}d Premium` : null,
                ].filter(Boolean).join(' + ') || '—';
                return `${het} \`${c.code}\` · ${c.uses}/${c.max_uses} · ${thuong}\n   ↳ _${cat(c.note, 80)}_`;
            });

            // Mô tả embed của Discord chặn ở 4096 ký tự. Ghi chú được phép dài 200, nên chỉ
            // 20 mã (mức mặc định) đã đủ vượt trần -> Discord từ chối và lệnh chết không lời
            // giải thích. Cắt cho vừa, và NÓI ra là đã cắt: nuốt bớt trong im lặng cũng là
            // một kiểu nói sai.
            let mo = '';
            let bo = 0;
            for (const d of dong) {
                if (mo.length + d.length + 1 > 3900) { bo++; continue; }
                mo += (mo ? '\n' : '') + d;
            }
            if (bo) mo += `\n\n${t(locale, 'commands.eco-admin.code.list_truncated', { n: bo })}`;
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { description: mo })] });
        }

        if (sub === 'code-revoke') {
            const ma = interaction.options.getString('code');
            const kq = await db.revokeRedeemCode(ma);
            if (kq === 'error') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    description: t(locale, 'common.retry_later') })] });
            }
            if (kq === 'not_found') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.eco-admin.code.revoke_none', { code: String(ma).toUpperCase() }) })] });
            }
            console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=code-revoke code=${String(ma).toUpperCase()}`);
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
                description: t(locale, 'commands.eco-admin.code.revoked', { code: String(ma).toUpperCase() }) })] });
        }

        // --- Báo cáo telemetry kinh tế (không cần target user) ---
        if (sub === 'report') {
            console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=report`);
            await db.snapshotEconomy(); // cập nhật ảnh chụp hôm nay trước khi xem
            const snaps = await db.getEconomySnapshots(14);
            if (!snaps.length) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.eco-admin.no_telemetry')
                })] });
            }
            const cur = snaps[0];
            const prev = snaps[1];
            const weekRef = snaps[Math.min(snaps.length - 1, 7)];
            const delta = (a, b) => {
                if (b == null) return '';
                const d = Number(a) - Number(b);
                return ` (${d >= 0 ? '+' : ''}${fmt(d, locale)})`;
            };
            // Dữ liệu từ nhật ký giao dịch (migration 0104). Ledger mới bật nên có thể
            // rỗng trong ~24h đầu — hiển thị ghi chú thay vì bảng trống khó hiểu.
            const [flow, gainers, activity, ai] = await Promise.all([
                db.getLedgerFlow(24, 8),
                db.getLedgerTopGainers(24, 5),
                db.getActivityByDay(7),
                db.aiOverview(),
            ]);

            const fields = [{
                name: t(locale, 'commands.eco-admin.trend_title'),
                value: snaps.slice(0, 7).map(s => `\`${s.taken_on}\` ${fmt(s.total_supply, locale)} ${C}`).join('\n')
            }];

            // --- Tổng quan AI ---
            //
            // Mục `server_tat_ai` là lý do chính khối này tồn tại: server lớn nhất (193 người)
            // tắt AI suốt 5 ngày mà không ai biết, chỉ lộ ra khi có người chạy SQL tay. Thứ
            // không ai nhìn thấy thì không ai sửa.
            if (ai) {
                const hn = ai.hom_nay || {};
                const tl = ai.tich_luy || {};
                const tat = ai.server_tat_ai || [];
                const gioiHan = ai.server_gioi_han_kenh || [];

                const dong = [
                    isEn
                        ? `💬 Today: **${fmt(hn.nguoi || 0, locale)}** people · **${fmt(hn.luot || 0, locale)}** turns`
                        : `💬 Hôm nay: **${fmt(hn.nguoi || 0, locale)}** người · **${fmt(hn.luot || 0, locale)}** lượt`,
                    isEn
                        ? `🌸 Ever chatted: **${fmt(tl.nguoi_tung_chat || 0, locale)}** · came back on a 2nd day: **${fmt(tl.quay_lai_2_ngay || 0, locale)}**`
                        : `🌸 Từng chat: **${fmt(tl.nguoi_tung_chat || 0, locale)}** · quay lại ngày 2+: **${fmt(tl.quay_lai_2_ngay || 0, locale)}**`,
                    isEn
                        ? `🔋 Shared budget: **${fmt(ai.ngan_sach_da_dung || 0, locale)}/${fmt(config.AI.GLOBAL_DAILY, locale)}**`
                        : `🔋 Ngân sách chung: **${fmt(ai.ngan_sach_da_dung || 0, locale)}/${fmt(config.AI.GLOBAL_DAILY, locale)}**`,
                ];

                // ID trần thì không hành động được — phải biết ĐÓ LÀ SERVER NÀO mới đi hỏi
                // admin được. Bot có sẵn danh sách server nên tra tên tại chỗ.
                // Nếu bot chạy nhiều shard thì cache chỉ có server của shard này; không tra
                // được thì hiện ID để vẫn còn manh mối, chứ không im lặng bỏ qua.
                const tenServer = (id) => {
                    const g = interaction.client.guilds.cache.get(String(id));
                    return g ? `**${g.name}**` : `\`${id}\``;
                };

                if (tat.length) {
                    const nguoi = tat.reduce((s, x) => s + Number(x.so_nguoi || 0), 0);
                    dong.push(isEn
                        ? `🔴 **AI OFF in ${tat.length} server(s)** — ${fmt(nguoi, locale)} people cannot chat`
                        : `🔴 **${tat.length} server đang TẮT AI** — ${fmt(nguoi, locale)} người không chat được`);
                    dong.push(tat.slice(0, 5).map(x =>
                        `   ${tenServer(x.guild_id)} · ${fmt(x.so_nguoi, locale)} ${isEn ? 'people' : 'người'}`
                    ).join('\n'));
                } else {
                    dong.push(isEn ? '🟢 No server has AI disabled' : '🟢 Không server nào đang tắt AI');
                }

                if (gioiHan.length) {
                    const nguoi = gioiHan.reduce((s, x) => s + Number(x.so_nguoi || 0), 0);
                    dong.push(isEn
                        ? `📌 ${gioiHan.length} server(s) limit AI to one channel — ${fmt(nguoi, locale)} people`
                        : `📌 ${gioiHan.length} server giới hạn AI vào 1 kênh — ${fmt(nguoi, locale)} người`);
                    dong.push(gioiHan.slice(0, 5).map(x =>
                        `   ${tenServer(x.guild_id)} · ${fmt(x.so_nguoi, locale)} ${isEn ? 'people' : 'người'}`
                    ).join('\n'));
                }

                fields.push({
                    name: isEn ? '🌸 Waguri AI' : '🌸 Trò chuyện với Waguri',
                    value: dong.join('\n').slice(0, 1000),
                    inline: false,
                });
            }

            if (activity.length) {
                fields.push({
                    name: isEn ? '👥 Active players per day' : '👥 Người hoạt động mỗi ngày',
                    value: activity.slice(0, 7).map(a => `\`${a.ngay}\` ${fmt(a.nguoi_hoat_dong, locale)}`).join('\n'),
                    inline: true,
                });
            }

            if (flow.length) {
                // Dòng tiền theo NGUỒN: nguồn nào ròng dương nhiều = vòi bơm tiền.
                fields.push({
                    name: isEn ? '💧 Money flow by source (24h)' : '💧 Dòng tiền theo nguồn (24h)',
                    value: flow.map(f => {
                        const net = Number(f.rong);
                        return `${net >= 0 ? '🟢' : '🔴'} \`${f.source}\` ${net >= 0 ? '+' : ''}${fmt(net, locale)} _(${fmt(f.so_lan, locale)}×)_`;
                    }).join('\n').slice(0, 1000),
                    inline: false,
                });
            }

            if (gainers.length) {
                fields.push({
                    name: isEn ? '📈 Top net gainers (24h)' : '📈 Nhận ròng nhiều nhất (24h)',
                    value: gainers.map(g =>
                        `**${g.username}** ${Number(g.rong) >= 0 ? '+' : ''}${fmt(g.rong, locale)} ${C} ` +
                        `_(vào ${fmt(g.thu_vao, locale)} / ra ${fmt(g.chi_ra, locale)}, ${fmt(g.so_giao_dich, locale)} gd)_`
                    ).join('\n').slice(0, 1000),
                    inline: false,
                });
            }

            if (!flow.length && !gainers.length) {
                fields.push({
                    name: isEn ? '📒 Transaction ledger' : '📒 Nhật ký giao dịch',
                    value: isEn
                        ? 'Ledger is empty — it starts recording from migration 0104 onward. Data will appear as players transact.'
                        : 'Nhật ký còn rỗng — chỉ ghi từ migration 0104 trở đi. Dữ liệu sẽ hiện dần khi người chơi giao dịch.',
                    inline: false,
                });
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: isEn ? `📊・Economy Telemetry — ${cur.taken_on}` : `📊・Telemetry Kinh Tế — ${cur.taken_on}`,
                description: isEn
                    ? `**Total Supply:** ${fmt(cur.total_supply, locale)} ${C}${delta(cur.total_supply, prev && prev.total_supply)}\n` +
                      `　_vs ~last week:${delta(cur.total_supply, weekRef && weekRef !== cur ? weekRef.total_supply : null) || ' —'}_\n` +
                      `**Wallet:** ${fmt(cur.total_wallet, locale)} · **Bank:** ${fmt(cur.total_bank, locale)}\n` +
                      `**Players:** ${fmt(cur.user_count, locale)} (active 7d: ${fmt(cur.active_7d, locale)} · Premium: ${fmt(cur.premium_count, locale)})\n` +
                      `**Richest:** ${fmt(cur.richest, locale)} · **Average:** ${fmt(cur.avg_supply, locale)}`
                    : `**Tổng cung tiền:** ${fmt(cur.total_supply, locale)} ${C}${delta(cur.total_supply, prev && prev.total_supply)}\n` +
                      `　_so với ~tuần trước:${delta(cur.total_supply, weekRef && weekRef !== cur ? weekRef.total_supply : null) || ' —'}_\n` +
                      `**Ví:** ${fmt(cur.total_wallet, locale)} · **Ngân hàng:** ${fmt(cur.total_bank, locale)}\n` +
                      `**Người chơi:** ${fmt(cur.user_count, locale)} (hoạt động 7d: ${fmt(cur.active_7d, locale)} · Premium: ${fmt(cur.premium_count, locale)})\n` +
                      `**Giàu nhất:** ${fmt(cur.richest, locale)} · **Trung bình:** ${fmt(cur.avg_supply, locale)}`,
                fields,
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // --- Truy vết giao dịch của một người chơi ---
        if (sub === 'trace') {
            const who = interaction.options.getUser('user');
            const limit = interaction.options.getInteger('limit') || 20;
            console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=trace target=${who.id}`);

            const rows = await db.getLedgerUser(who.id, limit);
            if (!rows.length) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: isEn
                        ? `No ledger entries for <@${who.id}>. The ledger only records from migration 0104 onward — older activity was never logged.`
                        : `Chưa có dòng nhật ký nào của <@${who.id}>. Nhật ký chỉ ghi từ migration 0104 trở đi — hoạt động trước đó không được lưu lại.`
                })] });
            }

            const items = await db.getItems();
            const nameOf = id => t(locale, `data.items.${id}.name`) || items.find(i => i.id === id)?.name || id;

            const lines = rows.map(r => {
                const d = Number(r.delta);
                const sign = d >= 0 ? '+' : '';
                const when = `<t:${Math.floor(new Date(r.at).getTime() / 1000)}:R>`;
                const what = r.kind === 'item'
                    ? `${sign}${fmt(d, locale)}× ${nameOf(r.item_id)}`
                    : `${sign}${fmt(d, locale)} ${C} _(${r.kind})_`;
                const after = r.balance_after != null ? ` → \`${fmt(r.balance_after, locale)}\`` : '';
                return `${d >= 0 ? '🟢' : '🔴'} ${what}${after} · \`${r.source || '?'}\` · ${when}`;
            });

            // Tổng hợp nhanh để thấy ngay bức tranh, không phải tự cộng tay.
            const money = rows.filter(r => r.kind !== 'item');
            const netMoney = money.reduce((s, r) => s + Number(r.delta), 0);

            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
                title: isEn ? `🔎・Ledger — ${who.username}` : `🔎・Nhật ký giao dịch — ${who.username}`,
                // buildWaguriEmbed CHỈ nhận {title, description, fields, thumbnail, image} —
                // truyền `footer` sẽ bị nuốt im lặng, nên chú thích nằm trong description.
                description:
                    (isEn
                        ? `Last **${rows.length}** entries · money net: **${netMoney >= 0 ? '+' : ''}${fmt(netMoney, locale)}** ${C}\n` +
                          `_The \`code\` tag is the DB function that made the change._\n\n`
                        : `**${rows.length}** dòng gần nhất · tiền ròng: **${netMoney >= 0 ? '+' : ''}${fmt(netMoney, locale)}** ${C}\n` +
                          `_Chữ trong \`ngoặc\` là hàm DB đã thực hiện thay đổi._\n\n`)
                    + lines.join('\n').slice(0, 3500),
            })] });
        }

        const target = interaction.options.getUser('user');
        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: t(locale, 'commands.eco-admin.no_target')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Audit log: ghi lại mọi thao tác admin (cấp tiền/đồ/premium/ban/reset) để truy vết.
        console.log(`[ECO-ADMIN AUDIT] owner=${interaction.user.id} action=${sub} target=${target.id} ` +
            `opts=${JSON.stringify({ amount: interaction.options.getInteger('amount'), value: interaction.options.getInteger('value'), days: interaction.options.getInteger('days'), item: interaction.options.getString('item'), job: interaction.options.getString('job'), field: interaction.options.getString('field') })}`);

        if (sub === 'addmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.addMoney(target.id, amount, field);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? (amount >= 0
                        ? t(locale, 'commands.eco-admin.addmoney_add_success', { amount: fmt(Math.abs(amount), locale), currency: C, field, user: target.id })
                        : t(locale, 'commands.eco-admin.addmoney_sub_success', { amount: fmt(Math.abs(amount), locale), currency: C, field, user: target.id }))
                    : t(locale, 'commands.eco-admin.addmoney_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.setBalance(target.id, field, amount);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setmoney_success', { field, user: target.id, amount: fmt(amount, locale), currency: C })
                    : t(locale, 'commands.eco-admin.setmoney_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setenergy') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setEnergy(target.id, value);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setenergy_success', { user: target.id, value })
                    : t(locale, 'commands.eco-admin.setenergy_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setexp') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setExp(target.id, value);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setexp_success', { user: target.id, value: fmt(value, locale) })
                    : t(locale, 'commands.eco-admin.setexp_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'giveitem') {
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('qty') || 1;
            const item = await db.getItem(itemId);
            const ok = await db.giveItemAdmin(target.id, itemId, qty);
            const localizedItemName = item ? (t(locale, `data.items.${itemId}.name`) || item.name) : itemId;
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.giveitem_success', { qty, name: localizedItemName, user: target.id })
                    : t(locale, 'commands.eco-admin.giveitem_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setjob') {
            const jobId = interaction.options.getString('job');
            const job = await db.getJob(jobId);
            if (!job) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: t(locale, 'commands.eco-admin.setjob_not_found')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const ok = await db.setUserJob(target.id, jobId);
            const localizedJobName = t(locale, `data.jobs.${jobId}.name`) || job.name;
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? t(locale, 'commands.eco-admin.setjob_success', { user: target.id, name: localizedJobName })
                    : t(locale, 'commands.eco-admin.setjob_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'ban') {
            const ok = await setBan(target.id, true);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? t(locale, 'commands.eco-admin.ban_success', { user: target.id }) : t(locale, 'commands.eco-admin.ban_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'unban') {
            const ok = await setBan(target.id, false);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? t(locale, 'commands.eco-admin.unban_success', { user: target.id }) : t(locale, 'commands.eco-admin.unban_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'premium') {
            const days = interaction.options.getInteger('days');
            const until = await db.grantPremium(target.id, days);
            const embed = buildWaguriEmbed(interaction, until ? 'success' : 'error', {
                description: until
                    ? t(locale, 'commands.eco-admin.premium_success', { days, user: target.id, time: Math.floor(new Date(until).getTime() / 1000) })
                    : t(locale, 'commands.eco-admin.premium_fail')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'resetuser') {
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reset_yes').setLabel(t(locale, 'commands.eco-admin.btn_reset_yes')).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('reset_no').setLabel(t(locale, 'commands.eco-admin.btn_reset_no')).setStyle(ButtonStyle.Secondary));
            const warn = buildWaguriEmbed(interaction, 'warning', {
                description: t(locale, 'commands.eco-admin.reset_warn', { user: target.id })
            });
            const msg = await interaction.editReply({ embeds: [warn], components: [confirmRow] });
            try {
                const btn = await msg.awaitMessageComponent({
                    componentType: ComponentType.Button, time: 20000,
                    filter: i => i.user.id === interaction.user.id,
                });
                if (btn.customId === 'reset_no') {
                    return btn.update({ embeds: [buildWaguriEmbed(interaction, 'info', { description: t(locale, 'commands.eco-admin.reset_cancel') })], components: [] });
                }
                const ok = await db.resetUser(target.id);
                return btn.update({ embeds: [buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                    description: ok ? t(locale, 'commands.eco-admin.reset_success', { user: target.id }) : t(locale, 'commands.eco-admin.reset_fail')
                })], components: [] });
            } catch {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { description: t(locale, 'commands.eco-admin.reset_timeout') })], components: [] }).catch(() => {});
            }
        }
    },
};
