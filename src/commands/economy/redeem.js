const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

// Chặn dò mã bằng máy. Bộ nhớ trong tiến trình — CỐ Ý, và đây là giới hạn thành thật:
// bot khởi động lại là bộ đếm về 0. Với 469 người và mã dài >=10 ký tự thì đủ; nếu có ngày
// mã bị dò thật thì chuyển xuống DB, đừng tưởng lớp này là tường thành.
const SAI_TOI_DA = 5;
const CUA_SO_MS = 60 * 60 * 1000;
const soLanSai = new Map(); // userId -> { dem, moc }

function biChan(userId) {
    const v = soLanSai.get(userId);
    if (!v) return false;
    if (Date.now() - v.moc > CUA_SO_MS) { soLanSai.delete(userId); return false; }
    return v.dem >= SAI_TOI_DA;
}

function ghiSai(userId) {
    const v = soLanSai.get(userId);
    if (!v || Date.now() - v.moc > CUA_SO_MS) soLanSai.set(userId, { dem: 1, moc: Date.now() });
    else v.dem += 1;
}

// Dọn định kỳ để Map không phình theo thời gian chạy.
setInterval(() => {
    const now = Date.now();
    for (const [k, v] of soLanSai) if (now - v.moc > CUA_SO_MS) soLanSai.delete(k);
}, CUA_SO_MS).unref?.();

// Mỗi trạng thái RPC -> một khoá dịch riêng. Danh sách này phải khớp với 0146_ma_qua.sql;
// cổng `ma_qua_du_chin_trang_thai` suy danh sách TỪ SQL rồi đối chiếu với đây.
const LOI = {
    not_found: 'commands.redeem.not_found',
    not_started: 'commands.redeem.not_started',
    expired: 'commands.redeem.expired',
    used_up: 'commands.redeem.used_up',
    already: 'commands.redeem.already',
    not_for_you: 'commands.redeem.not_for_you',
    account_too_new: 'commands.redeem.account_too_new',
    error: 'commands.redeem.error',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('redeem')
        .setDescription('Đổi mã quà')
        .addStringOption(o => o.setName('code')
            .setDescription('Mã quà cậu nhận được')
            .setRequired(true)
            .setMaxLength(32)),

    async execute(interaction) {
        // Defer TRƯỚC mọi lần chạm DB — 18/81 lệnh từng phạm lỗi này (vá ở 6d67389).
        // Ephemeral: phần thưởng là chuyện riêng, và mã đền bù thì càng không nên khoe.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;

        if (biChan(userId)) {
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.redeem.too_many_tries'),
                })],
            });
        }

        const code = String(interaction.options.getString('code') || '').trim();
        const kq = await db.redeemCode(userId, code);
        const status = kq?.status;

        if (status !== 'ok') {
            // Mã sai/không tồn tại mới tính là "dò"; hết hạn hay đã nhận thì không.
            if (status === 'not_found') ghiSai(userId);
            const khoa = LOI[status] || LOI.error;
            const loai = status === 'error' ? 'error' : 'warning';
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, loai, { description: t(locale, khoa) })],
            });
        }

        // ── Thành công. Chỉ tới đây mới được khoe, và chỉ khoe đúng thứ RPC xác nhận đã trao.
        const rw = kq.rewards || {};
        const dong = [];

        const coins = Number(rw.coins) || 0;
        if (coins > 0) {
            dong.push(t(locale, 'commands.redeem.reward_coins',
                { amount: fmt(coins, locale), currency: config.CURRENCY }));
        }

        const items = Array.isArray(rw.items) ? rw.items : [];
        if (items.length) {
            const kho = await db.getItems();
            const bang = new Map((kho || []).map(i => [i.id, i]));
            for (const it of items) {
                const g = bang.get(it.id);
                // `|| g?.name` bắt buộc: vi.json cố tình không dịch `data.items.*`.
                const ten = t(locale, `data.items.${it.id}.name`) || g?.name || it.id;
                dong.push(t(locale, 'commands.redeem.reward_item',
                    { qty: fmt(Number(it.qty) || 0, locale), name: ten }));
            }
        }

        const days = Number(rw.premium_days) || 0;
        if (days > 0) dong.push(t(locale, 'commands.redeem.reward_premium', { days }));

        return interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'success', {
                description: t(locale, 'commands.redeem.ok', { code: code.toUpperCase() })
                    + (dong.length ? `\n\n${dong.join('\n')}` : ''),
            })],
        });
    },
};
