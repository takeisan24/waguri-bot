const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { buildWaguriEmbed } = require('../../lib/embed');
const { handleNewbieQuest } = require('../../lib/newbie');
const { sendPaginated } = require('../../lib/paginate');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jobs')
        .setDescription('Hệ thống nghề nghiệp')
        .addSubcommand(s => s.setName('list').setDescription('Xem tất cả nghề'))
        .addSubcommand(s => s.setName('info').setDescription('Xem chi tiết một nghề')
            .addStringOption(o => o.setName('job').setDescription('Nghề').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('apply').setDescription('Xin vào làm một nghề')
            .addStringOption(o => o.setName('job').setDescription('Nghề').setRequired(true).setAutocomplete(true))),

    async autocomplete(interaction) {
        const { getInteractionLanguage, t } = require('../../lib/i18n');
        const locale = await getInteractionLanguage(interaction);
        const focused = interaction.options.getFocused().toLowerCase();
        const jobs = await db.getJobs();
        await interaction.respond(jobs
            .filter(j => j.name.toLowerCase().includes(focused) || j.id.includes(focused) || (t(locale, `data.jobs.${j.id}.name`) || '').toLowerCase().includes(focused))
            .slice(0, 25)
            .map(j => {
                const name = t(locale, `data.jobs.${j.id}.name`) || j.name;
                return { name: `${name} (Lv.${j.required_level})`, value: j.id };
            }));
    },

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'list') return jobList(interaction);
        if (sub === 'info') return jobInfo(interaction);
        if (sub === 'apply') return applyJob(interaction);
    },
};

async function jobList(interaction) {
    await interaction.deferReply();
    const locale = await getInteractionLanguage(interaction);
    const jobs = await db.getJobs();
    const lines = jobs.map(j => {
        const name = t(locale, `data.jobs.${j.id}.name`) || j.name;
        return `• **${name}** (Lv.${j.required_level}) · 🪙 ${t(locale, 'commands.jobs.wage_label')}: **${fmt(j.min_wage, locale)}–${fmt(j.max_wage, locale)}**`;
    });
    
    await sendPaginated(interaction, {
        title: t(locale, 'commands.jobs.list_title'),
        color: config.COLORS.INFO,
        lines: lines,
        perPage: 8,
        footerNote: t(locale, 'commands.jobs.list_footer')
    });
}

async function jobInfo(interaction) {
    await interaction.deferReply();
    const locale = await getInteractionLanguage(interaction);
    const job = await db.getJob(interaction.options.getString('job'));
    if (!job) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.jobs.not_found')
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const reqItem = job.required_item_id ? await db.getItem(job.required_item_id) : null;
    const jobName = t(locale, `data.jobs.${job.id}.name`) || job.name;
    const reqItemName = reqItem ? (t(locale, `data.items.${reqItem.id}.name`) || reqItem.name) : t(locale, 'common.none');

    const embed = buildWaguriEmbed(interaction, 'info', {
        locale,
        title: t(locale, 'commands.jobs.info_title', { job: jobName }),
        fields: [
            { name: t(locale, 'commands.jobs.fields.required_level'), value: `Lv.${job.required_level}`, inline: true },
            { name: t(locale, 'commands.jobs.fields.wage'), value: `${fmt(job.min_wage, locale)}–${fmt(job.max_wage, locale)} ${config.CURRENCY}`, inline: true },
            { name: t(locale, 'commands.jobs.fields.risk'), value: `${Math.round(job.risk_rate * 100)}%`, inline: true },
            { name: t(locale, 'commands.jobs.fields.required_item'), value: reqItemName, inline: true },
        ]
    });
    await interaction.editReply({ embeds: [embed] });
}

async function applyJob(interaction) {
    await interaction.deferReply();
    const locale = await getInteractionLanguage(interaction);
    const jobId = interaction.options.getString('job');
    const [job, user] = await Promise.all([db.getJob(jobId), db.getUser(interaction.user.id)]);

    if (!job) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.jobs.not_found')
        });
        return interaction.editReply({ embeds: [embed] });
    }
    if (!user) {
        const embed = buildWaguriEmbed(interaction, 'error', {
            locale,
            description: t(locale, 'common.db_error')
        });
        return interaction.editReply({ embeds: [embed] });
    }
    const jobName = t(locale, `data.jobs.${job.id}.name`) || job.name;

    if (user.job_id === jobId) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.jobs.already_applied', { job: jobName })
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const level = getLevelFromExp(Number(user.exp));
    if (level < job.required_level) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            locale,
            description: t(locale, 'commands.jobs.level_low', { required: job.required_level, job: jobName, current: level })
        });
        return interaction.editReply({ embeds: [embed] });
    }

    if (job.required_item_id) {
        const has = await db.hasItem(interaction.user.id, job.required_item_id);
        if (!has) {
            const reqItem = await db.getItem(job.required_item_id);
            const reqItemName = reqItem ? (t(locale, `data.items.${reqItem.id}.name`) || reqItem.name) : job.required_item_id;
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: t(locale, 'commands.jobs.missing_item', { item: reqItemName })
            });
            return interaction.editReply({ embeds: [embed] });
        }
    }

    const ok = await db.setUserJob(interaction.user.id, jobId);
    if (!ok) {
        const embed = buildWaguriEmbed(interaction, 'error', {
            locale,
            description: t(locale, 'commands.jobs.apply_failed')
        });
        return interaction.editReply({ embeds: [embed] });
    }

    await handleNewbieQuest(interaction, 'apply_job', 1);

    const embed = buildWaguriEmbed(interaction, 'success', {
        locale,
        title: t(locale, 'commands.jobs.apply_success_title'),
        description: t(locale, 'commands.jobs.apply_success_desc', { job: jobName })
    });
    await interaction.editReply({ embeds: [embed] });
}
