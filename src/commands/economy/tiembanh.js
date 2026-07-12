const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getLevelFromExp } = require('../../lib/leveling');
const { levelInfo, maxLevel, fillingStockGain, computeBake, getEffectiveStats } = require('../../lib/bakery');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const B = config.BAKERY;
const C = config.CURRENCY;
const fmt = (n, locale) => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const matStr = (mats, locale) => Object.entries(mats || {}).map(([k, v]) => `${v}× \`${t(locale, 'data.items.' + k + '.name') || k}\``).join(' + ') || '—';

// Giới hạn số lượng nhân viên tối đa theo cấp tiệm
function getMaxStaff(level) {
    return level >= 4 ? 3 : (level >= 2 ? 2 : 1);
}

// --- xem ---
async function subXem(interaction, locale) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        locale,
        title: t(locale, 'commands.tiembanh.title'),
        description: t(locale, 'commands.tiembanh.not_open', { level: B.MIN_LEVEL, cost: fmt(B.OPEN_COST, locale), currency: C })
    })] });

    const userPet = await db.getPet(interaction.user.id);
    const petSkills = userPet?.skills || {};
    const bakeryEfficiencyLvl = petSkills.bakery_efficiency || 0;

    const staffList = bk.staff || [];
    const decorList = bk.decor || [];
    const eff = getEffectiveStats(bk.level, staffList, decorList, bakeryEfficiencyLvl);

    // Tính toán doanh thu lazy
    const est = computeBake({ stock: Number(bk.stock), level: bk.level, lastCollectMs: new Date(bk.last_collect_at).getTime(), customRate: eff.rate, customCap: eff.cap }, Date.now());
    
    // Nhân hệ số từ staff/decor lên doanh thu chờ thu
    const baseInfo = levelInfo(bk.level);
    const estRevenue = est.revenue;

    const note = est.stockLimited ? t(locale, 'commands.tiembanh.status_no_stock')
        : est.capped ? t(locale, 'commands.tiembanh.status_capped')
        : t(locale, 'commands.tiembanh.status_baking');

    // Hiển thị danh sách nhân viên
    const staffNames = staffList.map(sid => {
        const sc = B.STAFF[sid];
        const staffName = t(locale, `commands.tiembanh.staff.${sid}.name`) || (sc ? sc.name : sid);
        return `• ${staffName}`;
    }).join('\n') || t(locale, 'commands.tiembanh.no_staff');

    // Hiển thị danh sách trang trí
    const decorCounts = {};
    decorList.forEach(iid => { decorCounts[iid] = (decorCounts[iid] || 0) + 1; });
    const decorNames = Object.entries(decorCounts).map(([iid, count]) => {
        const itName = t(locale, `data.items.${iid}.name`) || iid;
        return `• ${itName} (x${count})`;
    }).join('\n') || t(locale, 'commands.tiembanh.no_decor');

    const fields = [
        { name: t(locale, 'commands.tiembanh.field_level'), value: t(locale, 'commands.tiembanh.field_level_val', { level: bk.level, max: maxLevel(), rate: eff.rate, baseRate: baseInfo.rate, cap: fmt(eff.cap, locale), currency: C }), inline: false },
        { name: t(locale, 'commands.tiembanh.field_revenue'), value: `**${fmt(estRevenue, locale)}** ${C}`, inline: true },
        { name: t(locale, 'commands.tiembanh.field_stock'), value: `**${fmt(bk.stock, locale)}** ${C}`, inline: true },
        { name: t(locale, 'commands.tiembanh.field_staff'), value: staffNames, inline: true },
        { name: t(locale, 'commands.tiembanh.field_decor'), value: decorNames, inline: true }
    ];

    if (eff.wagePct > 0) {
        fields.push({ name: t(locale, 'commands.tiembanh.field_wage'), value: t(locale, 'commands.tiembanh.field_wage_val', { pct: Math.round(eff.wagePct * 100) }), inline: false });
    }

    if (bk.level < maxLevel()) {
        const nx = B.LEVELS[bk.level];
        fields.push({ name: t(locale, 'commands.tiembanh.field_upgrade'), value: t(locale, 'commands.tiembanh.field_upgrade_val', { level: bk.level + 1, cost: fmt(nx.upCost, locale), currency: C, mats: matStr(nx.mats, locale) }), inline: false });
    }

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        locale,
        title: t(locale, 'commands.tiembanh.title_user', { user: interaction.user.username }), description: note, fields
    })] });
}

