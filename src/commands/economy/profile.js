const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getProgress } = require('../../lib/leveling');
const { createWaguriBar, getWaguriFooter, buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { AFFECTION_TIERS, tierOf } = require('../../lib/ai/persona');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem hồ sơ tổng quan')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const target = interaction.options.getUser('target') || interaction.user;
        const user = await db.getUser(target.id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.db_error')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const energy = await db.getEnergy(target.id);
        const job = user.job_id ? await db.getJob(user.job_id) : null;
        const p = getProgress(Number(user.exp));
        const wallet = Number(user.wallet), bank = Number(user.bank);
        const networth = wallet + bank;

        const HEX = /^[0-9a-fA-F]{6}$/;
        const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();
        const userBadges = await db.getUserBadges(target.id);
        const equippedBadges = userBadges
            .filter(b => b.is_equipped)
            .sort((a, b) => (a.slot_index || 0) - (b.slot_index || 0));
        
        let badgeString = '';
        if (equippedBadges.length > 0) {
            badgeString = equippedBadges.map(b => {
                const conf = config.COSMETIC.BADGES?.[b.badge_id];
                return conf ? conf.emoji : '';
            }).filter(Boolean).join(' ');
        }

        const numFmt = locale === 'en' ? 'en-US' : 'vi-VN';
        const jobName = job ? (t(locale, `data.jobs.${job.id}.name`) || job.name) : t(locale, 'commands.profile.no_job');
        const prestigeVal = user.prestige > 0 ? ` (CS ${user.prestige} 🌟)` : '';

        const embed = buildWaguriEmbed(interaction, premium ? 'jackpot' : 'info', {
            locale,
            title: t(locale, 'commands.profile.title', { user: target.username }) + (premium ? ' 💎' : ''),
            description: (user.title || badgeString) ? `${user.title ? `🏷️ *${user.title}*` : ''}${badgeString ? `\n${badgeString}` : ''}` : undefined,
            thumbnail: target.displayAvatarURL(),
            fields: [
                { name: t(locale, 'commands.profile.fields.job'), value: jobName, inline: true },
                { name: t(locale, 'commands.profile.fields.level'), value: `Lv.${p.level}${prestigeVal}`, inline: true },
                { name: t(locale, 'commands.profile.fields.energy'), value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: t(locale, 'commands.profile.fields.wallet'), value: `${wallet.toLocaleString(numFmt)} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile.fields.bank'), value: `${bank.toLocaleString(numFmt)} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile.fields.networth'), value: `${networth.toLocaleString(numFmt)} ${config.CURRENCY}`, inline: true },
                { name: t(locale, 'commands.profile.fields.progress', { current: p.expIntoLevel, total: p.expForNextLevel }), value: `${createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12)}`, inline: false },
            ],
        });
        // Màu hồ sơ tuỳ chỉnh (cosmetic) ghi đè màu theo type
        if (user.profile_color && HEX.test(user.profile_color)) embed.setColor(parseInt(user.profile_color, 16));

        if (user.partner_id) {
            embed.addFields({ name: t(locale, 'commands.profile.fields.partner'), value: t(locale, 'commands.profile.partner_desc', { user: user.partner_id, score: Number(user.love || 0) }), inline: false });
        }

        const isSelf = target.id === interaction.user.id;

        // --- Quan hệ với Waguri (CHỈ hiện cho chính chủ) ---
        //
        // Vì sao thêm: thang 5 bậc thiện cảm thật sự đổi giọng Waguri, và cô ấy ghi nhớ tới 25
        // điều về người chơi — nhưng TRƯỚC ĐÂY không nơi nào cho người chơi thấy hai thứ đó.
        // Đo 2026-08-18: 20 người có thiện cảm > 0, điểm cao nhất 30, một nửa thử một hai lần
        // rồi thôi. Vòng lặp bạn đồng hành vô hình thì không ai có lý do quay lại.
        //
        // CHỈ CHÍNH CHỦ: ký ức là chuyện riêng giữa người chơi và Waguri; xem hồ sơ người khác
        // không được lộ. `/profile` cho phép chỉ định `target` nên phải chặn rõ ở đây.
        if (isSelf) {
            const aff = Number(user.affection || 0);
            const bac = tierOf(aff);
            const caoHon = [...AFFECTION_TIERS].reverse().find(x => x.min > aff);
            // Tên bậc qua locale — `bac.name` trong persona.js viết cứng tiếng Việt.
            const tenBac = b => t(locale, `lib.ai.tier_name.${b.key}`) || b.name;
            const tienDo = caoHon
                ? t(locale, 'commands.profile.waguri_next', { next: tenBac(caoHon), remain: caoHon.min - aff })
                : t(locale, 'commands.profile.waguri_max');
            embed.addFields({
                name: t(locale, 'commands.profile.fields.waguri'),
                value: `${tenBac(bac)} · ${aff} 💗\n${tienDo}`,
                inline: false,
            });

            const kyUc = user.ai_memory && typeof user.ai_memory === 'object' ? user.ai_memory : null;
            const muc = kyUc
                ? Object.entries(kyUc)
                    .filter(([k, v]) => k && v != null && String(v).trim())
                    .slice(0, 6)                       // giữ embed gọn; có thể nhớ tới 25 điều
                    .map(([k, v]) => `• ${String(v).slice(0, 80)}`)
                : [];
            if (muc.length) {
                embed.addFields({
                    name: t(locale, 'commands.profile.fields.waguri_memory'),
                    value: muc.join('\n'),
                    inline: false,
                });
            }
        }

        // Link hồ sơ web (share được)
        const isPublic = user.profile_public !== false;
        if (isPublic) {
            embed.addFields({ name: t(locale, 'commands.profile.fields.web_profile'), value: `[waguri-bot.vercel.app/u/${target.id}](https://waguri-bot.vercel.app/u/${target.id})`, inline: false });
        } else if (isSelf) {
            embed.addFields({ name: t(locale, 'commands.profile.fields.web_profile'), value: t(locale, 'commands.profile.web_profile_hidden'), inline: false });
        }

        const footerObj = getWaguriFooter(interaction.client, locale);
        if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
            const pct = Math.round((Number(user.buff_mult) - 1) * 100);
            footerObj.text = t(locale, 'commands.profile.buff_active', { pct }) + ' · ' + footerObj.text;
        }
        embed.setFooter(footerObj).setTimestamp();

        // Chủ hồ sơ được nút bật/tắt hiển thị web
        const components = isSelf
            ? [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('profile:toggle')
                    .setLabel(isPublic ? t(locale, 'commands.profile.btn_hide') : t(locale, 'commands.profile.btn_show'))
                    .setStyle(ButtonStyle.Secondary))]
            : [];

        await interaction.editReply({ embeds: [embed], components });
    },
};
