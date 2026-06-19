const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getProgress } = require('../../lib/leveling');
const { createWaguriBar, getWaguriFooter, buildWaguriEmbed } = require('../../lib/embed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Xem hồ sơ tổng quan')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;
        const user = await db.getUser(target.id);
        if (!user) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const energy = await db.getEnergy(target.id);
        const job = user.job_id ? await db.getJob(user.job_id) : null;
        const p = getProgress(Number(user.exp));
        const wallet = Number(user.wallet), bank = Number(user.bank);
        const networth = wallet + bank;

        const HEX = /^[0-9a-fA-F]{6}$/;
        const premium = user.premium_until && new Date(user.premium_until).getTime() > Date.now();

        const embed = buildWaguriEmbed(interaction, premium ? 'jackpot' : 'info', {
            title: `🌸・Hồ sơ của ${target.username}${premium ? ' 💎' : ''}`,
            description: user.title ? `🏷️ *${user.title}*` : undefined,
            thumbnail: target.displayAvatarURL(),
            fields: [
                { name: '💼 Nghề nghiệp', value: job ? job.name : '*Chưa có nghề*', inline: true },
                { name: '⭐ Cấp độ', value: `Lv.${p.level}`, inline: true },
                { name: '⚡ Năng lượng', value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                { name: '💵 Ví tiền', value: `${wallet.toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: '🏦 Ngân hàng', value: `${bank.toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: '💎 Tổng tài sản', value: `${networth.toLocaleString('vi-VN')} ${config.CURRENCY}`, inline: true },
                { name: `📊 Tiến trình EXP (${p.expIntoLevel}/${p.expForNextLevel})`, value: `${createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12)}`, inline: false },
            ],
        });
        // Màu hồ sơ tuỳ chỉnh (cosmetic) ghi đè màu theo type
        if (user.profile_color && HEX.test(user.profile_color)) embed.setColor(parseInt(user.profile_color, 16));

        if (user.partner_id) {
            embed.addFields({ name: '💞 Người thương', value: `<@${user.partner_id}> · Tình cảm: **${Number(user.love || 0)}** 💞`, inline: false });
        }

        const footerObj = getWaguriFooter(interaction.client);
        if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
            const pct = Math.round((Number(user.buff_mult) - 1) * 100);
            footerObj.text = `🍗 Buff +${pct}% thu nhập đang hoạt động · ` + footerObj.text;
        }
        embed.setFooter(footerObj).setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
