const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getLevelFromExp } = require('../../lib/leveling');
const { levelInfo, maxLevel, fillingStockGain, computeBake, getEffectiveStats } = require('../../lib/bakery');

const B = config.BAKERY;
const C = config.CURRENCY;
const fmt = n => Number(n || 0).toLocaleString('vi-VN');
const matStr = mats => Object.entries(mats || {}).map(([k, v]) => `${v}× \`${k}\``).join(' + ') || '—';

// Giới hạn số lượng nhân viên tối đa theo cấp tiệm
function getMaxStaff(level) {
    return level >= 4 ? 3 : (level >= 2 ? 2 : 1);
}

// --- xem ---
async function subXem(interaction) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        title: '🍰・Tiệm Bánh Gekka',
        description: `Cậu chưa mở tiệm~ Cần **Level ${B.MIN_LEVEL}** + **Bộ Dụng Cụ Làm Bánh Gekka** (mua ở \`/shop\`) rồi gõ \`/tiembanh mo\` (${fmt(B.OPEN_COST)} ${C}) nhé! 🌸`
    })] });

    const staffList = bk.staff || [];
    const decorList = bk.decor || [];
    const eff = getEffectiveStats(bk.level, staffList, decorList);

    // Tính toán doanh thu lazy
    const est = computeBake({ stock: Number(bk.stock), level: bk.level, lastCollectMs: new Date(bk.last_collect_at).getTime() }, Date.now());
    
    // Nhân hệ số từ staff/decor lên doanh thu chờ thu
    const baseInfo = levelInfo(bk.level);
    const rateMult = eff.rate / baseInfo.rate;
    const estRevenue = Math.round(est.revenue * rateMult);

    const note = est.stockLimited ? '⚠️ Hết nguyên liệu — `/tiembanh nhapnl` để nướng tiếp!'
        : est.capped ? '📦 Két đầy rồi — `/tiembanh thu` để nướng tiếp!'
        : 'Tiệm đang nướng đều đều~ 🧁';

    // Hiển thị danh sách nhân viên
    const staffNames = staffList.map(sid => {
        const sc = B.STAFF[sid];
        return sc ? `• ${sc.name}` : `• ${sid}`;
    }).join('\n') || '*Chưa thuê ai*';

    // Hiển thị danh sách trang trí
    const decorCounts = {};
    decorList.forEach(iid => { decorCounts[iid] = (decorCounts[iid] || 0) + 1; });
    const decorNames = Object.entries(decorCounts).map(([iid, count]) => {
        const dc = B.DECOR[iid];
        return dc ? `• ${dc.name} (x${count})` : `• ${iid} (x${count})`;
    }).join('\n') || '*Chưa trang trí*';

    const fields = [
        { name: '🏅 Cấp tiệm', value: `Lv.${bk.level}/${maxLevel()} · nướng **${eff.rate}** ${C}/phút (gốc ${baseInfo.rate}) · trần **${fmt(eff.cap)}** ${C}`, inline: false },
        { name: '💰 Doanh thu chờ thu', value: `**${fmt(estRevenue)}** ${C}`, inline: true },
        { name: '🧺 Kho tiềm năng', value: `**${fmt(bk.stock)}** ${C}`, inline: true },
        { name: '👥 Nhân viên', value: staffNames, inline: true },
        { name: '🌸 Trang trí', value: decorNames, inline: true }
    ];

    if (eff.wagePct > 0) {
        fields.push({ name: '💸 Lương nhân viên khấu trừ', value: `Khấu trừ **${Math.round(eff.wagePct * 100)}%** tổng doanh thu khi thu hoạch.`, inline: false });
    }

    if (bk.level < maxLevel()) {
        const nx = B.LEVELS[bk.level];
        fields.push({ name: '⬆️ Nâng cấp', value: `Lv.${bk.level + 1}: **${fmt(nx.upCost)}** ${C} + ${matStr(nx.mats)} → \`/tiembanh nangcap\``, inline: false });
    }

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        title: '🍰・Tiệm Bánh Gekka của cậu', description: note, fields
    })] });
}

