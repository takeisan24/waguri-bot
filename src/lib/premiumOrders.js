// lib/premiumOrders.js — MỘT nguồn chân lý cho vòng đời đơn Premium sau khi người mua trả tiền.
//
// BỐI CẢNH QUYẾT ĐỊNH THIẾT KẾ: tài khoản nhận tiền là Vietcombank CÁ NHÂN. VCB cá nhân
// không có webhook biến động số dư (SePay/Casso chỉ hỗ trợ VCB cho doanh nghiệp/hộ kinh
// doanh qua VCB OneQR). Nên **duyệt tay là vĩnh viễn**, không phải trạng thái tạm.
//
// Kéo theo: thứ quyết định trải nghiệm không còn là "tự động hay không", mà là **owner
// duyệt nhanh tới đâu**. Vì vậy mọi thứ ở đây tối ưu cho một kịch bản duy nhất:
//   app VCB đẩy push "tiền vào"  →  bot DM owner kèm NÚT  →  owner chạm ✅  →  xong.
// Không gõ lệnh, không mở web, làm được từ điện thoại trong lúc đi đường.
//
// Vì sao là file riêng: cùng một thao tác "duyệt + cảm ơn người mua" trước đây nằm rải ở
// 3 chỗ (lệnh /premium-admin, webhook cổng thanh toán, trang admin web), mỗi chỗ một bản
// chép tay. Ba bản là ba cơ hội để lệch nhau — và lệch ở đây nghĩa là có người trả tiền
// mà không được cảm ơn, hoặc được cộng hạn hai lần.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../database.js');
const { buildWaguriEmbed } = require('./embed');
const { getInteractionLanguage, t } = require('./i18n');
const { getOwnerIds } = require('./owner');
const { logError } = require('./logger');
const config = require('../config');

const fmtVnd = (n, locale) => Number(n).toLocaleString(String(locale).startsWith('en') ? 'en-US' : 'vi-VN');

/** DM cảm ơn người mua sau khi Premium được kích hoạt. Im lặng nếu họ tắt DM. */
async function dmPremiumThanks(client, r) {
    try {
        const user = await client.users.fetch(String(r.user_id));
        const until = r.until ? Math.floor(new Date(r.until).getTime() / 1000) : null;
        // DM không có guild -> getInteractionLanguage rơi xuống users.locale trong DB.
        const locale = await getInteractionLanguage({ user: { id: String(r.user_id) } });
        await user.send(t(locale, 'lib.voteServer.dm_premium_thanks', {
            months: r.months,
            until: until ? t(locale, 'lib.voteServer.dm_premium_until', { time: until }) : '',
        }));
        return true;
    } catch {
        return false; // người mua tắt DM -> không phải lỗi, nhưng caller cần biết để nói với owner
    }
}

/** DM cảm ơn người ỦNG HỘ. Khác lời cảm ơn Premium: không hứa hẹn quyền lợi nào cả. */
async function dmDonationThanks(client, r) {
    try {
        const user = await client.users.fetch(String(r.user_id));
        const locale = await getInteractionLanguage({ user: { id: String(r.user_id) } });
        await user.send(t(locale, 'lib.premiumOrders.dm_donate_thanks', {
            amount: Number(r.amount) > 0 ? fmtVnd(r.amount, locale) : '',
        }));
        return true;
    } catch {
        return false;
    }
}

/**
 * Duyệt 1 đơn theo mã RỒI cảm ơn người trả tiền. Idempotent (RPC tự chặn cấp lần 2).
 *
 * TỰ ĐỊNH TUYẾN theo `kind` của đơn. Đây là chỗ quan trọng: cùng một nút "✅ Kích hoạt"
 * trong DM phục vụ cả hai loại đơn, nên nếu định tuyến sai thì người ủng hộ bị cấp Premium
 * (hoặc ngược lại) mà không ai phát hiện. Hai RPC ở migration 0131 còn chặn chéo lẫn nhau
 * một lần nữa ở tầng DB — thắt lưng và dây đeo quần, vì đây là tiền thật.
 *
 * @returns {{ok:boolean, already?:boolean, reason?:string, kind?:string, user_id?:string,
 *            months?:number, until?:string, amount?:number, dmSent?:boolean}}
 */
