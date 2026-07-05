const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { buildWaguriEmbed } = require('../../lib/embed');
const { handleNewbieQuest } = require('../../lib/newbie');
const { sendPaginated } = require('../../lib/paginate');

const fmt = n => Number(n).toLocaleString('vi-VN');

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
        const focused = interaction.options.getFocused().toLowerCase();
        const jobs = await db.getJobs();
        await interaction.respond(jobs
            .filter(j => j.name.toLowerCase().includes(focused) || j.id.includes(focused))
            .slice(0, 25)
            .map(j => ({ name: `${j.name} (Lv.${j.required_level})`, value: j.id })));
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
    const jobs = await db.getJobs();
    const lines = jobs.map(j => `• **${j.name}** (Lv.${j.required_level}) · 🪙 Lương: **${fmt(j.min_wage)}–${fmt(j.max_wage)}**`);
    
    await sendPaginated(interaction, {
        title: '💼・Danh sách nghề nghiệp',
        color: config.COLORS.INFO,
        lines: lines,
        perPage: 8,
        footerNote: 'Xem chi tiết: /jobs info <nghề>'
    });
}

async function jobInfo(interaction) {
    await interaction.deferReply();
    const job = await db.getJob(interaction.options.getString('job'));
    if (!job) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: 'Không tìm thấy nghề này 🤔'
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const reqItem = job.required_item_id ? await db.getItem(job.required_item_id) : null;
    const embed = buildWaguriEmbed(interaction, 'info', {
        title: `💼・Thông tin nghề: ${job.name}`,
        fields: [
            { name: 'Cấp yêu cầu', value: `Lv.${job.required_level}`, inline: true },
            { name: 'Lương', value: `${fmt(job.min_wage)}–${fmt(job.max_wage)} ${config.CURRENCY}`, inline: true },
            { name: 'Rủi ro', value: `${Math.round(job.risk_rate * 100)}%`, inline: true },
            { name: 'Vật phẩm cần', value: reqItem ? reqItem.name : 'Không', inline: true },
        ]
    });
    await interaction.editReply({ embeds: [embed] });
}

async function applyJob(interaction) {
    await interaction.deferReply();
    const jobId = interaction.options.getString('job');
    const [job, user] = await Promise.all([db.getJob(jobId), db.getUser(interaction.user.id)]);

    if (!job) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: 'Mình không tìm thấy nghề này, cậu xem lại giúp nhé~ 🌸'
        });
        return interaction.editReply({ embeds: [embed] });
    }
    if (!user) {
        const embed = buildWaguriEmbed(interaction, 'error', {
            description: 'Hơ, mình chưa lấy được dữ liệu, thử lại sau chút nhé~'
        });
        return interaction.editReply({ embeds: [embed] });
    }
    if (user.job_id === jobId) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: `Cậu đang làm **${job.name}** rồi mà~ 😄`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    const level = getLevelFromExp(Number(user.exp));
    if (level < job.required_level) {
        const embed = buildWaguriEmbed(interaction, 'warning', {
            description: `Cậu cần đạt **Lv.${job.required_level}** mới làm **${job.name}** được, giờ cậu mới Lv.${level} thôi. Cố thêm chút nữa nha, cậu làm được mà! 🌸`
        });
        return interaction.editReply({ embeds: [embed] });
    }

    if (job.required_item_id) {
        const has = await db.hasItem(interaction.user.id, job.required_item_id);
        if (!has) {
            const reqItem = await db.getItem(job.required_item_id);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `À, để làm nghề này cậu cần có **${reqItem ? reqItem.name : job.required_item_id}** trước đã. Ghé \`/shop\` sắm một cái rồi quay lại nhé~ 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }
    }

    const ok = await db.setUserJob(interaction.user.id, jobId);
    if (!ok) {
        const embed = buildWaguriEmbed(interaction, 'error', {
            description: 'Ơ, có lỗi khi nhận việc rồi, cậu thử lại sau nhé~'
        });
        return interaction.editReply({ embeds: [embed] });
    }

    await handleNewbieQuest(interaction, 'apply_job', 1);

    const embed = buildWaguriEmbed(interaction, 'success', {
        title: '🎉・Nhận việc thành công!',
        description: `Từ giờ cậu là **${job.name}** rồi đó. Cùng cố gắng nhé, gõ \`/work\` để bắt đầu làm việc thôi! 💪`
    });
    await interaction.editReply({ embeds: [embed] });
}
