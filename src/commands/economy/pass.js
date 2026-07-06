// src/commands/economy/pass.js
// Lệnh Sổ Sứ Mệnh (Battle Pass) 📖
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const rewardsConfig = require('../../data/battlepass_rewards');
const bpLib = require('../../lib/battlepass');
const { buildWaguriEmbed } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pass')
        .setDescription('Xem và nhận thưởng Sổ Sứ Mệnh (Battle Pass) 📖')
        .addSubcommand(s => s.setName('view').setDescription('Xem tiến trình Sổ Sứ Mệnh hiện tại'))
        .addSubcommand(s => s.setName('buy').setDescription(`Mua Sổ Sứ Mệnh Premium với giá ${fmt(rewardsConfig.PREMIUM_COST)} xu`)),
        
    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const seasonId = bpLib.getCurrentSeasonId();
        const seasonLabel = bpLib.getSeasonLabel(seasonId);

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

                const freeClaimed = bp.claimed_free.includes(lvl) ? '✅ [Đã nhận]' : (currentLvl >= lvl ? '🎁 [Có thể nhận]' : '🔒 [Chưa đạt]');
                const premiumClaimed = bp.claimed_premium.includes(lvl) ? '✅ [Đã nhận]' : (bp.is_premium ? (currentLvl >= lvl ? '🎁 [Có thể nhận]' : '🔒 [Chưa đạt]') : '🔒 [Chưa mở Premium]');

                const freeGift = formatRewardDetails(r.free);
                const premiumGift = formatRewardDetails(r.premium);

                rewardsDesc += `**Level ${lvl}**:\n`;
                rewardsDesc += `> 🔓 **Free**: ${freeGift}  *${freeClaimed}*\n`;
                if (r.premium) {
                    rewardsDesc += `> 👑 **Premium**: ${premiumGift}  *${premiumClaimed}*\n`;
                }
                rewardsDesc += '\n';
            }

            if (!rewardsDesc) {
                rewardsDesc = '> Cậu đã cày xong tất cả mốc của Sổ Sứ Mệnh mùa này rồi! Đỉnh quá đi nha~ 🎉';
            }

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                title: `📖・${seasonLabel}`,
                description: `Tiến trình cày cuốc của **${interaction.user.username}**:\n` +
                             `**Cấp độ**: **Lv.${currentLvl}** / ${rewardsConfig.MAX_LEVEL}\n` +
                             `**Kinh nghiệm**: \`[${bar}]\` **${fmt(xpIntoLevel)} / ${fmt(rewardsConfig.XP_PER_LEVEL)} XP** (${xpPct}%)\n` +
                             `**Trạng thái**: ${bp.is_premium ? '👑 **Sổ Cao Cấp (Premium)**' : '🔓 **Sổ Thường (Free)**'}\n\n` +
                             `**🎁 MỐC PHẦN THƯỞNG GẦN NHẤT:**\n${rewardsDesc}`,
            }).setTimestamp()
              .setFooter({ text: 'Gõ /pass view để cập nhật · w!pass để xem trên web' });

            // Buttons
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`pass:claim_all:${userId}`)
                    .setLabel('🔄 Nhận tất cả quà')
                    .setStyle(ButtonStyle.Success)
            );

            if (!bp.is_premium) {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pass:buy_confirm:${userId}`)
                        .setLabel('👑 Mở Premium (200k xu)')
                        .setStyle(ButtonStyle.Premium)
                );
            }

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        if (sub === 'buy') {
            const cost = rewardsConfig.PREMIUM_COST;
            const user = await db.getUser(userId);
            if (!user) {
                return interaction.editReply({ content: 'Không tìm thấy thông tin của cậu, vui lòng thử lại sau!' });
            }

            const bp = await db.getBattlePass(userId, seasonId);
            if (bp && bp.is_premium) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Cậu đã sở hữu Sổ Sứ Mệnh Premium mùa này rồi mà~ Cày cuốc nhận quà thôi nhé! 🌸`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            if (Number(user.wallet) < cost) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: `Cậu không đủ tiền mặt trong ví để mua Premium Pass rồi (Cần **${fmt(cost)}** ${config.CURRENCY}, ví hiện có **${fmt(user.wallet)}** ${config.CURRENCY}) 🥺`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Button xác nhận mua
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pass:buy_yes:${userId}`).setLabel('Đồng ý mua 💳').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pass:buy_no:${userId}`).setLabel('Hủy bỏ ❌').setStyle(ButtonStyle.Secondary)
            );

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '💳 Mở khóa Sổ Sứ Mệnh Premium',
                description: `Cậu có đồng ý chi **${fmt(cost)} xu** để mở khóa nhánh **Premium** của **${seasonLabel}** không? \n\n*Nhánh Premium mang lại cực nhiều phần quà sử thi và danh hiệu đặc quyền đó nha~*`
            });

            return interaction.editReply({ embeds: [embed], components: [row] });
        }
    },

    // Xử lý các tương tác nút bấm của Sổ Sứ Mệnh
    async handleButton(interaction, args) {
        const action = args[0];
        const targetUserId = args[1];
        const userId = interaction.user.id;

        if (userId !== targetUserId) {
            return interaction.reply({ content: 'Nút bấm này không dành cho cậu nha~ 🌸', flags: MessageFlags.Ephemeral });
        }

        const seasonId = bpLib.getCurrentSeasonId();
        const seasonLabel = bpLib.getSeasonLabel(seasonId);

        // 1. Nhận toàn bộ quà
        if (action === 'claim_all') {
            await interaction.deferUpdate();
            const res = await bpLib.claimAll(userId);

            if (res.status === 'pass_not_found' || res.status === 'level_too_low' || res.status === 'nothing_to_claim') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Hiện cậu không có phần thưởng nào chưa nhận ở cấp độ Sổ Sứ Mệnh hiện tại nha~ Cố gắng cày cuốc thêm nhé! 🌸`
                });
                return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if (res.status === 'ok') {
                let giftText = '';
                if (res.coins > 0) giftText += `\n💵 **+${fmt(res.coins)} xu**`;
                if (res.title) giftText += `\n🎖️ Danh hiệu độc quyền: **\`${res.title}\`**`;
                if (Object.keys(res.items).length > 0) {
                    giftText += `\n🎒 Vật phẩm:`;
                    for (const [id, qty] of Object.entries(res.items)) {
                        const item = await db.getItem(id);
                        giftText += `\n> **${qty}× ${item?.name || id}**`;
                    }
                }

                const embed = buildWaguriEmbed(interaction, 'success', {
                    title: '🎉 Nhận Quà Sổ Sứ Mệnh Thành Công!',
                    description: `Cậu đã nhận thành công toàn bộ quà chưa nhận ở các cấp độ:\n` +
                                 `🔓 Nhánh Free: **${res.freeLevels.length > 0 ? res.freeLevels.join(', ') : 'Không có'}**\n` +
                                 `👑 Nhánh Premium: **${res.premiumLevels.length > 0 ? res.premiumLevels.join(', ') : 'Không có'}**\n\n` +
                                 `**🎁 QUÀ ĐÃ CHUYỂN VÀO TÚI:**${giftText}`
                });

                // Cập nhật lại giao diện view
                await updateViewEmbed(interaction, userId, seasonId, seasonLabel);
                return interaction.followUp({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'error', {
                description: `Có lỗi xảy ra khi nhận quà: \`${res.status}\`. Cậu thử lại sau nhé!`
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
                    description: `Cậu không đủ tiền mặt trong ví để mua Premium Pass rồi (Cần **${fmt(cost)}** ${config.CURRENCY}, ví hiện có **${fmt(user.wallet)}** ${config.CURRENCY}) 🥺`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`pass:buy_yes:${userId}`).setLabel('Đồng ý mua 💳').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`pass:buy_no:${userId}`).setLabel('Hủy bỏ ❌').setStyle(ButtonStyle.Secondary)
            );

            const embed = buildWaguriEmbed(interaction, 'info', {
                title: '💳 Mở khóa Sổ Sứ Mệnh Premium',
                description: `Cậu có đồng ý chi **${fmt(cost)} xu** để mở khóa nhánh **Premium** của **${seasonLabel}** không?`
            });

            return interaction.editReply({ embeds: [embed], components: [row] });
        }

        // 3. Hủy bỏ mua
        if (action === 'buy_no') {
            return interaction.update({ content: 'Đã hủy bỏ giao dịch mua Sổ Sứ Mệnh Premium! 🌸', embeds: [], components: [] });
        }

        // 4. Đồng ý mua Premium Sổ Sứ Mệnh
        if (action === 'buy_yes') {
            await interaction.deferUpdate();
            const res = await bpLib.buyPremium(userId);

            if (res === 'ok') {
                const embed = buildWaguriEmbed(interaction, 'success', {
                    title: '👑 Kích Hoạt Premium Thành Công!',
                    description: `Chúc mừng cậu đã mở khóa thành công nhánh **Premium** của **${seasonLabel}**! \n\n*Giờ đây cậu có thể nhận toàn bộ quà VIP của các mốc cấp độ đã đạt được rồi nha~ Gõ lại \`/pass view\` và tận hưởng nào! 🎉*`
                });

                // Cập nhật lại giao diện view nếu đây là interaction dạng update
                try {
                    await updateViewEmbed(interaction, userId, seasonId, seasonLabel);
                } catch { /* Bỏ qua nếu là ephemeral reply */ }

                return interaction.followUp({ embeds: [embed] });
            }

            let errorMsg = 'Có lỗi xảy ra, thử lại sau nhé!';
            if (res === 'insufficient_funds') errorMsg = 'Cậu không đủ tiền mặt trong ví để thực hiện giao dịch!';
            if (res === 'already_premium') errorMsg = 'Cậu đã mở khóa Premium từ trước rồi!';

            const embed = buildWaguriEmbed(interaction, 'error', { description: errorMsg });
            return interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    }
};

