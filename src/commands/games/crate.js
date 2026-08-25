const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { gamblingEnabled } = require('../../lib/guildflags');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const COMMON = ['banh_mi', 'ca_phe', 'xoi', 'soda_gekka'];
const GOOD = ['the_sinh_vien', 'mu_noi', 'hop_but', 'bo_lam_banh'];
const RARE = ['dong_ho_saku', 'xe_wave', 'laptop'];
const rpick = a => a[Math.floor(Math.random() * a.length)];

module.exports = {
    data: new SlashCommandBuilder().setName('crate').setDescription('Mở rương bí ẩn 🎁'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        // Tôn trọng cài đặt server tắt trò may rủi (giống các game khác qua checkBet).
        if (interaction.guildId && !(await gamblingEnabled(interaction.guildId))) {
            return interaction.editReply(locale.startsWith('en')
                ? '🌸 This server has disabled games of chance~'
                : '🌸 Máy chủ này đã **tắt trò may rủi** rồi nha~');
        }
        const cost = config.CRATE.COST;
        // `addMoney` trả BA giá trị, không phải hai: `true` = đã trừ, `false` = ví không đủ,
        // `null` = KHÔNG BIẾT vì DB lỗi. Bản cũ dùng `if (!...)` nên gộp hai cái sau, và lúc
        // Supabase chập chờn người chơi bị báo "không đủ {cost} xu để cược" — kèm số tiền cụ
        // thể — dù ví đầy. Nói sai về tài sản của chính họ, mà lại nghe rất thuyết phục.
        const daTru = await db.addMoney(userId, -cost, 'wallet');
        if (daTru !== true) {
            return interaction.editReply(daTru === null
                ? t(locale, 'common.retry_later')
                : t(locale, 'commands.crate.err_poor', { cost: fmt(cost, locale), currency: config.CURRENCY }));
        }

        // Hai cửa trao thưởng — cả hai đều trả `null` khi TRAO HỎNG.
        //
        // Ở rương, trao hỏng nghĩa là MẤT TRẮNG: tiền mở rương đã bị trừ ở trên rồi mà
        // phần thưởng không vào. Nặng hơn ba trò kia, nơi hỏng chỉ mất phần tiền thắng.
        // Bản cũ bỏ luôn kết quả của cả `addMoney` lẫn `giveItemAdmin`, nên người chơi đọc
        // "💎 CỰC HIẾM! Cậu nhận được Laptop!" với túi đồ trống — đúng lớp lỗi đã vá ở
        // `/fish`. Không thử lại: hỏng có thể là timeout sau khi ghi ĐÃ thành công.
        const money = async mult => {
            const amt = Math.floor(cost * mult);
            if (await db.addMoney(userId, amt, 'wallet') !== true) return null;
            return amt;
        };
        const giveItem = async pool => {
            const id = rpick(pool);
            if (await db.giveItemAdmin(userId, id, 1) !== true) return null;
            const it = await db.getItem(id);
            if (!it) return id;
            return t(locale, `data.items.${it.id}.name`) || it.name;
        };

        // Dựng mô tả ở MỘT chỗ: trao được thì khoe, trao hỏng thì nói thật. Bảy nhánh dưới
        // mà mỗi nhánh tự kiểm `null` là bảy chỗ có thể quên.
        const HONG = t(locale, 'commands.crate.prize_failed');
        const dongTien = async (mult, key) => {
            const a = await money(mult);
            return a === null ? HONG : t(locale, key, { amount: fmt(a, locale), currency: config.CURRENCY });
        };
        const dongDo = async (pool, key) => {
            const n = await giveItem(pool);
            return n === null ? HONG : t(locale, key, { name: n });
        };

        // Phân phối EV ÂM (~0.7x) -> rương là money sink thật, spam mở sẽ lỗ dần.
        const r = Math.random();
        let desc, type = 'success';
        if (r < 0.40) { desc = await dongTien(0.1 + Math.random() * 0.3, 'commands.crate.prize_little_money'); type = 'warning'; }
        else if (r < 0.65) { desc = await dongTien(0.5 + Math.random() * 0.4, 'commands.crate.prize_decent_money'); type = 'warning'; }
        else if (r < 0.80) { desc = await dongDo(COMMON, 'commands.crate.prize_common_item'); }
        else if (r < 0.92) { desc = await dongTien(1 + Math.random() * 0.8, 'commands.crate.prize_good_money'); }
        else if (r < 0.975) { desc = await dongDo(GOOD, 'commands.crate.prize_good_item'); }
        else if (r < 0.997) { desc = await dongTien(2.5 + Math.random() * 1.5, 'commands.crate.prize_jackpot_money'); type = 'jackpot'; }
        else { desc = await dongDo(RARE, 'commands.crate.prize_rare_item'); type = 'jackpot'; }

        // Trao hỏng thì đừng tô màu ăn mừng: hai nhánh hiếm nhất đặt `type = 'jackpot'`
        // trước khi biết kết quả, nên rương hỏng vẫn hiện khung vàng "ĐẠI TRÚNG".
        if (desc === HONG) type = 'warning';

        const u = await db.getUser(userId);
        const embed = buildWaguriEmbed(interaction, type, {
            locale,
            title: t(locale, 'commands.crate.title'),
            description: t(locale, 'commands.crate.desc', {
                cost: fmt(cost, locale),
                currency: config.CURRENCY,
                desc,
                balance: fmt(u?.wallet || 0, locale)
            })
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
