const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const ACH = require('../../data/achievements');
const { getLevelFromExp } = require('../../lib/leveling');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('Xem thành tựu (tự mở khóa khi đủ điều kiện)'),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;

        const user = await db.getUser(userId);
        if (!user) return interaction.editReply('Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸');

        const inv = await db.getInventory(userId);
        const ctx = {
            level: getLevelFromExp(Number(user.exp)),
            networth: Number(user.wallet) + Number(user.bank),
            jobId: user.job_id,
            items: new Set(inv.map(r => r.item_id)),
            married: !!user.partner_id,
            love: Number(user.love || 0),
            clan: !!user.clan_id,
            premium: !!(user.premium_until && new Date(user.premium_until).getTime() > Date.now()),
            streak: Number(user.daily_streak || 0),
        };

        const unlocked = await db.getAchievements(userId);

        // Mở khóa thành tựu mới đạt điều kiện
        const newly = [];
        let reward = 0;
        for (const a of ACH) {
            if (!unlocked.has(a.id) && a.check(ctx)) { newly.push(a.id); reward += a.reward || 0; }
        }
        if (newly.length) {
            await db.unlockAchievements(userId, newly);
            if (reward > 0) await db.addMoney(userId, reward, 'wallet');
            newly.forEach(id => unlocked.add(id));
        }

        const lines = ACH.map(a => unlocked.has(a.id)
            ? `🏅 **${a.name}** — ${a.desc}`
            : `🔒 ${a.name} — ${a.desc} · 🪙 ${fmt(a.reward)}`);

        const embed = buildWaguriEmbed(interaction, 'jackpot', {
            title: '🏅・Thành tựu',
            description: lines.join('\n')
        });
        embed.setFooter({
            text: `Đã mở khóa ${unlocked.size}/${ACH.length} • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });

        if (newly.length) {
            embed.addFields({ name: '🎉 Vừa mở khóa!', value: `${newly.length} thành tựu · +${fmt(reward)} ${config.CURRENCY}`, inline: false });
        }
        await interaction.editReply({ embeds: [embed] });
    },
};
