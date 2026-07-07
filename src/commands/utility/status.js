const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { conditionMultiplier } = require('../../lib/fatigue');
const { getEventInfo } = require('../../lib/event');
const { getLevelFromExp } = require('../../lib/leveling');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const clanLevel = xp => Math.floor(Math.sqrt(Number(xp || 0) / 10000)) + 1;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Xem trạng thái hiện tại: năng lượng, mệt, buff, Premium, sự kiện 📊'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const id = interaction.user.id;
        const user = await db.getUser(id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.db_error')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        const energy = await db.getEnergy(id);

        const now = Date.now();
        const fatigue = conditionMultiplier(energy, user.health);
        const jailedUntil = user.jailed_until && new Date(user.jailed_until).getTime() > now ? new Date(user.jailed_until).getTime() : null;
        const buffActive = user.buff_expires_at && new Date(user.buff_expires_at).getTime() > now;
        const premium = user.premium_until && new Date(user.premium_until).getTime() > now;
        const ev = getEventInfo();
        const today = new Date().toISOString().slice(0, 10);
        const aiUsed = (user.ai_used_date && String(user.ai_used_date).slice(0, 10) === today) ? Number(user.ai_used || 0) : 0;
        const aiCap = premium ? config.AI.PREMIUM_DAILY : config.AI.FREE_DAILY;

        const fatigueVal = fatigue >= 1
            ? t(locale, 'commands.status.fatigue_healthy')
            : t(locale, 'commands.status.fatigue_tired', { pct: Math.round(fatigue * 100) });

        const buffVal = buffActive
            ? t(locale, 'commands.status.buff_active', { pct: Math.round((Number(user.buff_mult) - 1) * 100), time: Math.floor(new Date(user.buff_expires_at).getTime() / 1000) })
            : t(locale, 'commands.status.none');

        const premiumVal = premium
            ? t(locale, 'commands.status.premium_active', { time: Math.floor(new Date(user.premium_until).getTime() / 1000), pct: Math.round(config.PREMIUM.INCOME_BONUS * 100) })
            : t(locale, 'commands.status.premium_none');

        const eventVal = ev.active
            ? t(locale, 'commands.status.event_active', { name: ev.name || 'Event', mult: ev.mult, time: Math.floor(ev.until / 1000) })
            : t(locale, 'commands.status.none');

        const fields = [
            { name: t(locale, 'commands.status.fields.energy'), value: `${energy}/${config.ENERGY.MAX}`, inline: true },
            { name: t(locale, 'commands.status.fields.level'), value: `Lv.${getLevelFromExp(Number(user.exp))}`, inline: true },
            { name: t(locale, 'commands.status.fields.health'), value: `${user.health !== undefined ? user.health : 100}/100`, inline: true },
            { name: t(locale, 'commands.status.fields.fatigue'), value: fatigueVal, inline: false },
            { name: t(locale, 'commands.status.fields.buff'), value: buffVal, inline: false },
            { name: t(locale, 'commands.status.fields.premium'), value: premiumVal, inline: false },
            { name: t(locale, 'commands.status.fields.ai_quota'), value: `${aiUsed}/${aiCap}`, inline: true },
            { name: t(locale, 'commands.status.fields.event'), value: eventVal, inline: true },
        ];
        if (user.clan_id) {
            const clan = await db.clanById(user.clan_id);
            if (clan) fields.push({ name: t(locale, 'commands.status.fields.clan'), value: `**${clan.name}** (Lv.${clanLevel(clan.xp)})`, inline: false });
        }
        if (jailedUntil) {
            const jailVal = `${user.jail_reason ? `**${user.jail_reason}** — ` : ''}${t(locale, 'commands.status.jail_release_at', { time: Math.floor(jailedUntil / 1000) })}`;
            fields.unshift({ name: t(locale, 'commands.status.fields.jailed'), value: jailVal, inline: false });
        }

        const embed = buildWaguriEmbed(interaction, premium ? 'jackpot' : 'info', {
            locale,
            title: t(locale, 'commands.status.title', { user: interaction.user.username }) + (premium ? ' 💎' : ''),
            fields: fields,
            thumbnail: interaction.user.displayAvatarURL()
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