// --- mo ---
async function subMo(interaction, locale) {
    const user = await db.getUser(interaction.user.id);
    if (!user) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.title_open'), description: t(locale, 'common.db_error') })] });
    if (getLevelFromExp(Number(user.exp)) < B.MIN_LEVEL) {
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.title_open'), description: t(locale, 'commands.tiembanh.open_low_level', { level: B.MIN_LEVEL }) })] });
    }
    const r = await db.bakeryOpen(interaction.user.id, B.OPEN_COST, B.TOOL);
    const map = {
        has: ['warning', t(locale, 'commands.tiembanh.open_has')],
        no_tool: ['warning', t(locale, 'commands.tiembanh.open_no_tool')],
        poor: ['error', t(locale, 'commands.tiembanh.open_poor', { cost: fmt(B.OPEN_COST, locale), currency: C })],
    };
    if (map[r]) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, map[r][0], { locale, title: t(locale, 'commands.tiembanh.title_open'), description: map[r][1] })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.title_open'), description: t(locale, 'common.generic_error') })] });
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.open_success_title'),
        description: t(locale, 'commands.tiembanh.open_success_desc', { cost: fmt(B.OPEN_COST, locale), currency: C })
    })] });
}

// --- nhapnl <loai> <sl> ---
async function subNhap(interaction, locale) {
    const itemId = (interaction.options.getString('loai') || '').trim();
    const qty = interaction.options.getInteger('sl') || 1;
    const err = (tType, d) => interaction.editReply({ embeds: [buildWaguriEmbed(interaction, tType, { locale, title: t(locale, 'commands.tiembanh.title_nhap'), description: d })] });

    if (!B.FILLINGS.includes(itemId)) return err('warning', t(locale, 'commands.tiembanh.nhap_invalid'));
    if (qty <= 0) return err('warning', t(locale, 'commands.tiembanh.nhap_qty_invalid'));

    const item = await db.getItem(itemId);
    if (!item) return err('error', t(locale, 'common.item_not_found'));
    const gain = fillingStockGain(item.price, qty);
    const r = await db.bakeryStock(interaction.user.id, itemId, qty, gain);
    if (r === 'no_bakery') return err('warning', t(locale, 'commands.tiembanh.nhap_no_bakery'));
    const itemName = t(locale, `data.items.${itemId}.name`) || item.name;
    if (r === 'no_item') return err('warning', t(locale, 'commands.tiembanh.nhap_no_item', { qty, name: itemName }));
    if (r !== 'ok') return err('error', t(locale, 'common.generic_error'));
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.nhap_success_title'),
        description: t(locale, 'commands.tiembanh.nhap_success_desc', { qty, name: itemName, gain: fmt(gain, locale), currency: C })
    })] });
}

// --- thu ---
async function subThu(interaction, locale) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.thu_title'), description: t(locale, 'commands.tiembanh.nhap_no_bakery') })] });
    
    const userPet = await db.getPet(interaction.user.id);
    const petSkills = userPet?.skills || {};
    const bakeryEfficiencyLvl = petSkills.bakery_efficiency || 0;

    const staffList = bk.staff || [];
    const decorList = bk.decor || [];
    const eff = getEffectiveStats(bk.level, staffList, decorList, bakeryEfficiencyLvl);

    const r = await db.bakeryCollectV2(interaction.user.id, eff.rate, eff.cap, eff.cakeEvery, eff.wagePct);
    if (!r || r.result === 'error') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.thu_title'), description: t(locale, 'common.generic_error') })] });
    if (r.result === 'empty') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        locale,
        title: t(locale, 'commands.tiembanh.thu_title'),
        description: Number(bk.stock) <= 0 ? t(locale, 'commands.tiembanh.thu_empty_stock') : t(locale, 'commands.tiembanh.thu_empty_wait')
    })] });

    let cakeMsg = '';
    if (r.cakes > 0) {
        let cakeId = B.CAKE_ITEM;
        let cakeEmoji = '🍓';

        const seasonId = require('../../lib/battlepass').getCurrentSeasonId();
        if (seasonId.startsWith('tet_')) {
            cakeId = 'banh_chung';
            cakeEmoji = '🎍';
        } else if (seasonId.startsWith('trungthu_')) {
            cakeId = 'banh_trung_thu';
            cakeEmoji = '🥮';
        }
        const cakeName = t(locale, `data.items.${cakeId}.name`) || (cakeId === 'banh_chung' ? 'Bánh Chưng' : (cakeId === 'banh_trung_thu' ? 'Bánh Trung Thu' : 'Bánh Kem Dâu Gekka'));

        await db.giveItemAdmin(interaction.user.id, cakeId, r.cakes);
        cakeMsg = t(locale, 'commands.tiembanh.cake_msg', { qty: r.cakes, name: cakeName, emoji: cakeEmoji });
    }
    db.questIncr(interaction.user.id, 'bake', 1);

    const wageMsg = r.wage_deducted > 0 ? t(locale, 'commands.tiembanh.wage_msg', { amount: fmt(r.wage_deducted, locale), currency: C }) : '';
    const cappedWarning = r.capped ? t(locale, 'commands.tiembanh.thu_capped_warning') : '';

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.thu_success_title'),
        description: t(locale, 'commands.tiembanh.thu_success_desc', { revenue: fmt(r.revenue, locale), currency: C, wageMsg, cakeMsg, stockLeft: fmt(r.stock_left, locale), capped: cappedWarning })
    })].setTimestamp() });
}

