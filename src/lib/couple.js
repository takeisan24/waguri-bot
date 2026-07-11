const { EmbedBuilder } = require('discord.js');
const db = require('../database.js');
const { onCooldown } = require('./cooldown');
const { t } = require('./i18n');

const LOVE_TIERS = [
    [1000, 'phu_the_vien_man'],
    [500, 'khang_khit'],
    [200, 'man_nong'],
    [50, 'dang_yeu'],
    [0, 'moi_cuoi']
];

const loveTier = (n, locale) => {
    const key = (LOVE_TIERS.find(([m]) => n >= m) || [0, 'moi_cuoi'])[1];
    return t(locale, `data.couple.tiers.${key}`) || key;
};

/** Logic chung cho /hug /kiss /date. opts: {emoji, lines, love} */
async function runCouple(interaction, { emoji, lines, love = 2 }, locale) {
    await interaction.deferReply();
    const me = interaction.user;
    const target = interaction.options.getUser('user');
    const { buildWaguriEmbed } = require('./embed');

    if (!target) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: t(locale, 'lib.couple.target_not_found')
        });
        return interaction.editReply({ embeds: [embed] });
    }
    if (target.bot) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: t(locale, 'lib.couple.target_bot')
        });
        return interaction.editReply({ embeds: [embed] });
    }
    if (target.id === me.id) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: t(locale, 'lib.couple.target_self')
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const line = lines[Math.floor(Math.random() * lines.length)].replace(/\{a\}/g, `<@${me.id}>`).replace(/\{b\}/g, `<@${target.id}>`);
    const user = await db.getUser(me.id);

    let extra = '';
    if (user?.partner_id === target.id) {
        const cd = onCooldown('couple', me.id, 30000);
        if (!cd) {
            const r = await db.coupleLove(me.id, love);
            if (r?.status === 'ok') {
                extra = '\n💞 ' + t(locale, 'lib.couple.love_status', {
                    love: r.love,
                    tier: loveTier(Number(r.love), locale)
                });
            }
        } else {
            extra = '\n💞 ' + t(locale, 'lib.couple.cooldown_extra');
        }
    }
    const embed = buildWaguriEmbed(interaction, 'info', {
        description: `${emoji} ${line}${extra}`
    }).setTimestamp();
    await interaction.editReply({ embeds: [embed] });
}

module.exports = { runCouple, loveTier };
