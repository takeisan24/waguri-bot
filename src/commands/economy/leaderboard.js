const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { sendPaginated } = require('../../lib/paginate');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

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
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const sort = interaction.options.getString('type') || 'networth';
        // Mặc định 'server' để người mới thấy hàng xóm cùng server (kinh tế là global).
        // Trong DM (không có guild) thì tự về 'global'.
        const scope = (interaction.options.getString('phamvi') || 'server') === 'server' && interaction.guildId ? 'server' : 'global';
        const scopeTag = scope === 'server' ? t(locale, 'commands.leaderboard.scope_server') : t(locale, 'commands.leaderboard.scope_global');

        // BXH tình cảm cặp đôi: luôn toàn cầu (cặp đôi không thuộc riêng server nào).
        if (sort === 'love') {
            const top = await db.getTopLove(25);
            if (!top.length) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.leaderboard.err_no_couples')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const loveLines = top.map((row, i) => {
                const rank = MEDALS[i] || `**${i + 1}.**`;
                return t(locale, 'commands.leaderboard.love_line', {
                    rank,
                    user: row.user_id,
                    partner: row.partner_id,
                    love: Number(row.love).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')
                });
            });
            return sendPaginated(interaction, {
                title: t(locale, 'commands.leaderboard.title_love'),
                color: config.COLORS.JACKPOT,
                lines: loveLines,
                perPage: 10
            });
        }

        const rows = scope === 'server'
            ? await db.getLeaderboardGuild(sort, 25, interaction.guildId)
            : await db.getLeaderboard(sort, 25);
        if (!rows.length) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                description: scope === 'server'
                    ? t(locale, 'commands.leaderboard.err_empty_server')
                    : t(locale, 'commands.leaderboard.err_empty_global')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const lines = rows.map((row, i) => {
            const rank = MEDALS[i] || `**${i + 1}.**`;
            const value = sort === 'level'
                ? `Lv.${getLevelFromExp(Number(row.exp))}`
                : `${Number(row.networth).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN')} ${config.CURRENCY}`;
            return t(locale, 'commands.leaderboard.leader_line', {
                rank,
                user: row.user_id,
                value
            });
        });

        const titlePrefix = sort === 'level'
            ? t(locale, 'commands.leaderboard.title_level')
            : t(locale, 'commands.leaderboard.title_networth');

        await sendPaginated(interaction, {
            title: titlePrefix + scopeTag,
            color: config.COLORS.JACKPOT,
            lines,
            perPage: 10,
        });
    },
};
