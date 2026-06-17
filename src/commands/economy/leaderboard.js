const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { sendPaginated } = require('../../lib/paginate');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Bảng xếp hạng server')
        .addStringOption(o => o.setName('type').setDescription('Xếp theo').setRequired(false)
            .addChoices({ name: 'Tài sản', value: 'networth' }, { name: 'Cấp độ', value: 'level' })),
    async execute(interaction) {
        await interaction.deferReply();
        const sort = interaction.options.getString('type') || 'networth';
        const rows = await db.getLeaderboard(sort, 25);
        if (!rows.length) return interaction.editReply('Chưa có ai trên bảng xếp hạng cả~ 🌸');

        const lines = await Promise.all(rows.map(async (row, i) => {
            const rank = MEDALS[i] || `**${i + 1}.**`;
            let name;
            try { name = (await interaction.client.users.fetch(row.user_id)).username; }
            catch { name = 'Người chơi ẩn danh'; }
            const value = sort === 'level'
                ? `Lv.${getLevelFromExp(Number(row.exp))}`
                : `${Number(row.networth).toLocaleString('vi-VN')} ${config.CURRENCY}`;
            return `${rank} ${name} — ${value}`;
        }));

        await sendPaginated(interaction, {
            title: sort === 'level' ? '🏆 BXH Cấp độ' : '🏆 BXH Đại gia',
            color: config.COLORS.JACKPOT,
            lines,
            perPage: 10,
        });
    },
};
