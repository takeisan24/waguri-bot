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
            // MỘT lời gọi, MỘT giao dịch (RPC của migration 0141).
            //
            // Trước đây chỗ này gọi `db.unlockAchievements()` rồi `db.addMoney()` — hai lời
            // gọi rời nhau. Thành tựu ĐÃ ghi nhận thì không mở lại được, nên chạy
            // `/achievements` lần nữa cũng KHÔNG trao lại: bước hai hỏng là mất tiền VĨNH
            // VIỄN, không có đường đòi. Quy mô: 30 thành tựu, tổng 446.000 xu, mốc lớn nhất
            // 100.000 — gần 1/5 cung tiền server lúc đo (505.755 xu).
            //
            // Nay ghi nhận và cộng tiền nằm trong cùng một hàm plpgsql, nên cộng tiền lỗi thì
            // phần ghi nhận bị CUỘN LẠI và người chơi chạy lại là nhận được. Đã chứng minh
            // trên DB test (24-08) bằng cách buộc bước cộng tiền tràn số bigint: thành tựu
            // không bị ghi.
            //
            // THỨ TỰ TRONG RPC LÀ ghi-nhận-TRƯỚC, cộng-tiền-SAU. Đừng đảo: cộng tiền xong mà
            // ghi nhận hỏng sẽ cho chạy lại và nhận LẦN NỮA — máy in tiền, tệ hơn lỗi đang vá.
            const thuong = {};
            for (const a of ACH) if (newly.includes(a.id)) thuong[a.id] = a.reward || 0;

            const kq = await db.unlockAchievementsWithReward(userId, thuong);
            if (!kq) {
                // `null` = LỖI DB: chưa ghi nhận gì, chưa trả xu nào. Không được khoe thành
                // tựu mới (chúng chưa được ghi), và phải nói có trục trặc để họ chạy lại.
                newly = [];
                daTraThuong = false;
            } else {
                // CHỈ tính thành tựu RPC thực sự chèn được -> hai lời gọi đua nhau không trao
                // thưởng trùng. `paid` là số RPC đã cộng thật, không phải số mình dự tính.
                const inserted = new Set(kq.unlocked);
                newly = newly.filter(id => inserted.has(id));
                reward = Number(kq.paid || 0);
                newly.forEach(id => unlocked.add(id));
            }
        }

        const lines = [];
        // Lỗi DB làm `newly` rỗng, nên khối dưới không chạy. Không có nhánh này thì người
        // chơi tuyệt đối không được biết gì — quay lại đúng lỗi mà `eeeb151` vừa vá.
        if (!daTraThuong && !newly.length) {
            lines.push(t(locale, 'common.retry_later'));
            lines.push('──────────────────────────────');
        }
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
