const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');

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
        if (sub === 'list') return listJobs(interaction);
        if (sub === 'info') return jobInfo(interaction);
        if (sub === 'apply') return applyJob(interaction);
    },
};

async function listJobs(interaction) {
    await interaction.deferReply();
    const [jobs, user] = await Promise.all([db.getJobs(), db.getUser(interaction.user.id)]);
    const level = user ? getLevelFromExp(Number(user.exp)) : 1;

    const lines = await Promise.all(jobs.map(async j => {
        const reqItem = j.required_item_id ? await db.getItem(j.required_item_id) : null;
        const current = user && user.job_id === j.id ? ' ◀ **đang làm**' : '';
        const ok = level >= j.required_level;
        return `${ok ? '✅' : '🔒'} **${j.name}** — Lv.${j.required_level}+ · ${fmt(j.min_wage)}–${fmt(j.max_wage)} ${config.CURRENCY}` +
            `${reqItem ? ` · cần *${reqItem.name}*` : ''}${current}`;
    }));

    const embed = new EmbedBuilder()
        .setColor(config.COLORS.INFO)
        .setTitle('💼 Danh sách nghề')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `Cấp của bạn: Lv.${level} · dùng /jobs apply để xin việc` });
    await interaction.editReply({ embeds: [embed] });
}

async function jobInfo(interaction) {
    await interaction.deferReply();
    const job = await db.getJob(interaction.options.getString('job'));
    if (!job) return interaction.editReply('Không tìm thấy nghề này 🤔');

    const reqItem = job.required_item_id ? await db.getItem(job.required_item_id) : null;
    const embed = new EmbedBuilder()
        .setColor(config.COLORS.INFO)
        .setTitle(`💼 ${job.name}`)
        .addFields(
            { name: 'Cấp yêu cầu', value: `Lv.${job.required_level}`, inline: true },
            { name: 'Lương', value: `${fmt(job.min_wage)}–${fmt(job.max_wage)} ${config.CURRENCY}`, inline: true },
            { name: 'Rủi ro', value: `${Math.round(job.risk_rate * 100)}%`, inline: true },
            { name: 'Vật phẩm cần', value: reqItem ? reqItem.name : 'Không', inline: true },
        );
    await interaction.editReply({ embeds: [embed] });
}

async function applyJob(interaction) {
    await interaction.deferReply();
    const jobId = interaction.options.getString('job');
    const [job, user] = await Promise.all([db.getJob(jobId), db.getUser(interaction.user.id)]);

    if (!job) return interaction.editReply('Không tìm thấy nghề này 🤔');
    if (!user) return interaction.editReply('Lỗi dữ liệu, thử lại sau 💢');
    if (user.job_id === jobId) return interaction.editReply(`Bạn đang làm **${job.name}** rồi mà 🤨`);

    const level = getLevelFromExp(Number(user.exp));
    if (level < job.required_level) {
        return interaction.editReply(`💢 Chưa đủ trình! **${job.name}** cần Lv.${job.required_level}, bạn mới Lv.${level}. Đi /work cày thêm đi.`);
    }

    if (job.required_item_id) {
        const has = await db.hasItem(interaction.user.id, job.required_item_id);
        if (!has) {
            const reqItem = await db.getItem(job.required_item_id);
            return interaction.editReply(`💢 Thiếu đồ nghề! Cần **${reqItem ? reqItem.name : job.required_item_id}** trong kho. Ra /shop mà sắm.`);
        }
    }

    const ok = await db.setUserJob(interaction.user.id, jobId);
    if (!ok) return interaction.editReply('Có lỗi khi nhận việc, thử lại sau 💢');

    const embed = new EmbedBuilder()
        .setColor(config.COLORS.SUCCESS)
        .setTitle('🎉 Nhận việc thành công!')
        .setDescription(`Từ giờ bạn là **${job.name}**. Gõ /work để bắt đầu cày 💪`);
    await interaction.editReply({ embeds: [embed] });
}
