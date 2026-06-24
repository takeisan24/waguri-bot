const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
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
            const embed = buildWaguriEmbed(interaction, 'warning', { title: '🧠・Đố Vui', description: 'Kênh này đang có một câu đố rồi, chờ xong đã nhé~ 🌸' });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        // Cooldown mỗi người chống spam tạo câu đố để farm (đáp án thuộc bộ cố định).
        const cd = await db.claimCooldown(interaction.user.id, 'dovui', 60);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', { title: '🧠・Đố Vui', description: `Cậu vừa ra đố xong~ nghỉ chút rồi tạo câu mới <t:${Math.floor(cd / 1000)}:R> nhé! 🌸` });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        const item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
        const accepted = item.a.map(norm);
        active.add(interaction.channelId);

        const embedQ = buildWaguriEmbed(interaction, 'info', {
            title: '🧠・Đố Vui!',
            description: `**${item.q}**\n\nGõ đáp án vào chat — ai đúng & nhanh nhất thắng **${fmt(config.QUIZ.REWARD)}** ${config.CURRENCY} + ${config.QUIZ.EXP} EXP!\n⏰ ${config.QUIZ.TIME_MS / 1000}s`
        });

        try {
            await interaction.reply({ embeds: [embedQ] });

            const channel = interaction.channel;
            const collector = channel.createMessageCollector({ filter: m => !m.author.bot, time: config.QUIZ.TIME_MS });
            let won = false;

            collector.on('collect', async (m) => {
                if (won) return; // đã có người thắng -> bỏ qua mọi tin nhắn sau
                if (!accepted.includes(norm(m.content))) return;
                won = true;
                collector.stop('won');
                await db.addMoney(m.author.id, config.QUIZ.REWARD, 'wallet');
                await db.updateExp(m.author.id, config.QUIZ.EXP);
                const embedWon = buildWaguriEmbed(interaction, 'success', {
                    description: `🎉 <@${m.author.id}> trả lời đúng (**${item.a[0]}**) và nhận **${fmt(config.QUIZ.REWARD)}** ${config.CURRENCY} + ${config.QUIZ.EXP} EXP!`
                });
                await channel.send({ embeds: [embedWon] }).catch(() => {});
            });

            collector.on('end', () => {
                active.delete(interaction.channelId);
                if (!won) {
                    const embedTimeout = buildWaguriEmbed(interaction, 'warning', {
                        description: `⏰ Hết giờ! Đáp án đúng là **${item.a[0]}**. Lần sau nhanh tay hơn nhé~ 🌸`
                    });
                    channel.send({ embeds: [embedTimeout] }).catch(() => {});
                }
            });
        } catch (error) {
            active.delete(interaction.channelId);
            throw error;
        }
    },
};
