const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getLevelFromExp } = require('../../lib/leveling');
const { levelInfo, maxLevel, fillingStockGain, computeBake } = require('../../lib/bakery');

const B = config.BAKERY;
const C = config.CURRENCY;
const fmt = n => Number(n || 0).toLocaleString('vi-VN');
const matStr = mats => Object.entries(mats || {}).map(([k, v]) => `${v}× \`${k}\``).join(' + ') || '—';

// --- xem ---
async function subXem(interaction) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', {
        title: '🍰・Tiệm Bánh Gekka',
        description: `Cậu chưa mở tiệm~ Cần **Level ${B.MIN_LEVEL}** + **Bộ Dụng Cụ Làm Bánh Gekka** (mua ở \`/shop\`) rồi gõ \`/tiembanh mo\` (${fmt(B.OPEN_COST)} ${C}) nhé! 🌸`
    })] });

    const info = levelInfo(bk.level);
    const est = computeBake({ stock: Number(bk.stock), level: bk.level, lastCollectMs: new Date(bk.last_collect_at).getTime() }, Date.now());
    const note = est.stockLimited ? '⚠️ Hết nguyên liệu — `/tiembanh nhapnl` để nướng tiếp!'
        : est.capped ? '📦 Két đầy rồi — `/tiembanh thu` để nướng tiếp!'
        : 'Tiệm đang nướng đều đều~ 🧁';
    const fields = [
        { name: '🏅 Cấp tiệm', value: `Lv.${bk.level}/${maxLevel()} · nướng **${info.rate}** ${C}/phút · trần **${fmt(info.cap)}**`, inline: false },
        { name: '💰 Doanh thu chờ thu', value: `**${fmt(est.revenue)}** ${C}`, inline: true },
        { name: '🧺 Kho tiềm năng', value: `**${fmt(bk.stock)}** ${C}`, inline: true },
    ];
    if (bk.level < maxLevel()) {
        const nx = B.LEVELS[bk.level]; // entry cấp kế tiếp
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

    if (!B.FILLINGS.includes(itemId)) return err('warning', `Nguyên liệu không hợp lệ~ Dùng trái/hoa/thịt đã farm hoặc \`ca_tuoi\` (câu cá). Vd: \`/tiembanh nhapnl trai_2000 5\`.`);
    if (qty <= 0) return err('warning', 'Số lượng phải lớn hơn 0 nhé~');

    const item = await db.getItem(itemId);
    if (!item) return err('error', 'Nguyên liệu này không tồn tại~');
    const gain = fillingStockGain(item.price, qty);
    const r = await db.bakeryStock(interaction.user.id, itemId, qty, gain);
    if (r === 'no_bakery') return err('warning', 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` trước nhé.');
    if (r === 'no_item') return err('warning', `Cậu không đủ **${qty}× ${item.name}** trong kho~ Đi farm thêm nhé!`);
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
    const info = levelInfo(bk.level);
    const r = await db.bakeryCollect(interaction.user.id, info.rate, info.cap, B.CAKE_EVERY);
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
    db.questIncr(interaction.user.id, 'bake', 1); // nhiệm vụ (nếu POOL có key 'bake')
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: '🍰・Thu doanh thu tiệm bánh',
        description: `Cậu thu về **+${fmt(r.revenue)}** ${C} từ tiệm! 🧁${cakeMsg}` +
            `\n🧺 Kho còn: **${fmt(r.stock_left)}** ${C}${r.capped ? ' *(két từng đầy — nhớ ghé thu thường xuyên nha!)*' : ''}`
    })] });
}

// --- nangcap ---
async function subNangcap(interaction) {
    const bk = await db.getBakery(interaction.user.id);
    if (!bk) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Nâng cấp', description: 'Cậu chưa mở tiệm~ Gõ `/tiembanh mo` nhé.' })] });
    if (bk.level >= maxLevel()) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { title: '🍰・Nâng cấp', description: `Tiệm đã đạt cấp cao nhất (Lv.${maxLevel()}) rồi — xịn quá đi! 🏆` })] });
    const nx = B.LEVELS[bk.level]; // entry cấp kế tiếp
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
        .setDescription('Tiệm Bánh Gekka 🍰 — kinh doanh thụ động (xem·mo·nhapnl·thu·nangcap)')
        .addSubcommand(s => s.setName('xem').setDescription('Xem tình trạng tiệm bánh của cậu'))
        .addSubcommand(s => s.setName('mo').setDescription(`Mở tiệm bánh (cần Lv.${B.MIN_LEVEL} + Bộ Dụng Cụ Làm Bánh)`))
        .addSubcommand(s => s.setName('nhapnl').setDescription('Nhập nguyên liệu (trái/hoa/thịt/cá đã farm) vào tiệm')
            .addStringOption(o => o.setName('loai').setDescription('ID nguyên liệu, vd trai_2000 / thit_heo_2500 / ca_tuoi').setRequired(true))
            .addIntegerOption(o => o.setName('sl').setDescription('Số lượng').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('thu').setDescription('Thu doanh thu tiệm về ví (có thể ra bánh!)'))
        .addSubcommand(s => s.setName('nangcap').setDescription('Nâng cấp tiệm (tăng tốc nướng & trần doanh thu)')),
    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'xem') return subXem(interaction);
        if (sub === 'mo') return subMo(interaction);
        if (sub === 'nhapnl') return subNhap(interaction);
        if (sub === 'thu') return subThu(interaction);
        if (sub === 'nangcap') return subNangcap(interaction);
        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🍰・Tiệm Bánh Gekka', description: 'Thử `/tiembanh xem`, `mo`, `nhapnl`, `thu`, hoặc `nangcap` nhé~' })] });
    },
};
