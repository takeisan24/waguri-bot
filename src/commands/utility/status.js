const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { conditionMultiplier } = require('../../lib/fatigue');
const { getEventInfo } = require('../../lib/event');
const { getLevelFromExp } = require('../../lib/leveling');

const clanLevel = xp => Math.floor(Math.sqrt(Number(xp || 0) / 10000)) + 1;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Xem trạng thái hiện tại: năng lượng, mệt, buff, Premium, sự kiện 📊'),
    async execute(interaction) {
        await interaction.deferReply();
        const id = interaction.user.id;
        const user = await db.getUser(id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸'
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

        const fields = [
            { name: '⚡ Năng lượng', value: `${energy}/${config.ENERGY.MAX}`, inline: true },
            { name: '⭐ Cấp độ', value: `Lv.${getLevelFromExp(Number(user.exp))}`, inline: true },
            { name: '❤️ Sức khỏe', value: `${user.health !== undefined ? user.health : 100}/100`, inline: true },
            { name: '😮‍💨 Mệt mỏi', value: fatigue >= 1
                ? 'sung sức (100%)'
                : `thu nhập còn ${Math.round(fatigue * 100)}% *(năng lượng/sức khỏe thấp — /ngu, /eat hoặc /hospital để hồi)*`, inline: false },
            { name: '🍗 Buff thu nhập', value: buffActive ? `+${Math.round((Number(user.buff_mult) - 1) * 100)}% — hết hạn <t:${Math.floor(new Date(user.buff_expires_at).getTime() / 1000)}:R>` : 'không có', inline: false },
            { name: '💎 Premium', value: premium ? `còn hạn <t:${Math.floor(new Date(user.premium_until).getTime() / 1000)}:R> (+${Math.round(config.PREMIUM.INCOME_BONUS * 100)}% thu nhập)` : 'chưa có (/premium)', inline: false },
            { name: '💬 Lượt chat AI hôm nay', value: `${aiUsed}/${aiCap}`, inline: true },
            { name: '🎉 Sự kiện', value: ev.active ? `**${ev.name || 'Sự kiện'}** x${ev.mult} — hết <t:${Math.floor(ev.until / 1000)}:R>` : 'không có', inline: true },
        ];
        if (user.clan_id) {
            const clan = await db.clanById(user.clan_id);
            if (clan) fields.push({ name: '🏰 Bang hội', value: `**${clan.name}** (Lv.${clanLevel(clan.xp)})`, inline: false });
        }
        if (jailedUntil) {
            fields.unshift({ name: '🚓 Đang bị giam', value: `${user.jail_reason ? `**${user.jail_reason}** — ` : ''}thả <t:${Math.floor(jailedUntil / 1000)}:R>`, inline: false });
        }

        const embed = buildWaguriEmbed(interaction, premium ? 'jackpot' : 'info', {
            title: `📊・Trạng thái của ${interaction.user.username}${premium ? ' 💎' : ''}`,
            fields: fields,
            thumbnail: interaction.user.displayAvatarURL()
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