// --- thue ---
async function subThue(interaction, locale) {
    const staffId = interaction.options.getString('nhan_vien');
    const sc = B.STAFF[staffId];
    if (!sc) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.thue_title'), description: t(locale, 'commands.tiembanh.thue_invalid') })] });

    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.thue_title'), description: t(locale, 'commands.tiembanh.nhap_no_bakery') })] });

    const maxStaff = getMaxStaff(bk.level);
    const r = await db.bakeryHire(interaction.user.id, staffId, sc.cost, maxStaff);
    const staffName = t(locale, `commands.tiembanh.staff.${staffId}.name`) || sc.name;

    const map = {
        already_hired: ['warning', t(locale, 'commands.tiembanh.thue_already', { name: staffName })],
        limit_reached: ['warning', t(locale, 'commands.tiembanh.thue_limit', { level: bk.level, max: maxStaff })],
        poor: ['error', t(locale, 'commands.tiembanh.thue_poor', { cost: fmt(sc.cost, locale), currency: C })],
        no_bakery: ['warning', t(locale, 'commands.tiembanh.nhap_no_bakery')],
    };

    if (map[r]) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, map[r][0], { locale, title: t(locale, 'commands.tiembanh.thue_title'), description: map[r][1] })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.thue_title'), description: t(locale, 'common.generic_error') })] });

    const staffDesc = t(locale, `commands.tiembanh.staff.${staffId}.desc`) || sc.desc;
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.thue_success_title'),
        description: t(locale, 'commands.tiembanh.thue_success_desc', { name: staffName, desc: staffDesc, cost: fmt(sc.cost, locale), currency: C })
    })] });
}

// --- sathai ---
async function subSathai(interaction, locale) {
    const staffId = interaction.options.getString('nhan_vien');
    const sc = B.STAFF[staffId];
    if (!sc) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.sathai_title'), description: t(locale, 'commands.tiembanh.thue_invalid') })] });

    const r = await db.bakeryFire(interaction.user.id, staffId);
    if (r === 'no_bakery') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.sathai_title'), description: t(locale, 'commands.tiembanh.nhap_no_bakery') })] });
    const staffName = t(locale, `commands.tiembanh.staff.${staffId}.name`) || sc.name;
    if (r === 'not_hired') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.sathai_title'), description: t(locale, 'commands.tiembanh.sathai_not_hired', { name: staffName }) })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.sathai_title'), description: t(locale, 'common.generic_error') })] });

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.sathai_success_title'),
        description: t(locale, 'commands.tiembanh.sathai_success_desc', { name: staffName })
    })] });
}

// --- trangtri ---
async function subTrangtri(interaction, locale) {
    const itemId = interaction.options.getString('vat_pham');
    const dc = B.DECOR[itemId];
    if (!dc) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.trangtri_title'), description: t(locale, 'commands.tiembanh.trangtri_invalid') })] });

    const r = await db.bakeryDecorate(interaction.user.id, itemId);
    if (r === 'no_bakery') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.trangtri_title'), description: t(locale, 'commands.tiembanh.nhap_no_bakery') })] });
    const decorName = t(locale, `data.items.${itemId}.name`) || dc.name;
    if (r === 'no_item') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.trangtri_title'), description: t(locale, 'commands.tiembanh.trangtri_no_item', { name: decorName }) })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.trangtri_title'), description: t(locale, 'common.generic_error') })] });

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.trangtri_success_title'),
        description: t(locale, 'commands.tiembanh.trangtri_success_desc', { name: decorName, rate: Math.round(dc.rate * 100) })
    })] });
}

