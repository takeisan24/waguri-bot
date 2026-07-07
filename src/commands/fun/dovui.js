const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
// Chuẩn hoá: thường hoá, bỏ dấu tiếng Việt, gộp khoảng trắng.
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();

const active = new Set(); // channelId đang có ván đố

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dovui')
        .setDescription('Đố vui 🧠 — trả lời nhanh & đúng nhất trong chat để thắng thưởng'),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        if (active.has(interaction.channelId)) {
            const embed = buildWaguriEmbed(interaction, 'warning', { 
                locale,
                title: t(locale, 'commands.dovui.title'), 
                description: t(locale, 'commands.dovui.active_game') 
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        // Cooldown mỗi người chống spam tạo câu đố để farm (đáp án thuộc bộ cố định).
        const cd = await db.claimCooldown(interaction.user.id, 'dovui', 60);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', { 
                locale,
                title: t(locale, 'commands.dovui.title'), 
                description: t(locale, 'commands.dovui.cooldown', { time: `<t:${Math.floor(cd / 1000)}:R>` }) 
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        const QUIZ = locale === 'en' ? require('../../data/quiz_en') : require('../../data/quiz');
        const item = QUIZ[Math.floor(Math.random() * QUIZ.length)];
        const accepted = item.a.map(norm);
        active.add(interaction.channelId);

        const embedQ = buildWaguriEmbed(interaction, 'info', {
            locale,
            title: t(locale, 'commands.dovui.quiz_title'),
            description: t(locale, 'commands.dovui.quiz_desc', { 
                question: item.q, 
                amount: fmt(config.QUIZ.REWARD, locale), 
                currency: config.CURRENCY, 
                exp: config.QUIZ.EXP, 
                time: config.QUIZ.TIME_MS / 1000 
            })
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
                    locale,
                    description: t(locale, 'commands.dovui.won_desc', { 
                        user: m.author.id, 
                        answer: item.a[0], 
                        amount: fmt(config.QUIZ.REWARD, locale), 
                        currency: config.CURRENCY, 
                        exp: config.QUIZ.EXP 
                    })
                });
                await channel.send({ embeds: [embedWon] }).catch(() => {});
            });

            collector.on('end', () => {
                active.delete(interaction.channelId);
                if (!won) {
                    const embedTimeout = buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: t(locale, 'commands.dovui.timeout_desc', { answer: item.a[0] })
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
