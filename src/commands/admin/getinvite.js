const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');
const { createGuildInvite } = require('../../lib/invite');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('getinvite')
        .setDescription('Bot tạo link mời 1 server rồi DM cho owner (chỉ owner)')
        .addStringOption(o => o.setName('server')
            .setDescription('Server cần lấy link mời (bỏ trống = server đang gõ lệnh)')
            .setAutocomplete(true)),

    async autocomplete(interaction) {
        if (!await isOwner(interaction.client, interaction.user.id)) return interaction.respond([]);
        const focused = interaction.options.getFocused().toLowerCase();
        const choices = interaction.client.guilds.cache
            .filter(g => g.name.toLowerCase().includes(focused) || g.id.includes(focused))
            .map(g => ({ name: `${g.name} · ${g.memberCount} thành viên`.slice(0, 100), value: g.id }))
            .slice(0, 25);
        await interaction.respond(choices);
    },

    async execute(interaction) {
        if (!await isOwner(interaction.client, interaction.user.id)) {
            const embed = buildWaguriEmbed(interaction, 'error', { description: 'Lệnh này chỉ dành cho owner thôi nhé~ 🌸' });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Xác định server cần lấy invite.
        const targetId = interaction.options.getString('server') || interaction.guildId;
        if (!targetId) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                description: 'Cậu gõ lệnh trong DM thì phải chọn `server` cụ thể nhé~' })] });
        }
        const guild = interaction.client.guilds.cache.get(targetId);
        if (!guild) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                description: `Bot không ở trong server \`${targetId}\` (hoặc ID sai)~` })] });
        }

        // Tạo invite: 24h, 1 lượt dùng, riêng cho lần này.
        let result;
        try {
            result = await createGuildInvite(guild, {
                reason: `Owner ${interaction.user.tag} xin link để vào lấy feedback`,
            });
        } catch (err) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                description: `Tạo invite thất bại ở **${guild.name}**: ${err.message}` })] });
        }
        if (!result) {
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                title: '⚠️ Không tạo được link mời',
                description: `Bot không có quyền **Create Invite** ở kênh nào trong **${guild.name}**.\n` +
                    `Nhờ admin server cấp quyền *Tạo lời mời* cho bot, hoặc xin họ link trực tiếp nhé~` })] });
        }

        const { url, channel } = result;
        const dmText =
            `🌸 Link mời vào **${guild.name}** đây nè~\n` +
            `${url}\n\n` +
            `📌 Kênh: #${channel.name} · ⏳ hết hạn sau **24h** · 🎫 dùng **1 lần**.`;

        // DM cho owner.
        try {
            await interaction.user.send(dmText);
        } catch {
            // Owner tắt DM -> trả thẳng link qua reply ẩn.
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                title: '📩 Không gửi được DM',
                description: `DM của cậu đang tắt nên mình gửi thẳng đây nhé:\n${url}\n\n` +
                    `⏳ hết hạn sau 24h · 🎫 dùng 1 lần · kênh #${channel.name}.` })] });
        }

        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
            title: '✅ Đã gửi link mời qua DM',
            description: `Mình đã DM link mời vào **${guild.name}** cho cậu rồi nha~ 💌\n` +
                `⏳ hết hạn sau 24h · 🎫 dùng 1 lần.` })] });
    },
};