// --- mo ---
async function subMo(interaction) {
    const user = await db.getUser(interaction.user.id);
    if (!user) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Mở tiệm', description: 'Hơ, lỗi dữ liệu, thử lại sau nhé~ 🌸' })] });
    if (getLevelFromExp(Number(user.exp)) < B.MIN_LEVEL) {
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Mở tiệm', description: `Cần đạt **Level ${B.MIN_LEVEL}** mới mở tiệm được nha~ Cày thêm \`/work\` nhé! 🌸` })] });
    }
    const r = await db.bakeryOpen(interaction.user.id, B.OPEN_COST, B.TOOL);
    const map = {
        has: ['warning', 'Cậu đã có tiệm rồi mà~ Gõ `/tiembanh xem` nhé.'],
        no_tool: ['warning', 'Cậu cần **Bộ Dụng Cụ Làm Bánh Gekka** (mua ở `/shop`, 8.000) để mở tiệm nhé~ 🧰'],
        poor: ['error', `Cần **${fmt(B.OPEN_COST)}** ${C} để mở tiệm~ Làm thêm với \`/work\` nhé!`],
    };
    if (map[r]) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, map[r][0], { title: '🍰・Mở tiệm', description: map[r][1] })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Mở tiệm', description: 'Ơ, có lỗi khi mở tiệm, thử lại sau nhé~ 🌸' })] });
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🍰・Khai trương Tiệm Bánh Gekka!',
        description: `Chúc mừng cậu đã mở tiệm bánh của riêng mình (−${fmt(B.OPEN_COST)} ${C})! 🎉🧁\nNhập nguyên liệu bằng \`/tiembanh nhapnl\` (trái/hoa/thịt/cá đã farm) rồi \`/tiembanh thu\` gom doanh thu nha~ 🌸`
    })] });
}

// --- nhapnl <loai> <sl> ---
async function subNhap(interaction) {
    const itemId = (interaction.options.getString('loai') || '').trim();
    const qty = interaction.options.getInteger('sl') || 1;
    const err = (t, d) => interaction.editReply({ embeds: [buildWaguriEmbed(interaction, t, { title: '🍰・Nhập nguyên liệu', description: d })] });

    if (!B.FILLINGS.includes(itemId)) return err('warning', `Nguyên liệu không hợp lệ~ Dùng trái/hoa/thịt đã farm hoặc cá tươi/ngon/hiếm. Vd: \`/tiembanh nhapnl ca_ngon 5\`.`);
    if (qty <= 0) return err('warning', 'Số lượng phải lớn hơn 0 nhé~');

    const item = await db.getItem(itemId);
    if (!item) return err('error', 'Nguyên liệu này không tồn tại~');
    const gain = fillingStockGain(item.price, qty);
    const r = await db.bakeryStock(interaction.user.id, itemId, qty, gain);
    if (r === 'no_bakery') return err('warning', 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` trước nhé.');
    if (r === 'no_item') return err('warning', `Cậu không đủ **${qty}× ${item.name}** trong kho~ Đi câu cá hoặc farm thêm nhé!`);
    if (r !== 'ok') return err('error', 'Ơ, có lỗi khi nhập nguyên liệu, thử lại sau nhé~');
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🍰・Đã nhập nguyên liệu',
        description: `Cho vào bếp **${qty}× ${item.name}** → +**${fmt(gain)}** ${C} kho tiềm năng! 🧺\nTiệm sẽ nướng dần — gõ \`/tiembanh thu\` gom doanh thu nha~ 🌸`
    })] });
}

