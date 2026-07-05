const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { parseAmount } = require('../../lib/amount');
const { getProgress } = require('../../lib/leveling');

const fmt = n => Number(n).toLocaleString('vi-VN');

async function move(interaction, toBank) {
    const raw = interaction.options.getString('amount');
    const title = toBank ? '🏦・Gửi tiền' : '🏦・Rút tiền';
    const user = await db.getUser(interaction.user.id);
    if (!user) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸' })] });

    const amount = parseAmount(raw, toBank ? Number(user.wallet) : Number(user.bank)); // hỗ trợ 1k/2m/all
    if (!amount || amount <= 0) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: 'Số tiền không hợp lệ~ (nhập số, `1k`, hoặc `all`)' })] });

    const ok = await db.transferBank(interaction.user.id, amount, toBank);
    if (!ok) return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { title, description: toBank ? 'Ví của cậu không đủ để gửi rồi 😟' : 'Ngân hàng của cậu không đủ tiền để rút 😟' })] });

    const u = await db.getUser(interaction.user.id);
    const bal = `💵 Ví: **${fmt(u?.wallet || 0)}** · 🏦 Ngân hàng: **${fmt(u?.bank || 0)}** ${config.CURRENCY}`;
    return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
        title: toBank ? '🏦・Gửi tiền thành công' : '🏦・Rút tiền thành công',
        description: (toBank ? `Đã gửi **${fmt(amount)}** ${config.CURRENCY} vào ngân hàng. An toàn rồi nhé~ 🌸\n` : `💵 Đã rút **${fmt(amount)}** ${config.CURRENCY} về ví nhé~ 🌸\n`) + bal
    })] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bank')
        .setDescription('Ngân hàng 🏦 — quản lý tài chính, gửi / rút tiền')
        .addSubcommand(s => s.setName('balance').setDescription('Xem ví, ngân hàng và cấp độ')
            .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)))
        .addSubcommand(s => s.setName('gui').setDescription('Gửi tiền từ ví vào ngân hàng')
            .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true)))
        .addSubcommand(s => s.setName('rut').setDescription('Rút tiền từ ngân hàng về ví')
            .addStringOption(o => o.setName('amount').setDescription('Số tiền hoặc "all"').setRequired(true))),
    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        if (sub === 'gui') return move(interaction, true);
        if (sub === 'rut') return move(interaction, false);

        if (sub === 'balance') {
            const target = interaction.options.getUser('target') || interaction.user;
            const user = await db.getUser(target.id);
            if (!user) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: 'Hơ, mình chưa lấy được dữ liệu của cậu, thử lại sau chút nhé~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const p = getProgress(Number(user.exp));
            const wallet = Number(user.wallet).toLocaleString('vi-VN');
            const bank = Number(user.bank).toLocaleString('vi-VN');
            const energy = await db.getEnergy(target.id);

            const embed = buildWaguriEmbed(interaction, 'info', {
                fields: [
                    { name: '💵 Ví tiền', value: `${wallet} ${config.CURRENCY}`, inline: true },
                    { name: '🏦 Ngân hàng', value: `${bank} ${config.CURRENCY}`, inline: true },
                    { name: '⚡ Năng lượng', value: `${energy}/${config.ENERGY.MAX} ⚡`, inline: true },
                    { name: '⭐ Cấp độ', value: `Lv.${p.level}`, inline: true },
                    { name: `📊 Tiến trình EXP (${p.expIntoLevel}/${p.expForNextLevel})`, value: createWaguriBar(p.expIntoLevel, p.expForNextLevel, 12), inline: false }
                ]
            });

            embed.setAuthor({ name: `🌸・Tài khoản của ${target.username}`, iconURL: target.displayAvatarURL() });

            // Buff đang chạy (nếu có)
            if (user.buff_expires_at && new Date(user.buff_expires_at).getTime() > Date.now()) {
                const minsLeft = Math.ceil((new Date(user.buff_expires_at).getTime() - Date.now()) / 60000);
                const pct = Math.round((Number(user.buff_mult) - 1) * 100);
                embed.addFields({ name: '🍗 Hiệu ứng Buff', value: `+${pct}% thu nhập (còn ${minsLeft} phút)`, inline: false });
                embed.setFooter({
                    text: `🍗 Đang chạy buff +${pct}% · ${embed.data.footer.text}`,
                    iconURL: embed.data.footer.icon_url
                });
            }

            embed.setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }
    },
};