// Hàm định dạng hiển thị chi tiết phần thưởng
function formatRewardDetails(reward) {
    if (!reward) return 'Không có';
    const parts = [];
    if (reward.coins) parts.push(`**+${fmt(reward.coins)} xu**`);
    if (reward.title) parts.push(`danh hiệu \`${reward.title}\``);
    if (reward.items) {
        for (const [id, qty] of Object.entries(reward.items)) {
            parts.push(`**${qty}x** item \`${id}\``); // Tạm thời dùng id, Wiki sẽ hiện tên đẹp
        }
    }
    return parts.join(' + ');
}

// Helper cập nhật tin nhắn view cũ sau khi mua/nhận quà thành công
async function updateViewEmbed(interaction, userId, seasonId, seasonLabel) {
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

        const freeClaimed = bp.claimed_free.includes(lvl) ? '✅ [Đã nhận]' : (currentLvl >= lvl ? '🎁 [Có thể nhận]' : '🔒 [Chưa đạt]');
        const premiumClaimed = bp.claimed_premium.includes(lvl) ? '✅ [Đã nhận]' : (bp.is_premium ? (currentLvl >= lvl ? '🎁 [Có thể nhận]' : '🔒 [Chưa đạt]') : '🔒 [Chưa mở Premium]');

        rewardsDesc += `**Level ${lvl}**:\n`;
        rewardsDesc += `> 🔓 **Free**: ${formatRewardDetails(r.free)}  *${freeClaimed}*\n`;
        if (r.premium) {
            rewardsDesc += `> 👑 **Premium**: ${formatRewardDetails(r.premium)}  *${premiumClaimed}*\n`;
        }
        rewardsDesc += '\n';
    }

    if (!rewardsDesc) {
        rewardsDesc = '> Cậu đã cày xong tất cả mốc của Sổ Sứ Mệnh mùa này rồi! Đỉnh quá đi nha~ 🎉';
    }

    const embed = buildWaguriEmbed(interaction, 'jackpot', {
        title: `📖・${seasonLabel}`,
        description: `Tiến trình cày cuốc của **${interaction.user.username}**:\n` +
                     `**Cấp độ**: **Lv.${currentLvl}** / ${rewardsConfig.MAX_LEVEL}\n` +
                     `**Kinh nghiệm**: \`[${bar}]\` **${fmt(xpIntoLevel)} / ${fmt(rewardsConfig.XP_PER_LEVEL)} XP** (${xpPct}%)\n` +
                     `**Trạng thái**: ${bp.is_premium ? '👑 **Sổ Cao Cấp (Premium)**' : '🔓 **Sổ Thường (Free)**'}\n\n` +
                     `**🎁 MỐC PHẦN THƯỞNG GẦN NHẤT:**\n${rewardsDesc}`,
    }).setTimestamp()
      .setFooter({ text: 'Gõ /pass view để cập nhật · w!pass để xem trên web' });

    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`pass:claim_all:${userId}`)
            .setLabel('🔄 Nhận tất cả quà')
            .setStyle(ButtonStyle.Success)
    );

    if (!bp.is_premium) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`pass:buy_confirm:${userId}`)
                .setLabel('👑 Mở Premium (200k xu)')
                .setStyle(ButtonStyle.Premium)
        );
    }

    await interaction.message.edit({ embeds: [embed], components: [row] });
}
