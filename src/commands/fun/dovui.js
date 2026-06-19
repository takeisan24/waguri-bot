const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const QUIZ = require('../../data/quiz');

const fmt = n => Number(n).toLocaleString('vi-VN');
// Chuẩn hoá: thường hoá, bỏ dấu tiếng Việt, gộp khoảng trắng.
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

const active = new Set(); // channelId đang có ván đố

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dovui')
        .setDescription('Đố vui 🧠 — trả lời nhanh & đúng nhất trong chat để thắng thưởng'),
    async execute(interaction) {
        if (active.has(interaction.channelId)) {
            return interaction.reply({ content: 'Kênh này đang có một câu đố rồi, chờ xong đã nhé~ 🌸', flags: MessageFlags.Ephemeral });
        }
        const item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
        const accepted = item.a.map(norm);
        active.add(interaction.channelId);

        await interaction.reply({ embeds: [new EmbedBuilder()
            .setColor(config.COLORS.INFO)
            .setTitle('🧠 Đố Vui!')
            .setDescription(`**${item.q}**\n\nGõ đáp án vào chat — ai đúng & nhanh nhất thắng **${fmt(config.QUIZ.REWARD)}** ${config.CURRENCY} + ${config.QUIZ.EXP} EXP!\n⏰ ${config.QUIZ.TIME_MS / 1000}s`)] });

        const channel = interaction.channel;
        const collector = channel.createMessageCollector({ filter: m => !m.author.bot, time: config.QUIZ.TIME_MS });
        let won = false;

        collector.on('collect', async (m) => {
            if (!accepted.includes(norm(m.content))) return;
            won = true;
            collector.stop('won');
            await db.addMoney(m.author.id, config.QUIZ.REWARD, 'wallet');
            await db.updateExp(m.author.id, config.QUIZ.EXP);
            await channel.send({ embeds: [new EmbedBuilder().setColor(config.COLORS.SUCCESS)
                .setDescription(`🎉 <@${m.author.id}> trả lời đúng (**${item.a[0]}**) và nhận **${fmt(config.QUIZ.REWARD)}** ${config.CURRENCY} + ${config.QUIZ.EXP} EXP!`)] }).catch(() => {});
        });

        collector.on('end', () => {
            active.delete(interaction.channelId);
            if (!won) {
                channel.send({ embeds: [new EmbedBuilder().setColor(config.COLORS.WARNING)
                    .setDescription(`⏰ Hết giờ! Đáp án đúng là **${item.a[0]}**. Lần sau nhanh tay hơn nhé~ 🌸`)] }).catch(() => {});
            }
        });
    },
};
