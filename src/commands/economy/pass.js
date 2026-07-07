// src/commands/economy/pass.js
// Lệnh Sổ Sứ Mệnh (Battle Pass) 📖
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const rewardsConfig = require('../../data/battlepass_rewards');
const bpLib = require('../../lib/battlepass');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pass')
        .setDescription('Xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖')
        .addSubcommand(s => s.setName('view').setDescription('Xem tiến trình Sổ Sứ Mệnh hiện tại'))
        .addSubcommand(s => s.setName('buy').setDescription('Mua Sổ Sứ Mệnh Premium')),
        
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const seasonId = bpLib.getCurrentSeasonId();
        const seasonLabel = bpLib.getSeasonLabel(seasonId, locale);

        if (sub === 'view') {
            // Lấy hoặc khởi tạo Battle Pass
            let bp = await db.getBattlePass(userId, seasonId);
            if (!bp) {
                await bpLib.addXp(userId, 0); // Kích hoạt bản ghi
                bp = await db.getBattlePass(userId, seasonId);
            }

            const currentLvl = Math.floor(bp.xp / rewardsConfig.XP_PER_LEVEL);
            const xpIntoLevel = bp.xp % rewardsConfig.XP_PER_LEVEL;
            const xpPct = Math.min(Math.floor((xpIntoLevel / rewardsConfig.XP_PER_LEVEL) * 100), 100);
            
            // Vẽ progress bar
            const filled = Math.min(Math.floor(xpPct / 10), 10);
            const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

            // Tìm 3 mốc quà tiếp theo để hiển thị
            let displayLevels = [];
            let startLvl = Math.max(1, currentLvl);
            if (currentLvl === rewardsConfig.MAX_LEVEL) {
                startLvl = rewardsConfig.MAX_LEVEL - 2;
            } else if (currentLvl > 1 && bp.claimed_free.includes(currentLvl) && (!bp.is_premium || bp.claimed_premium.includes(currentLvl))) {
                // Nếu đã nhận hết quà level hiện tại, hiển thị từ level kế tiếp
                startLvl = currentLvl + 1;
            }
            
            for (let i = 0; i < 3; i++) {
                const lvl = startLvl + i;
                if (lvl >= 1 && lvl <= rewardsConfig.MAX_LEVEL) {
                    displayLevels.push(lvl);
                }
            }

            let rewardsDesc = '';
            for (const lvl of displayLevels) {
                const r = rewardsConfig.REWARDS[lvl];
                if (!r) continue;

                const freeClaimed = bp.claimed_free.includes(lvl) 
                    ? t(locale, 'commands.pass.status_claimed') 
                    : (currentLvl >= lvl ? t(locale, 'commands.pass.status_claimable') : t(locale, 'commands.pass.status_locked'));
                const premiumClaimed = bp.claimed_premium.includes(lvl) 
                    ? t(locale, 'commands.pass.status_claimed') 
                    : (bp.is_premium ? (currentLvl >= lvl ? t(locale, 'commands.pass.status_claimable') : t(locale, 'commands.pass.status_locked')) : t(locale, 'commands.pass.status_no_premium'));

                const freeGift = formatRewardDetails(r.free, locale);
                const premiumGift = formatRewardDetails(r.premium, locale);

                rewardsDesc += `**Level ${lvl}**:\n`;
                rewardsDesc += `> 🔓 **Free**: ${freeGift}  *${freeClaimed}*\n`;
                if (r.premium) {
                    rewardsDesc += `> 👑 **Premium**: ${premiumGift}  *${premiumClaimed}*\n`;
                }
                rewardsDesc += '\n';
            }

            if (!rewardsDesc) {
                rewardsDesc = t(locale, 'commands.pass.all_claimed');
            }

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                locale,
                title: `📖・${seasonLabel}`,
                description: t(locale, 'commands.pass.view_desc', {
                    user: interaction.user.username,
                    level: currentLvl,
                    maxLevel: rewardsConfig.MAX_LEVEL,
                    bar,
                    currentXp: fmt(xpIntoLevel, locale),
                    maxXp: fmt(rewardsConfig.XP_PER_LEVEL, locale),
                    pct: xpPct,
                    status: bp.is_premium ? t(locale, 'commands.pass.tier_premium') : t(locale, 'commands.pass.tier_free'),
                    rewards: rewardsDesc
                }),
            }).setTimestamp()
              .setFooter({ text: t(locale, 'commands.pass.footer') });

            // Buttons
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`pass:claim_all:${userId}`)
                    .setLabel(t(locale, 'commands.pass.btn_claim_all'))
                    .setStyle(ButtonStyle.Success)
            );

            if (!bp.is_premium) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pass:buy_confirm:${userId}`)
                        .setLabel(t(locale, 'commands.pass.btn_buy_premium'))
                        .setStyle(ButtonStyle.Premium)
                );
            }

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        if (sub === 'buy') {
            const cost = rewardsConfig.PREMIUM_COST;
            const user = await db.getUser(userId);
            if (!user) {
                return interaction.editReply({ content: t(locale, 'common.db_error') });
            }

            const bp = await db.getBattlePass(userId, seasonId);
            if (bp && bp.is_premium) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pass.buy_already_premium')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            if (Number(user.wallet) < cost) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.pass.buy_insufficient', { cost: fmt(cost, locale), currency: config.CURRENCY, current: fmt(user.wallet, locale) })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Button xác nhận mua
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pass:buy_yes:${userId}`).setLabel(t(locale, 'commands.pass.btn_buy_yes')).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pass:buy_no:${userId}`).setLabel(t(locale, 'commands.pass.btn_buy_no')).setStyle(ButtonStyle.Secondary)
            );

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.pass.buy_title'),
                description: t(locale, 'commands.pass.buy_desc', { cost: fmt(cost, locale), season: seasonLabel })
            });

            return interaction.editReply({ embeds: [embed], components: [row] });
        }
    },

    // Xử lý các tương tác nút bấm của Sổ Sứ Mệnh
    async handleButton(interaction, args) {
        const action = args[0];
        const targetUserId = args[1];
        const userId = interaction.user.id;
        const locale = await getInteractionLanguage(interaction);

        if (userId !== targetUserId) {
            return interaction.reply({ content: t(locale, 'common.not_for_you'), flags: MessageFlags.Ephemeral });
        }

        const seasonId = bpLib.getCurrentSeasonId();
        const seasonLabel = bpLib.getSeasonLabel(seasonId, locale);

        // 1. Nhận toàn bộ quà
        if (action === 'claim_all') {
            await interaction.deferUpdate();
            const res = await bpLib.claimAll(userId);

            if (res.status === 'pass_not_found' || res.status === 'level_too_low' || res.status === 'nothing_to_claim') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pass.claim_none')
                });
                return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if (res.status === 'ok') {
                let giftText = '';
                if (res.coins > 0) giftText += t(locale, 'commands.pass.gift_coins', { amount: fmt(res.coins, locale) });
                if (res.title) giftText += t(locale, 'commands.pass.gift_title', { title: res.title });
                if (Object.keys(res.items).length > 0) {
                    giftText += t(locale, 'commands.pass.gift_items_header');
                    for (const [id, qty] of Object.entries(res.items)) {
                        const item = await db.getItem(id);
                        const itemName = item ? (t(locale, `data.items.${id}.name`) || item.name) : id;
                        giftText += t(locale, 'commands.pass.gift_item_line', { qty, name: itemName });
                    }
                }

                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.pass.claim_success_title'),
                    description: t(locale, 'commands.pass.claim_success_desc', {
                        free: res.freeLevels.length > 0 ? res.freeLevels.join(', ') : t(locale, 'common.none'),
                        premium: res.premiumLevels.length > 0 ? res.premiumLevels.join(', ') : t(locale, 'common.none'),
                        gift: giftText
                    })
                });

                // Cập nhật lại giao diện view
                await updateViewEmbed(interaction, userId, seasonId, seasonLabel, locale);
                return interaction.followUp({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'commands.pass.claim_error', { status: res.status })
            });
            return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }

        // 2. Click nút "Mở Premium (200k xu)" từ view
        if (action === 'buy_confirm') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const cost = rewardsConfig.PREMIUM_COST;
            const user = await db.getUser(userId);

            if (Number(user.wallet) < cost) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.pass.buy_insufficient', { cost: fmt(cost, locale), currency: config.CURRENCY, current: fmt(user.wallet, locale) })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pass:buy_yes:${userId}`).setLabel(t(locale, 'commands.pass.btn_buy_yes')).setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pass:buy_no:${userId}`).setLabel(t(locale, 'commands.pass.btn_buy_no')).setStyle(ButtonStyle.Secondary)
            );

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.pass.buy_title'),
                description: t(locale, 'commands.pass.buy_desc', { cost: fmt(cost, locale), season: seasonLabel })
            });

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        // 3. Hủy bỏ mua
        if (action === 'buy_no') {
            return interaction.update({ content: t(locale, 'commands.pass.buy_cancelled'), embeds: [], components: [] });
        }

        // 4. Đồng ý mua Premium Sổ Sứ Mệnh
        if (action === 'buy_yes') {
            await interaction.deferUpdate();
            const res = await bpLib.buyPremium(userId);

            if (res === 'ok') {
                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.pass.buy_success_title'),
                    description: t(locale, 'commands.pass.buy_success_desc', { season: seasonLabel })
                });

                // Cập nhật lại giao diện view nếu đây là interaction dạng update
                try {
                    await updateViewEmbed(interaction, userId, seasonId, seasonLabel, locale);
                } catch { /* Bỏ qua nếu là ephemeral reply */ }

                return interaction.followUp({ embeds: [embed] });
            }

            let errorMsg = t(locale, 'common.generic_error');
            if (res === 'insufficient_funds') errorMsg = t(locale, 'commands.pass.buy_insufficient_generic');
            if (res === 'already_premium') errorMsg = t(locale, 'commands.pass.buy_already_premium');

            const embed = buildWaguriEmbed(interaction, 'error', { locale, description: errorMsg });
            return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Hàm định dạng hiển thị chi tiết phần thưởng
function formatRewardDetails(reward, locale = 'vi') {
    if (!reward) return t(locale, 'common.none');
    const parts = [];
    if (reward.coins) parts.push(`**+${fmt(reward.coins, locale)}** ${config.CURRENCY}`);
    if (reward.title) parts.push(t(locale, 'commands.pass.format_title', { title: reward.title }));
    if (reward.items) {
        for (const [id, qty] of Object.entries(reward.items)) {
            parts.push(t(locale, 'commands.pass.format_item', { qty, name: id }));
        }
    }
    return parts.join(' + ');
}

// Helper cập nhật tin nhắn view cũ sau khi mua/nhận quà thành công
async function updateViewEmbed(interaction, userId, seasonId, seasonLabel, locale = 'vi') {
    const bp = await db.getBattlePass(userId, seasonId);
    if (!bp) return;

    const currentLvl = Math.floor(bp.xp / rewardsConfig.XP_PER_LEVEL);
    const xpIntoLevel = bp.xp % rewardsConfig.XP_PER_LEVEL;
    const xpPct = Math.min(Math.floor((xpIntoLevel / rewardsConfig.XP_PER_LEVEL) * 100), 100);
    const filled = Math.min(Math.floor(xpPct / 10), 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

    let displayLevels = [];
    let startLvl = Math.max(1, currentLvl);
    if (currentLvl === rewardsConfig.MAX_LEVEL) {
        startLvl = rewardsConfig.MAX_LEVEL - 2;
    } else if (currentLvl > 1 && bp.claimed_free.includes(currentLvl) && (!bp.is_premium || bp.claimed_premium.includes(currentLvl))) {
        startLvl = currentLvl + 1;
    }
    
    for (let i = 0; i < 3; i++) {
        const lvl = startLvl + i;
        if (lvl >= 1 && lvl <= rewardsConfig.MAX_LEVEL) {
            displayLevels.push(lvl);
        }
    }

    let rewardsDesc = '';
    for (const lvl of displayLevels) {
        const r = rewardsConfig.REWARDS[lvl];
        if (!r) continue;

        const freeClaimed = bp.claimed_free.includes(lvl) 
            ? t(locale, 'commands.pass.status_claimed') 
            : (currentLvl >= lvl ? t(locale, 'commands.pass.status_claimable') : t(locale, 'commands.pass.status_locked'));
        const premiumClaimed = bp.claimed_premium.includes(lvl) 
            ? t(locale, 'commands.pass.status_claimed') 
            : (bp.is_premium ? (currentLvl >= lvl ? t(locale, 'commands.pass.status_claimable') : t(locale, 'commands.pass.status_locked')) : t(locale, 'commands.pass.status_no_premium'));

        rewardsDesc += `**Level ${lvl}**:\n`;
        rewardsDesc += `> 🔓 **Free**: ${formatRewardDetails(r.free, locale)}  *${freeClaimed}*\n`;
        if (r.premium) {
            rewardsDesc += `> 👑 **Premium**: ${formatRewardDetails(r.premium, locale)}  *${premiumClaimed}*\n`;
        }
        rewardsDesc += '\n';
    }

    if (!rewardsDesc) {
        rewardsDesc = t(locale, 'commands.pass.all_claimed');
    }

    const embed = buildWaguriEmbed(interaction, 'jackpot', {
        locale,
        title: `📖・${seasonLabel}`,
        description: t(locale, 'commands.pass.view_desc', {
            user: interaction.user.username,
            level: currentLvl,
            maxLevel: rewardsConfig.MAX_LEVEL,
            bar,
            currentXp: fmt(xpIntoLevel, locale),
            maxXp: fmt(rewardsConfig.XP_PER_LEVEL, locale),
            pct: xpPct,
            status: bp.is_premium ? t(locale, 'commands.pass.tier_premium') : t(locale, 'commands.pass.tier_free'),
            rewards: rewardsDesc
        }),
    }).setTimestamp()
      .setFooter({ text: t(locale, 'commands.pass.footer') });

    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`pass:claim_all:${userId}`)
            .setLabel(t(locale, 'commands.pass.btn_claim_all'))
            .setStyle(ButtonStyle.Success)
    );

    if (!bp.is_premium) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`pass:buy_confirm:${userId}`)
                .setLabel(t(locale, 'commands.pass.btn_buy_premium'))
                .setStyle(ButtonStyle.Premium)
        );
    }

    await interaction.message.edit({ embeds: [embed], components: [row] });
}

