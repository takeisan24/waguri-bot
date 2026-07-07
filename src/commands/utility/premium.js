const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Xem trạng thái & quyền lợi Waguri Premium 💎'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const u = await db.getUser(interaction.user.id);
        const until = u?.premium_until ? new Date(u.premium_until) : null;
        const active = until && until.getTime() > Date.now();
        const today = new Date().toISOString().slice(0, 10);
        const used = (u?.ai_used_date && String(u.ai_used_date).slice(0, 10) === today) ? Number(u.ai_used || 0) : 0;
        const cap = active ? config.AI.PREMIUM_DAILY : config.AI.FREE_DAILY;

        const description = active
            ? t(locale, 'commands.premium.active_desc', { time: Math.floor(until.getTime() / 1000), url: `${config.WEB_URL}/dashboard/premium` })
            : t(locale, 'commands.premium.free_desc', { url: `${config.WEB_URL}/dashboard/premium` });

        const embed = buildWaguriEmbed(interaction, active ? 'jackpot' : 'info', {
            locale,
            title: t(locale, 'commands.premium.title'),
            description,
            fields: [
                { name: t(locale, 'commands.premium.field_ai_quota'), value: `${used}/${cap}`, inline: true },
                {
                    name: t(locale, 'commands.premium.field_benefits'),
                    value: t(locale, 'commands.premium.benefits_desc', {
                        ai_quota: config.AI.PREMIUM_DAILY,
                        income_bonus: Math.round(config.PREMIUM.INCOME_BONUS * 100)
                    }),
                    inline: false
                },
                {
                    name: t(locale, 'commands.premium.field_pricing'),
                    value: Object.entries(config.PREMIUM.PLANS)
                        .map(([key, p]) => `• **${t(locale, `commands.premium.plans.${key}`)}** — ${Number(p.amount).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')}${locale === 'en' ? ' VND' : 'đ'}`)
                        .join('\n'),
                    inline: false
                },
            ]
        });

        embed.setFooter({
            text: t(locale, 'commands.premium.footer', { original: embed.data.footer.text }),
            iconURL: embed.data.footer.icon_url
        });

        await interaction.editReply({ embeds: [embed] });
    },
};
