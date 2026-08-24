const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { sendPaginated } = require('../../lib/paginate');
const db = require('../../database.js');
const config = require('../../config');
const ACH = require('../../data/achievements');
const { getLevelFromExp } = require('../../lib/leveling');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('Xem thành tựu (tự mở khóa khi đủ điều kiện)'),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const userId = interaction.user.id;

        const user = await db.getUser(userId);
        if (!user) return interaction.editReply(t(locale, 'commands.achievements.err_user'));

        const inv = await db.getInventory(userId);
        const bakery = await db.getBakery(userId);
        const pet = await db.getPet(userId);
        const { petLevel } = require('../../data/pets');

        const ctx = {
            level: getLevelFromExp(Number(user.exp)),
            networth: Number(user.wallet) + Number(user.bank),
            jobId: user.job_id,
            items: new Set(inv.map(r => r.item_id)),
            married: !!user.partner_id,
            love: Number(user.love || 0),
            clan: !!user.clan_id,
            premium: !!(user.premium_until && new Date(user.premium_until).getTime() > Date.now()),
            streak: Number(user.daily_streak || 0),
            bakeryLevel: bakery ? Number(bakery.level || 0) : 0,
            petLevel: pet ? petLevel(pet.exp) : 0,
            newbieStep: Number(user.newbie_step || 1),
            affection: Number(user.affection || 0),
        };

        const unlocked = await db.getAchievements(userId);

        // Ứng viên thành tựu vừa đạt điều kiện (theo bản đọc `unlocked` hiện tại).
        let newly = [];
        for (const a of ACH) {
            if (!unlocked.has(a.id) && a.check(ctx)) newly.push(a.id);
        }
        let reward = 0;
        // Khai NGOÀI khối để nhánh dựng thông báo phía dưới đọc được.
        let daTraThuong = true;
        if (newly.length) {
            // CHỈ trao thưởng cho thành tựu THỰC SỰ vừa chèn (RPC trả id đã insert) ->
            // 2 lần gọi /achievements đua nhau không trao thưởng trùng (upsert chỉ chặn trùng row).
            const inserted = new Set(await db.unlockAchievements(userId, newly));
            newly = newly.filter(id => inserted.has(id));
            reward = ACH.reduce((s, a) => inserted.has(a.id) ? s + (a.reward || 0) : s, 0);
            // KIỂM kết quả cộng tiền. Trước đây bỏ qua giá trị trả về, mà `addMoney` trả
            // boolean (`data !== null`, và `false` khi DB lỗi) nên hỏng là phát hiện được.
            //
            // Vì sao quan trọng hơn các chỗ nuốt lỗi khác: thành tựu ĐÃ được ghi nhận ở dòng
            // trên và không mở lại được, nên chạy `/achievements` lần nữa cũng KHÔNG trao lại.
            // Tiền mất VĨNH VIỄN, không có đường đòi — trong khi màn hình vẫn khẳng định
            // "đã nhận X xu". Quy mô: 30 thành tựu, tổng 446.000 xu, mốc lớn nhất 100.000 —
            // gần bằng 1/5 toàn bộ cung tiền của server lúc đo (505.755 xu).
            //
            // Chưa từng xảy ra (đo 24-08: 6 lượt mở khoá / 4 người, 3 lượt sau khi có sổ cái
            // đều có dòng trả tiền khớp giờ). Nhưng nó là lỗi CÂM: nếu xảy ra, không ai biết.
            //
            // ĐÂY CHƯA PHẢI BẢN VÁ ĐỦ. Sửa trọn vẹn cần một RPC làm cả hai việc trong MỘT
            // giao dịch. Chỗ này chỉ ngừng NÓI DỐI, chưa cứu được tiền.
            // KHÔNG đảo thứ tự thành trả-tiền-trước: khi đó cộng tiền xong mà ghi nhận hỏng
            // sẽ cho phép chạy lại và nhận tiền lần nữa — thành máy in tiền, tệ hơn hẳn.
            daTraThuong = reward > 0 ? await db.addMoney(userId, reward, 'wallet') : true;
            newly.forEach(id => unlocked.add(id));
        }

        const lines = [];
        if (newly.length) {
            lines.push(t(locale, 'commands.achievements.newly_unlocked', {
                count: newly.length,
                // Nếu cộng tiền hỏng thì KHÔNG khẳng định đã nhận. Hiện 0 và kèm dòng báo lỗi
                // ngay dưới — thà nói "có trục trặc" còn hơn nói một con số không có thật.
                reward: fmt(daTraThuong ? reward : 0, locale),
                currency: config.CURRENCY
            }));
            if (!daTraThuong) lines.push(t(locale, 'common.retry_later'));
            lines.push('──────────────────────────────');
        }

        ACH.forEach(a => {
            const localizedName = t(locale, `data.achievements.${a.id}.name`) || a.name;
            const localizedDesc = t(locale, `data.achievements.${a.id}.desc`) || a.desc;
            lines.push(unlocked.has(a.id)
                ? `🏅 **${localizedName}** — ${localizedDesc}`
                : `🔒 ${localizedName} — ${localizedDesc} · 🪙 ${fmt(a.reward, locale)}`
            );
        });

        await sendPaginated(interaction, {
            title: t(locale, 'commands.achievements.embed_title'),
            color: config.COLORS.JACKPOT,
            lines,
            perPage: 12,
            footerNote: t(locale, 'commands.achievements.footer_note', {
                unlocked: unlocked.size,
                total: ACH.length
            }),
        });
    },
};
