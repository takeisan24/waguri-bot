// ============================================================
// /loan — Quỹ Tín Dụng Học Đường Kikyo (Vay Hệ Thống)
//
// Cơ chế: Người chơi vay trực tiếp từ quỹ hệ thống Waguri dựa theo cấp độ,
// không hỗ trợ vay giữa người chơi để chống toxic, lừa đảo, phá giá kinh tế.
// ============================================================
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getLevelFromExp } = require('../../lib/leveling');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loan')
        .setNameLocalizations({
            vi: 'vay'
        })
        .setDescription('Quỹ tín dụng học đường Kikyo 🤝 — vay vốn & trả nợ hệ thống')
        .setDescriptionLocalizations({
            vi: 'Quỹ tín dụng học đường Kikyo 🤝 — vay vốn & trả nợ hệ thống',
            'en-US': 'Kikyo student credit fund 🤝 — borrow & repay system loans',
            'en-GB': 'Kikyo student credit fund 🤝 — borrow & repay system loans'
        })
        .addSubcommand(s => s.setName('borrow')
            .setDescription('Vay vốn sinh hoạt/làm ăn từ Quỹ tín dụng Kikyo')
            .setDescriptionLocalizations({
                vi: 'Vay vốn sinh hoạt/làm ăn từ Quỹ tín dụng Kikyo',
                'en-US': 'Borrow funds from the Kikyo credit fund',
                'en-GB': 'Borrow funds from the Kikyo credit fund'
            })
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền muốn vay (nhập > 0)').setRequired(true).setMinValue(1000)
                .setDescriptionLocalizations({
                    vi: 'Số tiền muốn vay (nhập > 0)',
                    'en-US': 'Amount to borrow (> 0)',
                    'en-GB': 'Amount to borrow (> 0)'
                })))
        .addSubcommand(s => s.setName('pay')
            .setDescription('Thanh toán khoản nợ hiện tại')
            .setDescriptionLocalizations({
                vi: 'Thanh toán khoản nợ hiện tại',
                'en-US': 'Repay your active loan',
                'en-GB': 'Repay your active loan'
            })
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền trả (bỏ trống = trả toàn bộ)').setRequired(false).setMinValue(1)
                .setDescriptionLocalizations({
                    vi: 'Số tiền trả (bỏ trống = trả toàn bộ)',
                    'en-US': 'Repayment amount (leave empty for full payment)',
                    'en-GB': 'Repayment amount (leave empty for full payment)'
                })))
        .addSubcommand(s => s.setName('status')
            .setDescription('Xem hạn mức tín dụng và tình trạng nợ của cậu 📊')
            .setDescriptionLocalizations({
                vi: 'Xem hạn mức tín dụng và tình trạng nợ của cậu 📊',
                'en-US': 'Check your credit limit and active loan status 📊',
                'en-GB': 'Check your credit limit and active loan status 📊'
            })),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale === 'en' || locale?.startsWith('en');
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        const user = await db.getUser(userId);
        if (!user) {
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.db_error') })]
            });
        }

        const level = getLevelFromExp(Number(user.exp || 0));
        // Hạn mức tín dụng: Cấp 5 trở lên mới được vay. Tối đa 500.000 xu.
        const maxCreditLimit = level < 5 ? 0 : Math.min(500000, level * 10000);

        // 1) status: Xem thông tin hạn mức và khoản nợ
        if (sub === 'status') {
            const loans = await db.loansOf(userId);
            const activeLoan = loans?.vay?.find(l => l.status === 'active' || l.status === 'overdue');

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: `${config.CORE_THEMES.LOAN.EMOJI} ` + (isEn ? 'Kikyo Student Credit Bureau' : 'Quỹ Tín Dụng Học Đường Kikyo'),
                description: isEn
                    ? `Welcome to the Kikyo Credit Fund! Loans are granted based on your Level reputation to support student ventures.\n\n` +
                      `🎖️ **Your Level:** \`Lv.${level}\`\n` +
                      `💳 **Credit Limit:** **${fmt(maxCreditLimit, locale)}** ${config.CURRENCY} ${level < 5 ? '*(Requires Level 5)*' : ''}\n` +
                      `📈 **Interest Rate:** \`2%/day\` (repay within 7 days)`
                    : `Chào mừng cậu đến với Quỹ Tín Dụng Học Đường Kikyo! Hạn mức vay được cấp dựa trên Cấp độ uy tín của cậu.\n\n` +
                      `🎖️ **Cấp độ của cậu:** \`Lv.${level}\`\n` +
                      `💳 **Hạn mức vay tối đa:** **${fmt(maxCreditLimit, locale)}** ${config.CURRENCY} ${level < 5 ? '*(Cần Cấp 5 trở lên)*' : ''}\n` +
                      `📈 **Lãi suất:** \`2%/ngày\` (thời hạn 7 ngày)`
            }).setColor(config.CORE_THEMES.LOAN.COLOR);

            if (activeLoan) {
                const dueTs = Math.floor(new Date(activeLoan.due_at).getTime() / 1000);
                const isOverdue = new Date(activeLoan.due_at).getTime() < Date.now();
                embed.addFields({
                    name: isEn ? '⚠️ Active Loan' : '⚠️ Khoản Nợ Đang Hoạt Động',
                    value: isEn
                        ? `• Original Principal: **${fmt(activeLoan.principal, locale)}** ${config.CURRENCY}\n` +
                          `• Remaining Due: **${fmt(activeLoan.remaining, locale)}** ${config.CURRENCY}\n` +
                          `• Due Date: <t:${dueTs}:R> ${isOverdue ? '🔴 **OVERDUE**' : '🟢'}`
                        : `• Số tiền vay gốc: **${fmt(activeLoan.principal, locale)}** ${config.CURRENCY}\n` +
                          `• Số tiền cần trả: **${fmt(activeLoan.remaining, locale)}** ${config.CURRENCY}\n` +
                          `• Hạn chót: <t:${dueTs}:R> ${isOverdue ? '🔴 **QUÁ HẠN**' : '🟢'}`
                });

                const buttons = [
                    new ButtonBuilder()
                        .setCustomId('loan_btn_pay_all')
                        .setLabel(isEn ? '💳 Clear Full Debt' : '💳 Trả Hết Nợ Ngay')
                        .setStyle(ButtonStyle.Success)
                ];

                const row = new ActionRowBuilder().addComponents(buttons);
                const msg = await interaction.editReply({ embeds: [embed], components: [row] });

                const collector = msg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60_000,
                    max: 1
                });

                collector.on('collect', async i => {
                    if (i.user.id !== userId) {
                        return i.reply({ content: isEn ? 'Not your loan!' : 'Đây là hồ sơ của người khác nhen! 🌸', ephemeral: true });
                    }
                    await i.deferUpdate();
                    const curUser = await db.getUser(userId);
                    const wallet = Number(curUser?.wallet || 0);
                    const remainingDebt = Number(activeLoan.remaining || 0);

                    if (wallet < remainingDebt) {
                        const warnEmbed = buildWaguriEmbed(interaction, 'warning', {
                            locale,
                            title: isEn ? '⚠️ Insufficient Funds' : '⚠️ Ví Không Đủ Tiền',
                            description: isEn
                                ? `You need **${fmt(remainingDebt, locale)}** ${config.CURRENCY} to clear your debt, but only have **${fmt(wallet, locale)}** ${config.CURRENCY} in your wallet!`
                                : `Cậu cần **${fmt(remainingDebt, locale)}** ${config.CURRENCY} để tất toán nợ, nhưng trong ví chỉ còn **${fmt(wallet, locale)}** ${config.CURRENCY}!`
                        }).setColor(config.CORE_THEMES.LOAN.COLOR);
                        await interaction.editReply({ embeds: [warnEmbed], components: [] });
                        collector.stop('acted');
                        return;
                    }

                    const repayRes = await db.loanRepay(userId, activeLoan.id, remainingDebt);
                    if (!repayRes || !repayRes.ok) {
                        return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.generic_error') })], components: [] });
                    }

                    const successEmbed = buildWaguriEmbed(interaction, 'success', {
                        locale,
                        title: isEn ? '🎉 Debt Cleared Successfully!' : '🎉 Tất Toán Nợ Thành Công!',
                        description: isEn
                            ? `You have fully paid off your loan of **${fmt(remainingDebt, locale)}** ${config.CURRENCY}! Your credit standing is in pristine shape. 🌸`
                            : `Cậu đã trả hết toàn bộ khoản nợ **${fmt(remainingDebt, locale)}** ${config.CURRENCY}! Hồ sơ tín dụng của cậu đã hoàn toàn sạch sẽ nhen. 🌸`
                    }).setColor(config.CORE_THEMES.LOAN.COLOR);

                    await interaction.editReply({ embeds: [successEmbed], components: [] });
                    collector.stop('acted');
                });

                collector.on('end', async (_, reason) => {
                    if (reason !== 'acted') {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            buttons.map(b => ButtonBuilder.from(b).setDisabled(true))
                        );
                        await interaction.editReply({ components: [disabledRow] }).catch(() => {});
                    }
                });

                return;
            } else {
                embed.addFields({
                    name: isEn ? '✨ Credit Status' : '✨ Tình Trạng Tín Dụng',
                    value: isEn ? '✅ Clean record. No active loans.' : '✅ Lý lịch trong sạch. Cậu không có khoản nợ nào.'
                });
            }

            return interaction.editReply({ embeds: [embed] });
        }

        // 2) borrow: Vay tiền
        if (sub === 'borrow') {
            if (level < 5) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        title: isEn ? '⚠️ Loan Denied' : '⚠️ Không Đủ Điều Kiện Vay',
                        description: isEn
                            ? `Cậu cần đạt tối thiểu **Cấp 5** để mở khóa Quỹ Tín Dụng Học Đường nhen!`
                            : `Cậu cần đạt tối thiểu **Cấp 5** để mở khóa Quỹ Tín Dụng Học Đường nhen!`
                    })]
                });
            }

            const loans = await db.loansOf(userId);
            const activeLoan = loans?.vay?.find(l => l.status === 'active' || l.status === 'overdue');
            if (activeLoan) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        title: isEn ? '⚠️ Active Loan Exists' : '⚠️ Cậu Còn Khoản Nợ Chưa Trả',
                        description: isEn
                            ? `You already have an outstanding loan of **${fmt(activeLoan.remaining, locale)}** ${config.CURRENCY}. Please use \`/loan pay\` to clear it first!`
                            : `Cậu vẫn còn một khoản nợ **${fmt(activeLoan.remaining, locale)}** ${config.CURRENCY} chưa thanh toán. Hãy dùng \`/loan pay\` để trả hết nợ cũ trước nhé!`
                    })]
                });
            }

            const amount = interaction.options.getInteger('amount');
            if (amount > maxCreditLimit) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        title: isEn ? '⚠️ Exceeds Credit Limit' : '⚠️ Vượt Quá Hạn Mức Tín Dụng',
                        description: isEn
                            ? `Your current Level ${level} allows a maximum loan of **${fmt(maxCreditLimit, locale)}** ${config.CURRENCY}!`
                            : `Với Cấp độ ${level} hiện tại, hạn mức tối đa cậu có thể vay là **${fmt(maxCreditLimit, locale)}** ${config.CURRENCY} nhen!`
                    })]
                });
            }

            // Thực thi tạo khoản vay từ SYSTEM
            // 7 ngày, lãi 2%/ngày = 14% tổng
            const interest = Math.round(amount * 0.14);
            const totalDue = amount + interest;

            const res = await db.loanCreate('SYSTEM', userId, amount, 7, 0.02);
            if (!res || !res.ok) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.generic_error') })]
                });
            }

            // Giải ngân tiền vào ví cho người chơi
            await db.addMoney(userId, amount, 'wallet');

            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: isEn ? '💸 Loan Disbursed Successfully!' : '💸 Giải Ngân Vay Vốn Thành Công!',
                    description: isEn
                        ? `The Kikyo Student Fund has disbursed **+${fmt(amount, locale)}** ${config.CURRENCY} directly into your wallet!\n\n` +
                          `💳 **Amount Borrowed:** **${fmt(amount, locale)}** ${config.CURRENCY}\n` +
                          `📈 **Interest (7 days):** **+${fmt(interest, locale)}** ${config.CURRENCY}\n` +
                          `⏳ **Total Due:** **${fmt(totalDue, locale)}** ${config.CURRENCY} *(Due in 7 days)*\n\n` +
                          `📌 *Tip: Use \`/loan pay\` to clear your debt anytime!*`
                        : `Quỹ Tín Dụng Học Đường Kikyo đã giải ngân **+${fmt(amount, locale)}** ${config.CURRENCY} vào ví của cậu!\n\n` +
                          `💳 **Số tiền vay:** **${fmt(amount, locale)}** ${config.CURRENCY}\n` +
                          `📈 **Tiền lãi ước tính (7 ngày):** **+${fmt(interest, locale)}** ${config.CURRENCY}\n` +
                          `⏳ **Tổng cần trả:** **${fmt(totalDue, locale)}** ${config.CURRENCY} *(Hạn trong 7 ngày)*\n\n` +
                          `📌 *Mẹo: Cậu có thể dùng \`/loan pay\` để trả nợ bất cứ lúc nào!*`
                })]
            });
        }

        // 3) pay: Trả nợ
        if (sub === 'pay') {
            const loans = await db.loansOf(userId);
            const activeLoan = loans?.vay?.find(l => l.status === 'active' || l.status === 'overdue');
            if (!activeLoan) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'info', {
                        locale,
                        title: isEn ? '✨ No Debt' : '✨ Không Có Nợ',
                        description: isEn ? 'You do not have any active loans to repay!' : 'Cậu không có khoản nợ nào cần thanh toán cả!'
                    })]
                });
            }

            const wallet = Number(user.wallet || 0);
            const payAmount = interaction.options.getInteger('amount') || Number(activeLoan.remaining);

            if (payAmount <= 0) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: isEn ? 'Invalid payment amount!' : 'Số tiền trả không hợp lệ!'
                    })]
                });
            }

            if (wallet < payAmount) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        title: isEn ? '⚠️ Insufficient Funds' : '⚠️ Ví Không Đủ Tiền',
                        description: isEn
                            ? `You need **${fmt(payAmount, locale)}** ${config.CURRENCY} but only have **${fmt(wallet, locale)}** in your wallet!`
                            : `Cậu cần **${fmt(payAmount, locale)}** ${config.CURRENCY} để trả nợ nhưng trong ví chỉ có **${fmt(wallet, locale)}** xu!`
                    })]
                });
            }

            const repayRes = await db.loanRepay(userId, activeLoan.id, payAmount);
            if (!repayRes || !repayRes.ok) {
                return interaction.editReply({
                    embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.generic_error') })]
                });
            }

            const isFullyPaid = repayRes.status === 'paid' || Number(repayRes.remaining || 0) <= 0;

            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: isEn ? '🎉 Debt Repayment Successful!' : '🎉 Thanh Toán Nợ Thành Công!',
                    description: isEn
                        ? `You have paid **${fmt(payAmount, locale)}** ${config.CURRENCY} towards your loan!\n\n` +
                          `${isFullyPaid ? '✨ **Congratulations! Your loan is completely PAID OFF!** 🌸' : `⏳ Remaining balance: **${fmt(repayRes.remaining, locale)}** ${config.CURRENCY}`}`
                        : `Cậu đã thanh toán **${fmt(payAmount, locale)}** ${config.CURRENCY} vào khoản nợ!\n\n` +
                          `${isFullyPaid ? '✨ **Chúc mừng cậu! Khoản nợ đã được thanh toán SẠCH SẼ!** 🌸' : `⏳ Số nợ còn lại: **${fmt(repayRes.remaining, locale)}** ${config.CURRENCY}`}`
                })]
            });
        }
    },
};
