// lib/payButtons.js — xử lý các nút của /premium: tạo đơn -> hiện QR -> người trả tiền tự báo.
//
// Toàn bộ luồng nằm TRONG Discord vì đo được (2026-08-21) chỉ 1/332 người từng đăng nhập web.
// Sau khi người dùng bấm "Tôi đã chuyển khoản", việc còn lại đi qua đúng đường ống đã có:
// `notifyOwnersOfClaim` DM owner kèm nút ✅, owner chạm là xong. Không có webhook ngân hàng
// nào cả (VCB cá nhân không hỗ trợ) — nên tốc độ duyệt phụ thuộc owner, và mọi lời lẽ ở đây
// phải nói đúng điều đó thay vì hứa "tự động".
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../database.js');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { t } = require('./i18n');
const { vietqrUrl, thongTinNganHang } = require('./vietqr');
const { notifyOwnersOfClaim } = require('./premiumOrders');
const { logError } = require('./logger');

const fmt = (n, locale) => Number(n).toLocaleString(String(locale).startsWith('en') ? 'en-US' : 'vi-VN');

/** Màn hình QR + hướng dẫn. Dùng chung cho cả ủng hộ lẫn mua Premium. */
function buildQrScreen(interaction, locale, order, laDonate) {
    const nh = thongTinNganHang();
    const soTien = Number(order.amount) > 0
        ? `${fmt(order.amount, locale)}${t(locale, 'commands.premium.currency')}`
        : t(locale, 'commands.premium.amount_freeform');

    const embed = buildWaguriEmbed(interaction, 'info', {
        locale,
        title: t(locale, laDonate ? 'commands.premium.qr_donate_title' : 'commands.premium.qr_premium_title'),
        description: t(locale, 'commands.premium.qr_desc', { code: order.code }),
        // Ảnh QR là thứ chính của màn này -> để ở `image` (to, quét được bằng máy khác).
        image: vietqrUrl(order.code, order.amount),
        fields: [
            { name: t(locale, 'commands.premium.qr_bank'), value: nh.bank, inline: true },
            { name: t(locale, 'commands.premium.qr_account'), value: `\`${nh.account}\``, inline: true },
            ...(nh.holder ? [{ name: t(locale, 'commands.premium.qr_holder'), value: nh.holder, inline: true }] : []),
            { name: t(locale, 'commands.premium.qr_amount'), value: soTien, inline: true },
            // Nội dung CK là thứ DUY NHẤT giúp owner biết tiền của ai -> phải nổi bật nhất.
            { name: t(locale, 'commands.premium.qr_memo'), value: `\`\`\`${order.code}\`\`\``, inline: false },
        ],
    });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pay:claim:${order.code}`)
            .setLabel(t(locale, 'commands.premium.btn_claimed'))
            .setStyle(ButtonStyle.Success),
    );

    return { embeds: [embed], components: [row] };
}

/**
 * Định tuyến mọi nút `pay:*`.
 * @returns {boolean} true nếu đã xử lý (caller dừng lại).
 */
async function handlePayButton(interaction, locale) {
    const id = interaction.customId;
    if (!id.startsWith('pay:')) return false;

    // Màn QR & báo đã CK đều là chuyện RIÊNG của từng người -> ephemeral. Nút nằm trên tin
    // nhắn /premium công khai (ai bấm cũng được, đúng ý đồ), nhưng đơn thì của riêng người bấm.
    const userId = interaction.user.id;

    // --- Ủng hộ tuỳ tâm: KHÔNG ghim số tiền, người ủng hộ tự điền trong app ngân hàng ---
    if (id === 'pay:donate') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const order = await db.createDonationOrder(userId, 0);
        if (!order?.code) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'commands.premium.order_failed') })] });
        }
        return interaction.editReply(buildQrScreen(interaction, locale, order, true));
    }

    // --- Mua Premium: ghim đúng giá gói ---
    if (id.startsWith('pay:plan:')) {
        const planId = id.slice('pay:plan:'.length);
        const plan = config.PREMIUM.PLANS[planId];
        if (!plan) return true; // gói lạ (config đã đổi) -> im lặng bỏ qua
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const order = await db.createPremiumOrder(userId, planId, plan.months, plan.amount);
        if (!order?.code) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'commands.premium.order_failed') })] });
        }
        return interaction.editReply(buildQrScreen(interaction, locale, order, false));
    }

    // --- "Tôi đã chuyển khoản" -> đánh dấu & DM owner kèm nút duyệt ---
    if (id.startsWith('pay:claim:')) {
        const code = id.slice('pay:claim:'.length);
        await interaction.deferUpdate();

        // `claimOrderOnce` chỉ đổi được MỘT LẦN và chỉ bởi CHỦ đơn -> bấm lại không phiền
        // owner thêm lần nữa, và người khác không báo hộ đơn của người ta được.
        const daBao = await db.claimOrderOnce(code, userId);
        if (!daBao) {
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'warning', { locale, description: t(locale, 'commands.premium.claim_already') })],
                components: [],
            });
        }

        // Báo owner ở chế độ nền: người trả tiền không nên phải chờ Discord API của owner.
        notifyOwnersOfClaim(interaction.client, code).catch(e => logError('pay:claim notify', e, { user: userId }));

        return interaction.editReply({
            embeds: [buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.premium.claim_ok_title'),
                description: t(locale, 'commands.premium.claim_ok_desc', { code }),
            })],
            components: [],
        });
    }

    return true;
}

module.exports = { handlePayButton, buildQrScreen };
