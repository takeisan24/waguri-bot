const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confession')
        .setDescription('Gửi confession ẩn danh (nên dùng /slash để ẩn danh)')
        .addStringOption(o => o.setName('noi_dung').setDescription('Điều cậu muốn gửi').setRequired(true)),
    async execute(interaction) {
        const content = interaction.options.getString('noi_dung');
        const gid = interaction.guild?.id;
        if (!gid) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Lệnh này chỉ dùng trong server~'
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // 1. Chặn Mentions/Pings (User, Role, Everyone, Here)
        const hasEveryone = content.includes('@everyone') || content.includes('@here');
        const hasUserOrRoleMention = /<@&?\d+>|<@!\d+>/.test(content);
        if (hasEveryone || hasUserOrRoleMention) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: 'Nội dung confession không được chứa lượt nhắc tên (mention) user, role hoặc everyone/here để tránh phiền toái nha cậu~ 🌸'
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // 2. Kiểm tra và đặt Cooldown (15 phút = 900 giây)
        const userId = interaction.user.id;
        const cooldownUntil = await db.claimCooldown(userId, 'confession', 900);
        if (cooldownUntil) {
            const remainSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
            const min = Math.floor(remainSec / 60);
            const sec = remainSec % 60;
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: `Từ từ thôi nào~ Cậu vừa gửi confession gần đây. Thử lại sau **${min} phút ${sec} giây** nhé~ 🌸`
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const s = await db.getGuildSettings(gid);
        if (!s.confession_channel) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                description: 'Server chưa cấu hình kênh confession. Nhờ admin gõ `/config confession-channel` nhé~ 🌸'
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const channel = interaction.guild.channels.cache.get(s.confession_channel)
            || await interaction.guild.channels.fetch(s.confession_channel).catch(() => null);
        if (!channel) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Kênh confession không còn tồn tại, nhờ admin đặt lại giúp nhé~'
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const num = await db.nextConfessionNumber(gid);

        // 3. Ghi log lưu vết confession ẩn danh cho admin
        await db.logConfession(gid, userId, num, content);

        const embed = buildWaguriEmbed(interaction, 'info', {
            title: `🤫 Confession #${num}`,
            description: content.slice(0, 4000)
        }).setTimestamp();

        embed.setFooter({
            text: `🤫 Gửi ẩn danh qua Waguri • ${embed.data.footer.text}`,
            iconURL: embed.data.footer.icon_url
        });

        await channel.send({ embeds: [embed] }).catch(() => null);
        const successEmbed = buildWaguriEmbed(interaction, 'success', {
            description: '✅ Đã gửi confession ẩn danh của cậu rồi nhé~ (không ai biết là cậu đâu)'
        });
        return interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
    },
};
