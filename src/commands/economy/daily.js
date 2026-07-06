const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { handleNewbieQuest } = require('../../lib/newbie');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Điểm danh nhận thưởng mỗi ngày'),
    async execute(interaction) {
        await interaction.deferReply();
        const r = await db.claimDaily(interaction.user.id);
        if (!r) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: 'Ơ, có lỗi rồi, cậu thử lại sau nhé~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }

        if (r.status === 'claimed') {
            const ts = Math.floor(new Date(r.next).getTime() / 1000);
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `Hôm nay cậu điểm danh rồi mà~ Quay lại sau <t:${ts}:R> nhé! 🌸`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        db.questIncr(interaction.user.id, 'daily', 1); // nhiệm vụ điểm danh
        await handleNewbieQuest(interaction, 'daily', 1);
        const u = await db.getUser(interaction.user.id);

        // Chào người vắng lâu (last_seen = mốc điểm danh hiện diện gần nhất).
        const prevSeen = await db.touchLastSeen(interaction.user.id);
        let greet = '';
        if (prevSeen && Date.now() - prevSeen >= config.RETURN_GREET_DAYS * 86400000) {
            const days = Math.floor((Date.now() - prevSeen) / 86400000);
            greet = `🌸 Lâu rồi mới gặp cậu (${days} ngày)~ Mừng cậu quay lại nha, mình nhớ cậu lắm đó! 💕\n\n`;
        }

        let desc = `Cậu nhận được **${fmt(r.reward)}** ${config.CURRENCY}!`;
        if (r.milestone && Number(r.milestone) > 0) {
            desc += `\n🏆 **Mốc ${r.streak} ngày liên tiếp!** Thưởng thêm **+${fmt(r.milestone)}** ${config.CURRENCY} 🎉`;
        }
        if (r.interest && Number(r.interest) > 0) {
            desc += `\n📈 Lãi tiết kiệm ngân hàng (0.2%/ngày): **+${fmt(r.interest)}** ${config.CURRENCY} *(đã cộng vào bank)*.`;
        }
        if (r.tax && Number(r.tax) > 0) {
            desc += `\n🏛️ Thuế tài sản (1% phần vượt 100k): **-${fmt(r.tax)}** ${config.CURRENCY} *(người giàu góp ngân sách~)*.`;
        }
        if (r.clan_dividend && Number(r.clan_dividend) > 0) {
            desc += `\n🏰 Cổ tức bang hội: **+${fmt(r.clan_dividend)}** ${config.CURRENCY}`;
        }

        // Cộng XP Battle Pass (+100 XP)
        const bpRes = await require('../../lib/battlepass').addXp(interaction.user.id, 100);
        if (bpRes && bpRes.levelUp) {
            desc += `\n🎉 **Sổ Sứ Mệnh**: Cậu đã đạt **Cấp ${bpRes.newLevel}**! Gõ \`/pass\` nhận quà nha~ 🎁`;
        }

        const nudge = (u && !u.onboarded)
            ? '> 💡 Người mới hả? Gõ `/start` nhận **quà chào mừng** nha~ 🎁\n'
            : '> 💡 Giờ thì đi `/work` kiếm thêm và xem `/quest` nhận nhiệm vụ hôm nay nha~ 🌸\n';
        const description = greet + `> ${desc}\n\n` + nudge;
        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '🎁・Điểm danh thành công!',
            description,
            fields: [
                { name: '🔥 Chuỗi ngày', value: `${r.streak} ngày liên tiếp`, inline: true },
                { name: '💵 Số dư ví', value: `${Number(u?.wallet || 0).toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
            ]
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