async function approveAndThank(client, code, ref) {
    const order = await db.getPremiumOrder(code);
    if (!order) return { ok: false, reason: 'not_found' };

    if (order.kind === 'donate') {
        const r = await db.approveDonation(code, ref, config.PREMIUM.SUPPORTER_BADGE);
        if (!r?.ok || r.already) return { ...(r || { ok: false, reason: 'db_error' }), kind: 'donate' };
        const dmSent = await dmDonationThanks(client, r);
        return { ...r, kind: 'donate', dmSent };
    }

    const r = await db.approvePremiumOrder(code, ref);
    if (!r?.ok || r.already) return { ...(r || { ok: false, reason: 'db_error' }), kind: 'premium' };
    const dmSent = await dmPremiumThanks(client, r);
    return { ...r, kind: 'premium', dmSent };
}

/**
 * Người mua vừa bấm "Tôi đã chuyển khoản" -> DM MỌI owner kèm nút duyệt một chạm.
 *
 * DM chứ không phải kênh log: DM đẩy push notification lên điện thoại, kênh log thì không
 * (và kênh log thường bị tắt thông báo vì nó ồn). Đơn hàng thì hiếm — đúng loại việc đáng
 * được rung máy.
 */
async function notifyOwnersOfClaim(client, code) {
    const order = await db.getPremiumOrder(code);
    if (!order) return { ok: false, reason: 'not_found' };
    if (order.status === 'paid') return { ok: true, already: true };

    const ids = await getOwnerIds(client);
    if (!ids || !ids.size) return { ok: false, reason: 'no_owner' };

    let daGui = 0;
    for (const ownerId of ids) {
        try {
            const locale = await getInteractionLanguage({ user: { id: String(ownerId) } });
            let tenNguoiMua = order.user_id;
            try { tenNguoiMua = (await client.users.fetch(String(order.user_id))).username; } catch { /* không lấy được tên -> dùng ID */ }

            // Hai loại đơn -> hai lời nhắc khác nhau, vì việc owner phải làm cũng khác:
            // đơn Premium phải khớp ĐÚNG số tiền; đơn ủng hộ thì bao nhiêu cũng nhận.
            const laDonate = order.kind === 'donate';
            const embed = buildWaguriEmbed({ client }, 'jackpot', {
                locale,
                title: t(locale, laDonate ? 'lib.premiumOrders.claim_donate_title' : 'lib.premiumOrders.claim_title'),
                description: t(locale, laDonate ? 'lib.premiumOrders.claim_donate_desc' : 'lib.premiumOrders.claim_desc', {
                    code,
                    amount: Number(order.amount) > 0
                        ? `${fmtVnd(order.amount, locale)}đ`
                        : t(locale, 'lib.premiumOrders.amount_freeform'),
                    months: order.months,
                    plan: order.plan,
                    name: tenNguoiMua,
                    user: order.user_id,
                }),
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`padm:ok:${code}`)
                    .setLabel(t(locale, laDonate ? 'lib.premiumOrders.btn_approve_donate' : 'lib.premiumOrders.btn_approve'))
                    .setStyle(ButtonStyle.Success),
            );

            const owner = await client.users.fetch(String(ownerId));
            await owner.send({ embeds: [embed], components: [row] });
            daGui++;
        } catch (e) {
            // Owner tắt DM là lỗi VẬN HÀNH thật (mất kênh báo đơn), không nuốt im lặng.
            logError('premium claim DM owner', e, { user: String(ownerId) });
        }
    }
    return { ok: daGui > 0, sent: daGui };
}

module.exports = { dmPremiumThanks, dmDonationThanks, approveAndThank, notifyOwnersOfClaim };
