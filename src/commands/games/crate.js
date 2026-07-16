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
        if (!await db.addMoney(userId, -cost, 'wallet')) {
            return interaction.editReply(t(locale, 'commands.crate.err_poor', { cost: fmt(cost, locale), currency: config.CURRENCY }));
        }

        const money = async mult => { const amt = Math.floor(cost * mult); await db.addMoney(userId, amt, 'wallet'); return amt; };
        const giveItem = async pool => {
            const id = rpick(pool);
            await db.giveItemAdmin(userId, id, 1);
            const it = await db.getItem(id);
            if (!it) return id;
            return t(locale, `data.items.${it.id}.name`) || it.name;
        };

        // Phân phối EV ÂM (~0.7x) -> rương là money sink thật, spam mở sẽ lỗ dần.
        const r = Math.random();
        let desc, type = 'success';
        if (r < 0.40) { const a = await money(0.1 + Math.random() * 0.3); desc = t(locale, 'commands.crate.prize_little_money', { amount: fmt(a, locale), currency: config.CURRENCY }); type = 'warning'; }
        else if (r < 0.65) { const a = await money(0.5 + Math.random() * 0.4); desc = t(locale, 'commands.crate.prize_decent_money', { amount: fmt(a, locale), currency: config.CURRENCY }); type = 'warning'; }
        else if (r < 0.80) { desc = t(locale, 'commands.crate.prize_common_item', { name: await giveItem(COMMON) }); }
        else if (r < 0.92) { const a = await money(1 + Math.random() * 0.8); desc = t(locale, 'commands.crate.prize_good_money', { amount: fmt(a, locale), currency: config.CURRENCY }); }
        else if (r < 0.975) { desc = t(locale, 'commands.crate.prize_good_item', { name: await giveItem(GOOD) }); }
        else if (r < 0.997) { const a = await money(2.5 + Math.random() * 1.5); desc = t(locale, 'commands.crate.prize_jackpot_money', { amount: fmt(a, locale), currency: config.CURRENCY }); type = 'jackpot'; }
        else { desc = t(locale, 'commands.crate.prize_rare_item', { name: await giveItem(RARE) }); type = 'jackpot'; }

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