// --- nangcap ---
async function subNangcap(interaction, locale) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.nangcap_title'), description: t(locale, 'commands.tiembanh.nhap_no_bakery') })] });
    if (bk.level >= maxLevel()) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { locale, title: t(locale, 'commands.tiembanh.nangcap_title'), description: t(locale, 'commands.tiembanh.nangcap_max', { level: maxLevel() }) })] });
    const nx = B.LEVELS[bk.level];
    const r = await db.bakeryUpgrade(interaction.user.id, nx.upCost, nx.mats, maxLevel());
    const map = {
        poor: ['error', t(locale, 'commands.tiembanh.nangcap_poor', { level: bk.level + 1, cost: fmt(nx.upCost, locale), currency: C })],
        no_mats: ['warning', t(locale, 'commands.tiembanh.nangcap_no_mats', { mats: matStr(nx.mats, locale) })],
        max: ['info', t(locale, 'commands.tiembanh.nangcap_max', { level: maxLevel() })],
    };
    if (map[r]) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, map[r][0], { locale, title: t(locale, 'commands.tiembanh.nangcap_title'), description: map[r][1] })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, title: t(locale, 'commands.tiembanh.nangcap_title'), description: t(locale, 'common.generic_error') })] });
    const info = levelInfo(bk.level + 1);
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.tiembanh.nangcap_success_title'),
        description: t(locale, 'commands.tiembanh.nangcap_success_desc', { level: bk.level + 1, rate: info.rate, cap: fmt(info.cap, locale), currency: C })
    })] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tiembanh')
        .setDescription('Tiệm Bánh Gekka 🍰 — kinh doanh thụ động')
        .addSubcommand(s => s.setName('xem').setDescription('Xem tình trạng tiệm bánh của cậu'))
        .addSubcommand(s => s.setName('mo').setDescription(`Mở tiệm bánh (cần Lv.${B.MIN_LEVEL} + Bộ Dụng Cụ Làm Bánh)`))
        .addSubcommand(s => s.setName('nhapnl').setDescription('Nhập nguyên liệu (trái/hoa/thịt/cá đã farm) vào tiệm')
            .addStringOption(o => o.setName('loai').setDescription('ID nguyên liệu, vd trai_2000 / thit_heo_2500 / ca_tuoi').setRequired(true))
            .addIntegerOption(o => o.setName('sl').setDescription('Số lượng').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('thu').setDescription('Thu doanh thu tiệm về ví (có thể ra bánh!)'))
        .addSubcommand(s => s.setName('thue').setDescription('Thuê nhân viên NPC phụ tiệm')
            .addStringOption(o => o.setName('nhan_vien').setDescription('Nhân vật muốn thuê')
                .setRequired(true)
                .addChoices(
                    { name: '🧑‍🍳 Rintaro Tsumugi (30.000 VNĐ)', value: 'rintaro' },
                    { name: '👓 Subaru Hoshina (20.000 VNĐ)', value: 'subaru' },
                    { name: '😆 Shohei Usami (15.000 VNĐ)', value: 'usami' },
                    { name: '🤫 Saku Natsui (18.000 VNĐ)', value: 'saku' },
                    { name: '🎯 Ayato Yorita (22.000 VNĐ)', value: 'ayato' },
                    { name: '🌸 Madoka Yano (25.000 VNĐ)', value: 'madoka' }
                )))
        .addSubcommand(s => s.setName('sathai').setDescription('Sa thái nhân viên NPC')
            .addStringOption(o => o.setName('nhan_vien').setDescription('Nhân vật muốn sa thải')
                .setRequired(true)
                .addChoices(
                    { name: '🧑‍🍳 Rintaro Tsumugi', value: 'rintaro' },
                    { name: '👓 Subaru Hoshina', value: 'subaru' },
                    { name: '😆 Shohei Usami', value: 'usami' },
                    { name: '🤫 Saku Natsui', value: 'saku' },
                    { name: '🎯 Ayato Yorita', value: 'ayato' },
                    { name: '🌸 Madoka Yano', value: 'madoka' }
                )))
        .addSubcommand(s => s.setName('trangtri').setDescription('Trang trí tiệm bánh bằng nội thất gỗ / trang sức')
            .addStringOption(o => o.setName('vat_pham').setDescription('Nội thất trang trí')
                .setRequired(true)
                .addChoices(
                    { name: '🪵 Bộ Nội Thất Gỗ (+5% rate)', value: 'noi_that' },
                    { name: '💎 Trang Sức Đá Quý (+6% rate)', value: 'trang_suc' }
                )))
        .addSubcommand(s => s.setName('nangcap').setDescription('Nâng cấp tiệm (tăng tốc nướng & trần doanh thu)')),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        if (sub === 'xem') return subXem(interaction, locale);
        if (sub === 'mo') return subMo(interaction, locale);
        if (sub === 'nhapnl') return subNhap(interaction, locale);
        if (sub === 'thu') return subThu(interaction, locale);
        if (sub === 'thue') return subThue(interaction, locale);
        if (sub === 'sathai') return subSathai(interaction, locale);
        if (sub === 'trangtri') return subTrangtri(interaction, locale);
        if (sub === 'nangcap') return subNangcap(interaction, locale);
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { locale, title: t(locale, 'commands.tiembanh.title'), description: t(locale, 'commands.tiembanh.err_sub') })] });
    },
};