// --- thu ---
async function subThu(interaction) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Thu doanh thu', description: 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` nhé.' })] });
    
    const staffList = bk.staff || [];
    const decorList = bk.decor || [];
    const eff = getEffectiveStats(bk.level, staffList, decorList);

    const r = await db.bakeryCollectV2(interaction.user.id, eff.rate, eff.cap, eff.cakeEvery, eff.wagePct);
    if (!r || r.result === 'error') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Thu doanh thu', description: 'Ơ, có lỗi khi thu, thử lại sau nhé~ 🌸' })] });
    if (r.result === 'empty') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        title: '🍰・Thu doanh thu',
        description: `Chưa có gì để thu~ ${Number(bk.stock) <= 0 ? 'Kho hết nguyên liệu — `/tiembanh nhapnl` nhé!' : 'Chờ tiệm nướng thêm chút đã nha~'} 🌸`
    })] });

    let cakeMsg = '';
    if (r.cakes > 0) {
        await db.giveItemAdmin(interaction.user.id, B.CAKE_ITEM, r.cakes);
        cakeMsg = `\n🍓 Tiệm ra lò **${r.cakes}× Bánh Kem Dâu Gekka**! (vào kho — /eat nhận buff hoặc tặng người thương 💕)`;
    }
    db.questIncr(interaction.user.id, 'bake', 1);

    const wageMsg = r.wage_deducted > 0 ? `\n💸 Lương nhân viên trả: **-${fmt(r.wage_deducted)}** ${C} *(đã trừ vào doanh thu)*` : '';

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🍰・Thu doanh thu tiệm bánh',
        description: `Cậu thu về **+${fmt(r.revenue)}** ${C} net từ tiệm! 🧁${wageMsg}${cakeMsg}` +
            `\n🧺 Kho còn: **${fmt(r.stock_left)}** ${C}${r.capped ? ' *(két từng đầy — nhớ ghé thu thường xuyên nha!)*' : ''}`
    })].setTimestamp() });
}

// --- thue ---
async function subThue(interaction) {
    const staffId = interaction.options.getString('nhan_vien');
    const sc = B.STAFF[staffId];
    if (!sc) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Thuê nhân viên', description: 'Nhân viên không hợp lệ 🤔' })] });

    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Thuê nhân viên', description: 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` nhé.' })] });

    const maxStaff = getMaxStaff(bk.level);
    const r = await db.bakeryHire(interaction.user.id, staffId, sc.cost, maxStaff);

    const map = {
        already_hired: ['warning', `Cậu đã thuê **${sc.name}** rồi mà~`],
        limit_reached: ['warning', `Tiệm cấp **Lv.${bk.level}** chỉ thuê được tối đa **${maxStaff}** nhân viên. Nâng cấp tiệm để tuyển thêm nhé!`],
        poor: ['error', `Cần **${fmt(sc.cost)}** ${C} để thuê nhân viên này~ Làm thêm với \`/work\` nhé!`],
        no_bakery: ['warning', 'Cậu chưa mở tiệm bánh~'],
    };

    if (map[r]) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, map[r][0], { title: '🍰・Thuê nhân viên', description: map[r][1] })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Thuê nhân viên', description: 'Ơ, có lỗi xảy ra, thử lại sau nhé~' })] });

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🎉・Tuyển dụng nhân viên mới!',
        description: `Chúc mừng cậu đã thuê thành công **${sc.name}** vào làm việc!\n${sc.desc}\nVí bị trừ **-${fmt(sc.cost)}** ${C} phí thuê một lần.`
    })] });
}

// --- sathai ---
async function subSathai(interaction) {
    const staffId = interaction.options.getString('nhan_vien');
    const sc = B.STAFF[staffId];
    if (!sc) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Sa thải nhân viên', description: 'Nhân viên không hợp lệ 🤔' })] });

    const r = await db.bakeryFire(interaction.user.id, staffId);
    if (r === 'no_bakery') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Sa thải nhân viên', description: 'Cậu chưa có tiệm bánh~' })] });
    if (r === 'not_hired') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Sa thải nhân viên', description: `Cậu có thuê **${sc.name}** đâu mà sa thải~` })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Sa thải nhân viên', description: 'Ơ, có lỗi xảy ra, thử lại sau nhé~' })] });

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '💨・Đã sa thải nhân viên',
        description: `Cậu đã sa thải **${sc.name}** khỏi tiệm bánh Gekka. Mong là cậu ấy sớm tìm được việc mới~`
    })] });
}

