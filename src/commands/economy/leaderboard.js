const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { sendPaginated } = require('../../lib/paginate');
const { buildWaguriEmbed } = require('../../lib/embed');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Bảng xếp hạng')
        .addStringOption(o => o.setName('type').setDescription('Xếp theo').setRequired(false)
            .addChoices({ name: 'Tài sản', value: 'networth' }, { name: 'Cấp độ', value: 'level' }, { name: 'Tình cảm cặp đôi', value: 'love' }))
        .addStringOption(o => o.setName('phamvi').setDescription('Trong server này hay toàn cầu').setRequired(false)
            .addChoices({ name: 'Trong server này', value: 'server' }, { name: 'Toàn cầu', value: 'global' })),
    async execute(interaction) {
        await interaction.deferReply();
        const sort = interaction.options.getString('type') || 'networth';
        // Mặc định 'server' để người mới thấy hàng xóm cùng server (kinh tế là global).
        // Trong DM (không có guild) thì tự về 'global'.
        const scope = (interaction.options.getString('phamvi') || 'server') === 'server' && interaction.guildId ? 'server' : 'global';
        const scopeTag = scope === 'server' ? ' (server)' : ' (toàn cầu)';

        // BXH tình cảm cặp đôi: luôn toàn cầu (cặp đôi không thuộc riêng server nào).
        if (sort === 'love') {
            const top = await db.getTopLove(25);
            if (!top.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Chưa có cặp đôi nào~ Gõ `/marry` để bắt đầu nhé! 💕'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const loveLines = top.map((row, i) => `${MEDALS[i] || `**${i + 1}.**`} <@${row.user_id}> 💞 <@${row.partner_id}> — **${Number(row.love).toLocaleString('vi-VN')}** điểm`);
            return sendPaginated(interaction, { title: '💞 BXH Tình Cảm (toàn cầu)', color: config.COLORS.JACKPOT, lines: loveLines, perPage: 10 });
        }

        const rows = scope === 'server'
            ? await db.getLeaderboardGuild(sort, 25, interaction.guildId)
            : await db.getLeaderboard(sort, 25);
        if (!rows.length) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: scope === 'server'
                    ? 'Chưa có ai trong server này lên bảng cả~ Chơi vài lệnh để ghi danh nhé! 🌸'
                    : 'Chưa có ai trên bảng xếp hạng cả~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const lines = rows.map((row, i) => {
            const rank = MEDALS[i] || `**${i + 1}.**`;
            const value = sort === 'level'
                ? `Lv.${getLevelFromExp(Number(row.exp))}`
                : `${Number(row.networth).toLocaleString('vi-VN')} ${config.CURRENCY}`;
            return `${rank} <@${row.user_id}> — ${value}`;
        });

        await sendPaginated(interaction, {
            title: (sort === 'level' ? '🏆 BXH Cấp độ' : '🏆 BXH Đại gia') + scopeTag,
            color: config.COLORS.JACKPOT,
            lines,
            perPage: 10,
        });
    },
};
