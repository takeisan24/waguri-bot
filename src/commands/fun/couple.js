const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { AFFECTION_TIERS, tierOf } = require('../../lib/ai/persona');
const { buildWaguriEmbed } = require('../../lib/embed');
const { loveTier } = require('../../lib/couple');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('couple')
        .setDescription('Quản lý các mối quan hệ tình cảm 💞')
        .addSubcommand(s => s.setName('marry').setDescription('Cầu hôn kết hôn với một người 💍')
            .addUserOption(o => o.setName('user').setDescription('Người cậu muốn cầu hôn').setRequired(true)))
        .addSubcommand(s => s.setName('divorce').setDescription('Ly hôn / chia tay người ấy 💔'))
        .addSubcommand(s => s.setName('status').setDescription('Xem trạng thái tình cảm của cậu')
            .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false))),
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'marry') {
            await interaction.deferReply();
            const me = interaction.user;
            const target = interaction.options.getUser('user');

            if (!target) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu muốn cầu hôn ai? Nhập @người nhé~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (target.bot) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Bot không kết hôn được đâu~ 😆'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (target.id === me.id) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu không thể tự cưới chính mình đâu nha~ 😅'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const [uMe, uTarget] = await Promise.all([db.getUser(me.id), db.getUser(target.id)]);
            if (uMe?.partner_id) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu đang có đôi rồi mà~ Muốn cưới người khác thì `/couple divorce` trước nhé.'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (uTarget?.partner_id) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `<@${target.id}> đã có đôi mất rồi 💔`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '💍・Lời cầu hôn ngọt ngào',
                description: `<@${me.id}> muốn kết đôi với <@${target.id}>!\n\n<@${target.id}> ơi, cậu có đồng ý không? 🌸\n\n*(Phí tổ chức lễ cưới: **${fmt(config.MARRY.COST)}** ${config.CURRENCY} — <@${me.id}> chi trả khi thành công)*`
            });
            const row = (disabled = false) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('yes').setLabel('Đồng ý 💖').setStyle(ButtonStyle.Success).setDisabled(disabled),
                new ButtonBuilder().setCustomId('no').setLabel('Từ chối 💔').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            );

            const msg = await interaction.editReply({ content: `<@${target.id}>`, embeds: [embed], components: [row()] });
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

            let answered = false;
            collector.on('collect', async (i) => {
                if (i.user.id !== target.id) {
                    return i.reply({ content: 'Lời cầu hôn này không dành cho cậu đâu~ 😊', flags: MessageFlags.Ephemeral });
                }
                answered = true;
                if (i.customId === 'no') {
                    const noEmbed = buildWaguriEmbed(interaction, 'error', {
                        title: '💔・Cầu hôn thất bại',
                        description: `<@${target.id}> đã từ chối lời cầu hôn của <@${me.id}>... 💔`
                    });
                    await i.update({ embeds: [noEmbed], components: [] });
                    return collector.stop('done');
                }
                // Phí cưới do người cầu hôn chi trả
                if (!await db.addMoney(me.id, -config.MARRY.COST, 'wallet')) {
                    const poorEmbed = buildWaguriEmbed(interaction, 'error', {
                        title: '💔・Không đủ chi phí',
                        description: `<@${me.id}> không đủ **${fmt(config.MARRY.COST)}** ${config.CURRENCY} để tổ chức lễ cưới... 💔`
                    });
                    await i.update({ embeds: [poorEmbed], components: [] });
                    return collector.stop('done');
                }
                const r = await db.marryUsers(me.id, target.id);
                if (r !== 'ok') await db.addMoney(me.id, config.MARRY.COST, 'wallet'); // hoàn phí nếu cưới hụt
                const done = r === 'ok'
                    ? buildWaguriEmbed(interaction, 'success', { title: '🎉・Chúc mừng đôi uyên ương!', description: `<@${me.id}> 💞 <@${target.id}> giờ đã là một cặp! (Phí cưới **${fmt(config.MARRY.COST)}** ${config.CURRENCY}) Hạnh phúc nhé~ 🌸` })
                    : buildWaguriEmbed(interaction, 'error', { description: 'Ơ, có lỗi khi lưu đăng ký kết hôn, không thành công 💔' });
                await i.update({ embeds: [done], components: [] });
                collector.stop('done');
            });
            collector.on('end', async () => {
                if (!answered) {
                    const timeoutEmbed = buildWaguriEmbed(interaction, 'warning', {
                        title: '⏱️・Hết thời gian',
                        description: `Hết giờ rồi mà <@${target.id}> chưa trả lời... thử lại sau nhé~ 😢`
                    });
                    await interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
                }
            });
        }

        if (sub === 'divorce') {
            await interaction.deferReply();
            const user = await db.getUser(interaction.user.id);
            const partner = user?.partner_id;
            if (!partner) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu đang độc thân mà~ Đâu có ai để chia tay đâu 😅'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const fee = config.MARRY.DIVORCE_COST;
            // Thu án phí TRƯỚC (atomic) — tránh ly hôn xong mà ví bị rút cạn xen giữa -> mất phí.
            if (!await db.addMoney(interaction.user.id, -fee, 'wallet')) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Ly hôn cần **${fmt(fee)}** ${config.CURRENCY} án phí 😅 — ví cậu chưa đủ. Kiếm thêm rồi quay lại nhé~`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.divorceUser(interaction.user.id);
            if (r !== 'ok') {
                await db.addMoney(interaction.user.id, fee, 'wallet'); // hoàn phí nếu không ly hôn được
                const embed = buildWaguriEmbed(interaction, r === 'single' ? 'warning' : 'error', {
                    description: r === 'single' ? 'Cậu đang độc thân mà~ Đâu có ai để chia tay đâu 😅' : 'Ơ, có lỗi rồi, thử lại sau nhé~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '💔・Quyết định ly hôn',
                description: `Cậu và ${partner ? `<@${partner}>` : 'người ấy'} đã chính thức đường ai nấy đi rồi... Án phí **-${fmt(fee)}** ${config.CURRENCY}.\nMong cả hai sớm tìm lại sự bình yên và hạnh phúc mới nhé~ 🌸`
            }).setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'status') {
            await interaction.deferReply();
            const target = interaction.options.getUser('target') || interaction.user;
            const user = await db.getUser(target.id);
            if (!user) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: 'Hơ, mình chưa lấy được dữ liệu của cậu~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const aff = Number(user.affection || 0);
            const t = tierOf(aff);

            // Tìm bậc kế tiếp (mảng xếp giảm dần theo min)
            const higher = [...AFFECTION_TIERS].reverse().find(x => x.min > aff);
            const nextLine = higher ? `Còn **${higher.min - aff}** điểm nữa để lên **${higher.name}** với Waguri!` : 'Cậu đã đạt mức thân thiết cao nhất với Waguri rồi đó~ 🥰';

            let description = `**❤️ Thân thiết với Waguri:**\n` +
                `　• Mức hiện tại: **${t.name}**\n` +
                `　• Điểm thiện cảm: **${aff}** 💞\n` +
                `　• *${nextLine}*\n\n`;

            if (user.partner_id) {
                const partnerLove = Number(user.love || 0);
                description += `**💍 Tình trạng hôn nhân:**\n` +
                    `　• Bạn đời: <@${user.partner_id}>\n` +
                    `　• Điểm tình cảm: **${partnerLove}** 💞\n` +
                    `　• Mức độ: *${loveTier(partnerLove)}*`;
            } else {
                description += `**💍 Tình trạng hôn nhân:**\n` +
                    `　• Cậu hiện đang **Độc thân** 🌸 (Gõ \`/couple marry @người\` để cầu hôn nhé!)`;
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                description
            });

            embed.setAuthor({ name: `Trạng thái tình cảm của ${target.username}`, iconURL: target.displayAvatarURL() });
            embed.setFooter({
                text: `Tương tác làm tăng thân thiết và tình cảm~ • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