// --- trangtri ---
async function subTrangtri(interaction) {
    const itemId = interaction.options.getString('vat_pham');
    const dc = B.DECOR[itemId];
    if (!dc) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Trang trí tiệm', description: 'Đồ trang trí không hợp lệ 🤔' })] });

    const r = await db.bakeryDecorate(interaction.user.id, itemId);
    if (r === 'no_bakery') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Trang trí tiệm', description: 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` nhé.' })] });
    if (r === 'no_item') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Trang trí tiệm', description: `Cậu không có sẵn **${dc.name}** trong kho đồ. Hãy mua ở \`/shop\` hoặc chế tạo ở \`/craft\` trước nhé~` })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Trang trí tiệm', description: 'Ơ, có lỗi xảy ra, thử lại sau nhé~' })] });

    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🌸・Đã trang trí tiệm bánh!',
        description: `Đã đưa 1× **${dc.name}** vào tiệm bánh của cậu. Cảnh quan đẹp hơn giúp tiệm nướng bánh hiệu quả thêm **+${Math.round(dc.rate * 100)}%**!`
    })] });
}

// --- nangcap ---
async function subNangcap(interaction) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Nâng cấp', description: 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` nhé.' })] });
    if (bk.level >= maxLevel()) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { title: '🍰・Nâng cấp', description: `Tiệm đã đạt cấp cao nhất (Lv.${maxLevel()}) rồi — xịn quá đi! 🏆` })] });
    const nx = B.LEVELS[bk.level];
    const r = await db.bakeryUpgrade(interaction.user.id, nx.upCost, nx.mats, maxLevel());
    const map = {
        poor: ['error', `Cần **${fmt(nx.upCost)}** ${C} để nâng lên Lv.${bk.level + 1}~`],
        no_mats: ['warning', `Cậu thiếu vật liệu: cần ${matStr(nx.mats)} (chế ở \`/craft\`)~`],
        max: ['info', 'Tiệm đã đạt cấp cao nhất rồi~ 🏆'],
    };
    if (map[r]) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, map[r][0], { title: '🍰・Nâng cấp', description: map[r][1] })] });
    if (r !== 'ok') return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title: '🍰・Nâng cấp', description: 'Ơ, có lỗi khi nâng cấp, thử lại sau nhé~ 🌸' })] });
    const info = levelInfo(bk.level + 1);
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🍰・Nâng cấp thành công!',
        description: `Tiệm lên **Lv.${bk.level + 1}**! Giờ nướng **${info.rate}** ${C}/phút · trần **${fmt(info.cap)}** ${C}. Càng ngày càng đông khách~ 🎉🧁`
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
        .addSubcommand(s => s.setName('sathai').setDescription('Sa thải nhân viên NPC')
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
        const sub = interaction.options.getSubcommand();
        if (sub === 'xem') return subXem(interaction);
        if (sub === 'mo') return subMo(interaction);
        if (sub === 'nhapnl') return subNhap(interaction);
        if (sub === 'thu') return subThu(interaction);
        if (sub === 'thue') return subThue(interaction);
        if (sub === 'sathai') return subSathai(interaction);
        if (sub === 'trangtri') return subTrangtri(interaction);
        if (sub === 'nangcap') return subNangcap(interaction);
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Tiệm Bánh Gekka', description: 'Thử `/tiembanh xem`, `mo`, `nhapnl`, `thu`, hoặc `nangcap` nhé~' })] });
    },
};
