// ============================================================
// src/lib/levelAnnounce.js — Waguri lên tiếng khi ai đó lên cấp NHỜ CHAT.
//
// VÌ SAO CÓ: `grantChatReward` (messageCreate.js) cộng xu + EXP mỗi tin nhắn rồi VỨT LUÔN
// giá trị trả về của `db.updateExp()`, nên không ai từng được báo là mình lên cấp.
// `levelUpReward()` chỉ được gọi ở `work.js:285` và `gather.js:193` — tức chỉ người đã tìm
// ra `/work` mới biết mình có cấp độ.
//
// Đo 2026-08-21 trên prod: 91/332 người ĐÃ từng lên cấp mà chưa từng nghe bot nói một câu;
// 317 người có chat nhưng chỉ 30 người từng gõ `/work`. Đây không phải tính năng còn thiếu
// mà là phần thưởng đã trả rồi nhưng quên không nói.
//
// KHÔNG tốn thêm truy vấn DB: `updateExp` vốn đã trả về EXP mới, trừ ngược phần vừa cộng
// là ra EXP cũ — đủ để so hai cấp.
//
// KHÔNG dùng `buildWaguriEmbed`: hàm đó LUÔN gắn một ảnh lớn (`image || typeImg`, không có
// đường tắt). Chèn ảnh cỡ lớn vào giữa cuộc trò chuyện của người ta mỗi lần lên cấp là đúng
// cách để bị admin tắt. Một dòng nhắn gọn hợp giọng bạn đồng hành hơn và không chiếm chỗ.
// ============================================================
const { getLevelFromExp } = require('./leveling');
const { levelUpEnabled } = require('./guildflags');
const { getInteractionLanguage, t, detectVietnamese } = require('./i18n');

// Cấp nào đáng báo: mọi cấp từ 2 đến 5, sau đó thưa dần còn mỗi 5 cấp.
// Cấp thấp báo hết vì đó là cửa sổ kích hoạt — người mới cần biết bot có gì. Cấp cao thưa
// lại vì đường cong `100*(L-1)²` đã tự giãn ra rồi, báo dày nữa thì thành ồn.
function shouldAnnounce(level) {
    if (level < 2) return false;
    if (level <= 5) return true;
    return level % 5 === 0;
}

/**
 * Nhảy nhiều cấp một lúc thì chỉ báo MỘT lần, lấy cấp mới nhất — nhưng chỉ báo khi có ít
 * nhất một cấp vừa vượt qua là cấp đáng báo. Không thể chỉ xét `newLevel`: nhảy từ 4 lên 6
 * thì `shouldAnnounce(6)` sai, mà bỏ qua thì người ta vượt cấp 5 trong im lặng.
 * @returns {number|null} cấp để báo, hoặc null nếu không có gì để báo.
 */
function pickAnnounceLevel(oldLevel, newLevel) {
    if (newLevel <= oldLevel) return null;
    for (let L = oldLevel + 1; L <= newLevel; L++) {
        if (shouldAnnounce(L)) return newLevel;
    }
    return null;
}

// Mỗi mốc dạy ĐÚNG MỘT việc. Chúc mừng suông là phí mất điểm chạm duy nhất với nhóm người
// chưa từng gõ lệnh nào — nhồi ba gợi ý một lúc thì họ không nhớ cái nào.
function ctaKeyFor(level) {
    if (level === 2) return 'common.levelup.cta_daily';
    if (level === 3) return 'common.levelup.cta_profile';
    if (level === 5) return 'common.levelup.cta_work';
    return null;
}

/**
 * Báo lên cấp cho đường CHAT. Tự nuốt mọi lỗi — thưởng chat là fire-and-forget, không được
 * phép làm vỡ luồng tin nhắn.
 * @param {import('discord.js').Message} message tin nhắn vừa kích hoạt phần thưởng
 * @param {number|null} newExp EXP mới do `updateExp` trả về (null = DB lỗi)
 * @param {number} gained số EXP vừa cộng
 */
async function announceLevelUp(message, newExp, gained) {
    if (newExp === null || newExp === undefined) return;   // DB lỗi -> im, đừng đoán
    if (!Number.isFinite(newExp) || !Number.isFinite(gained) || gained <= 0) return;

    const level = pickAnnounceLevel(getLevelFromExp(newExp - gained), getLevelFromExp(newExp));
    if (level === null) return;

    // Kiểm cờ SAU khi đã biết chắc có gì để báo -> không tốn truy vấn cho mỗi tin nhắn.
    if (!(await levelUpEnabled(message.guildId))) return;

    const locale = await getInteractionLanguage({
        guildId: message.guildId,
        user: message.author,
        locale: detectVietnamese(message.content) || undefined,
        guildLocale: message.guild?.preferredLocale,
    });

    const cta = ctaKeyFor(level);
    const content = t(locale, 'common.levelup.text', { level })
        + (cta ? '\n' + t(locale, cta) : '');

    // `parse: []` chặn MỌI ping, `repliedUser: false` chặn ping do chính việc trả lời sinh ra.
    // Bot tự ý ping giữa cuộc trò chuyện là lý do đủ để bị tắt.
    //
    // Nuốt lỗi tại chỗ (tin nhắn gốc bị xoá, bot thiếu quyền gửi ở kênh đó...): lời chúc mừng
    // hụt một lần thì không sao, nhưng để nó ném ngược ra thì đường thưởng chat mang theo một
    // promise bị từ chối chỉ vì chuyện trang trí.
    await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } })
        .catch(() => {});
}

module.exports = { announceLevelUp, shouldAnnounce, pickAnnounceLevel, ctaKeyFor };
