const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { AFFECTION_TIERS, tierOf } = require('../../lib/ai/persona');
const { buildWaguriEmbed } = require('../../lib/embed');
const { loveTier } = require('../../lib/couple');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

const getAffectionTierName = (tierName, loc) => {
    const mapping = {
        '💞 Tri kỷ': { vi: '💞 Tri kỷ', en: '💞 Soulmate' },
        '💗 Thân thiết': { vi: '💗 Thân thiết', en: '💗 Close Friend' },
        '💓 Bạn thân': { vi: '💓 Bạn thân', en: '💓 Best Friend' },
        '💛 Quen biết': { vi: '💛 Quen biết', en: '💛 Acquaintance' },
        '🤍 Người mới': { vi: '🤍 Người mới', en: '🤍 Newcomer' }
    };
    return mapping[tierName]?.[loc.startsWith('en') ? 'en' : 'vi'] || tierName;
};

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
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();

        if (sub === 'marry') {
            await interaction.deferReply();
            const me = interaction.user;
            const target = interaction.options.getUser('user');

            if (!target) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.couple.marry_err_target_missing')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (target.bot) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.couple.marry_err_bot')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (target.id === me.id) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.couple.marry_err_self')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const [uMe, uTarget] = await Promise.all([db.getUser(me.id), db.getUser(target.id)]);
            if (uMe?.partner_id) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.couple.marry_err_already_married')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (uTarget?.partner_id) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.couple.marry_err_target_married', { target: target.id })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: t(locale, 'commands.couple.marry_embed_title'),
                description: t(locale, 'commands.couple.marry_embed_desc', {
                    me: me.id,
                    target: target.id,
                    cost: fmt(config.MARRY.COST, locale),
                    currency: config.CURRENCY
                })
            });
            const row = (disabled = false) => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('yes').setLabel(t(locale, 'commands.couple.btn_yes')).setStyle(ButtonStyle.Success).setDisabled(disabled),
                new ButtonBuilder().setCustomId('no').setLabel(t(locale, 'commands.couple.btn_no')).setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            );

            const msg = await interaction.editReply({ content: `<@${target.id}>`, embeds: [embed], components: [row()] });
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

            let answered = false;
            collector.on('collect', async (i) => {
                if (i.user.id !== target.id) {
                    return i.reply({ content: t(locale, 'commands.couple.marry_btn_wrong_user'), flags: MessageFlags.Ephemeral });
                }
                answered = true;
                if (i.customId === 'no') {
                    const noEmbed = buildWaguriEmbed(interaction, 'error', {
                        title: t(locale, 'commands.couple.marry_failed_title'),
                        description: t(locale, 'commands.couple.marry_rejected_desc', { me: me.id, target: target.id })
                    });
                    await i.update({ embeds: [noEmbed], components: [] });
                    return collector.stop('done');
                }
                // Phí cưới do người cầu hôn chi trả
                if (!await db.addMoney(me.id, -config.MARRY.COST, 'wallet')) {
                    const poorEmbed = buildWaguriEmbed(interaction, 'error', {
                        title: t(locale, 'commands.couple.marry_poor_title'),
                        description: t(locale, 'commands.couple.marry_poor_desc', {
                            me: me.id,
                            cost: fmt(config.MARRY.COST, locale),
                            currency: config.CURRENCY
                        })
                    });
                    await i.update({ embeds: [poorEmbed], components: [] });
                    return collector.stop('done');
                }
                const r = await db.marryUsers(me.id, target.id);
                if (r !== 'ok') await db.addMoney(me.id, config.MARRY.COST, 'wallet'); // hoàn phí nếu cưới hụt
                const done = r === 'ok'
                    ? buildWaguriEmbed(interaction, 'success', {
                        title: t(locale, 'commands.couple.marry_success_title'),
                        description: t(locale, 'commands.couple.marry_success_desc', {
                            me: me.id,
                            target: target.id,
                            cost: fmt(config.MARRY.COST, locale),
                            currency: config.CURRENCY
                        })
                    })
                    : buildWaguriEmbed(interaction, 'error', {
                        description: t(locale, 'commands.couple.marry_err_system')
                    });
                await i.update({ embeds: [done], components: [] });
                collector.stop('done');
            });
            collector.on('end', async () => {
                if (!answered) {
                    const timeoutEmbed = buildWaguriEmbed(interaction, 'warning', {
                        title: t(locale, 'commands.couple.marry_timeout_title'),
                        description: t(locale, 'commands.couple.marry_timeout_desc', { target: target.id })
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
                    description: t(locale, 'commands.couple.divorce_err_single')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const fee = config.MARRY.DIVORCE_COST;
            // Thu án phí TRƯỚC (atomic) — tránh ly hôn xong mà ví bị rút cạn xen giữa -> mất phí.
            if (!await db.addMoney(interaction.user.id, -fee, 'wallet')) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.couple.divorce_err_poor', {
                        cost: fmt(fee, locale),
                        currency: config.CURRENCY
                    })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.divorceUser(interaction.user.id);
            if (r !== 'ok') {
                await db.addMoney(interaction.user.id, fee, 'wallet'); // hoàn phí nếu không ly hôn được
                const embed = buildWaguriEmbed(interaction, r === 'single' ? 'warning' : 'error', {
                    description: r === 'single' ? t(locale, 'commands.couple.divorce_single') : t(locale, 'commands.couple.divorce_err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.couple.divorce_success_title'),
                description: t(locale, 'commands.couple.divorce_success_desc', {
                    partner: partner ? `<@${partner}>` : t(locale, 'commands.couple.divorce_partner_fallback'),
                    cost: fmt(fee, locale),
                    currency: config.CURRENCY
                })
            }).setTimestamp();
            await interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'status') {
            await interaction.deferReply();
            const target = interaction.options.getUser('target') || interaction.user;
            const user = await db.getUser(target.id);
            if (!user) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: t(locale, 'commands.couple.status_err_user')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const aff = Number(user.affection || 0);
            const tObj = tierOf(aff);

            // Tìm bậc kế tiếp (mảng xếp giảm dần theo min)
            const higher = [...AFFECTION_TIERS].reverse().find(x => x.min > aff);
            
            const nextLine = higher
                ? t(locale, 'commands.couple.status_affection_next', {
                    points: higher.min - aff,
                    tier: getAffectionTierName(higher.name, locale)
                })
                : t(locale, 'commands.couple.status_affection_max');

            let description = t(locale, 'commands.couple.status_affection_block', {
                tier: getAffectionTierName(tObj.name, locale),
                points: aff,
                next: nextLine
            });

            if (user.partner_id) {
                const partnerLove = Number(user.love || 0);
                description += t(locale, 'commands.couple.status_married_block', {
                    partner: user.partner_id,
                    love: partnerLove,
                    tier: loveTier(partnerLove, locale)
                });
            } else {
                description += t(locale, 'commands.couple.status_single_block');
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                description
            });

            embed.setAuthor({
                name: t(locale, 'commands.couple.status_author', { user: target.username }),
                iconURL: target.displayAvatarURL()
            });
            embed.setFooter({
                text: t(locale, 'commands.couple.status_footer') + ` • ${embed.data.footer.text}`,
                iconURL: embed.data.footer.icon_url
            });

            await interaction.editReply({ embeds: [embed] });
        }
    },
};
