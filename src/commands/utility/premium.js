// /premium — TRUNG TÂM ỦNG HỘ. Gộp "ủng hộ tuỳ tâm" và "mua Premium" vào MỘT màn hình.
//
// VÌ SAO GỘP: từ phía người dùng chỉ có một ý định duy nhất — "tôi muốn đưa tiền cho người
// làm bot này". Tách thành hai lệnh là đẩy việc phân loại nội bộ sang cho họ, và với quy mô
// hiện tại (đo 2026-08-21: DAU 40–58) thì hai cánh cửa còn tệ hơn một cánh: chia đôi sự chú
// ý vốn đã ít. Khác biệt giữa hai lối vẫn phải nói RÕ, vì nó là khác biệt về nghĩa vụ:
//   · Premium = giao dịch — có quyền lợi, có hạn dùng, hứa là phải giữ.
//   · Ủng hộ  = quà tặng  — không quyền lợi, không hạn dùng, không có gì để vỡ.
//
// VÌ SAO QR NẰM TRONG DISCORD: đo được 332 người chơi nhưng ĐÚNG 1 lượt đăng nhập web từ
// trước tới nay. Đặt cửa hàng sau một bước OAuth nghĩa là không ai vào. img.vietqr.io trả
// PNG công khai nên embed hiển thị thẳng — không rời Discord bước nào.
//
// Giữ nguyên tên lệnh & KHÔNG thêm option nào -> bề mặt lệnh không đổi, không cần redeploy.
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { daCauHinh } = require('../../lib/vietqr');

const fmt = (n, locale) => Number(n).toLocaleString(String(locale).startsWith('en') ? 'en-US' : 'vi-VN');

/** Dựng màn hình trung tâm ủng hộ. Tách hàm để nút "quay lại" dùng lại được y hệt. */
async function buildHub(interaction, locale) {
    const u = await db.getUser(interaction.user.id);
    const until = u?.premium_until ? new Date(u.premium_until) : null;
    const active = until && until.getTime() > Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const used = (u?.ai_used_date && String(u.ai_used_date).slice(0, 10) === today) ? Number(u.ai_used || 0) : 0;
    const cap = active ? config.AI.PREMIUM_DAILY : config.AI.FREE_DAILY;

    const fields = [
        {
            name: t(locale, 'commands.premium.field_donate'),
            value: t(locale, 'commands.premium.donate_desc', {
                emoji: config.COSMETIC.BADGES[config.PREMIUM.SUPPORTER_BADGE].emoji,
            }),
            inline: false,
        },
        {
            name: t(locale, 'commands.premium.field_premium'),
            value: t(locale, 'commands.premium.premium_desc', {
                ai_quota: config.AI.PREMIUM_DAILY,
                free_quota: config.AI.FREE_DAILY,
                income_bonus: Math.round(config.PREMIUM.INCOME_BONUS * 100),
                prices: Object.entries(config.PREMIUM.PLANS)
                    .map(([key, p]) => `**${t(locale, `commands.premium.plans.${key}`)}** ${fmt(p.amount, locale)}${t(locale, 'commands.premium.currency')}`)
                    .join(' · '),
            }),
            inline: false,
        },
        { name: t(locale, 'commands.premium.field_ai_quota'), value: `${used}/${cap}`, inline: true },
    ];

    // Bảng vinh danh — đây là "phần thưởng" thật của việc ủng hộ tuỳ tâm. Chỉ hiện khi đã
    // có người, để lúc chưa ai ủng hộ thì không phô ra một ô trống buồn thiu.
    const supporters = await db.getSupporters(10);
    if (supporters.length) {
        // Hỏi tên CẢ danh sách cùng lúc. Bản cũ chờ xong người này mới hỏi người kia, mỗi
        // lượt là một vòng gọi Discord — đủ 10 người thì thành ~2 giây chờ vô cớ, trong khi
        // 10 lời hỏi này hoàn toàn độc lập với nhau.
        const lines = await Promise.all(supporters.map(async (s) => {
            const ten = await interaction.client.users.fetch(String(s.user_id))
                .then(u => u.username)
                .catch(() => s.user_id);   // hỏi không ra thì hiện ID, đừng bỏ trống dòng
            return `💝 **${ten}**`;
        }));
        fields.push({ name: t(locale, 'commands.premium.field_supporters'), value: lines.join('\n'), inline: false });
    }

    const embed = buildWaguriEmbed(interaction, active ? 'jackpot' : 'info', {
        locale,
        title: t(locale, 'commands.premium.title'),
        description: active
            ? t(locale, 'commands.premium.hub_desc_active', { time: Math.floor(until.getTime() / 1000) })
            : t(locale, 'commands.premium.hub_desc'),
        fields,
    });

    const rows = [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('pay:donate')
                .setLabel(t(locale, 'commands.premium.btn_donate'))
                .setStyle(ButtonStyle.Success)
                .setEmoji('💝'),
        ),
        new ActionRowBuilder().addComponents(
            ...Object.keys(config.PREMIUM.PLANS).map(key =>
                new ButtonBuilder()
                    .setCustomId(`pay:plan:${key}`)
                    .setLabel(t(locale, `commands.premium.btn_buy_${key}`))
                    .setStyle(key === 'm6' ? ButtonStyle.Primary : ButtonStyle.Secondary)),
        ),
    ];

    return { embeds: [embed], components: daCauHinh() ? rows : [] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Ủng hộ Waguri 💝 hoặc nâng cấp Premium 💎'),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);

        // Chưa cấu hình tài khoản nhận -> nói thẳng, đừng hiện QR rỗng cho người ta quét.
        if (!daCauHinh()) {
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale, description: t(locale, 'commands.premium.not_configured'),
                })],
            });
        }

        return interaction.editReply(await buildHub(interaction, locale));
    },

    // Lộ ra cho handler nút (pay:back) dựng lại đúng màn hình này.
    buildHub,
};
