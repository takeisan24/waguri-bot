const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

function getEventConfigForToday() {
    const now = new Date();
    const day = now.getDate();
    
    let targetType = 'ca_tuoi';
    let targetAmount = 200;
    let rewardItemId = 'tam_go';
    let rewardQty = 3;
    let title_vi = '⚓ Hội Cá Đại Dương';
    let title_en = '⚓ Ocean Fish Festival';
    let desc_vi = 'Cả server hãy chung tay quyên góp 200 Cá Tươi làm chả cá khổng lồ! 🐟';
    let desc_en = 'The entire server must contribute 200 Fresh Fish to make a giant fish cake! 🐟';
    let rewardDesc_vi = 'Tấm Gỗ x3 🪵';
    let rewardDesc_en = 'Wooden Plank x3 🪵';

    if (day % 3 === 0) {
        targetType = 'coins';
        targetAmount = 100000;
        rewardItemId = 'streak_freeze';
        rewardQty = 1;
        title_vi = '💵 Quỹ Cứu Trợ Kikyo';
        title_en = '💵 Kikyo Charity Fund';
        desc_vi = 'Chung tay đóng góp 100,000 xu để ủng hộ quỹ từ thiện Kikyo! 💝';
        desc_en = 'Join hands to contribute 100,000 coins to support the Kikyo charity fund! 💝';
        rewardDesc_vi = 'Đá Đông Cứng Chuỗi x1 🧊';
        rewardDesc_en = 'Streak Freeze x1 🧊';
    } else if (day % 2 === 0) {
        targetType = 'tam_go';
        targetAmount = 300;
        rewardItemId = 'thoi_sat';
        rewardQty = 3;
        title_vi = '🪵 Xây Dựng Đập Cây';
        title_en = '🪵 Build Timber Dam';
        desc_vi = 'Cả server hãy đóng góp 300 Tấm Gỗ để gia cố đập nước của thị trấn! 🌊';
        desc_en = 'The entire server must contribute 300 Wooden Planks to reinforce the town\'s water dam! 🌊';
        rewardDesc_vi = 'Thỏi Sắt x3 🪙';
        rewardDesc_en = 'Iron Ingot x3 🪙';
    }

    return { targetType, targetAmount, rewardItemId, rewardQty, title_vi, title_en, desc_vi, desc_en, rewardDesc_vi, rewardDesc_en };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('worldevent')
        .setDescription('Sự kiện cộng đồng toàn server 🌍')
        .addSubcommand(s => s.setName('view').setDescription('Xem tiến trình sự kiện co-op hôm nay'))
        .addSubcommand(s => s.setName('contribute').setDescription('Đóng góp tài nguyên vào sự kiện chung')
            .addIntegerOption(o => o.setName('amount').setDescription('Số lượng muốn đóng góp').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('claim').setDescription('Nhận phần thưởng co-op của ngày')),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        // 1. Lấy hoặc sinh sự kiện hôm nay
        let event = await db.getActiveWorldEvent();
        const evConf = getEventConfigForToday();
        
        if (!event) {
            const latest = await db.getLatestWorldEvent();
            if (latest && new Date(latest.ends_at).getDate() === new Date().getDate()) {
                event = latest;
            } else {
                const endsAt = new Date();
                endsAt.setHours(23, 59, 59, 999);
                event = await db.createWorldEvent(evConf.targetType, evConf.targetAmount, endsAt.toISOString());
            }
        }

        if (!event) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: 'Lỗi hệ thống khi tải sự kiện thế giới.'
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const isEn = locale.startsWith('en');
        const title = isEn ? evConf.title_en : evConf.title_vi;
        const desc = isEn ? evConf.desc_en : evConf.desc_vi;
        const rewardDesc = isEn ? evConf.rewardDesc_en : evConf.rewardDesc_vi;
        const targetLabel = event.target_type === 'coins' ? config.CURRENCY : (event.target_type === 'ca_tuoi' ? (isEn ? 'Fish' : 'Cá Tươi') : (isEn ? 'Plank' : 'Tấm Gỗ'));

        if (sub === 'view') {
            const contributions = await db.getWorldEventContributions(event.id);
            const myContrib = contributions.find(c => c.user_id === userId);
            const myAmount = myContrib ? Number(myContrib.amount) : 0;
            const pct = Math.round((Number(event.current_amount) / Number(event.target_amount)) * 100);

            // Tìm top 3 contributors
            let topText = isEn ? 'No contributions yet.' : 'Chưa có đóng góp nào.';
            if (contributions.length > 0) {
                const list = [];
                for (let i = 0; i < Math.min(3, contributions.length); i++) {
                    const c = contributions[i];
                    list.push(`**#${i + 1}** <@${c.user_id}>: ${fmt(c.amount, locale)} ${targetLabel}`);
                }
                topText = list.join('\n');
            }

            const reqMin = Math.ceil(Number(event.target_amount) * 0.01);
            const metMin = myAmount >= reqMin;

            const fields = [
                { name: isEn ? '📈 Progress' : '📈 Tiến trình', value: `${fmt(event.current_amount, locale)} / ${fmt(event.target_amount, locale)} ${targetLabel} (${pct}%)\n${createWaguriBar(Number(event.current_amount), Number(event.target_amount), 12)}`, inline: false },
                { name: isEn ? '🏆 Top Contributors' : '🏆 Đóng góp nhiều nhất', value: topText, inline: false },
                { name: isEn ? '🎁 Daily Reward' : '🎁 Phần thưởng ngày', value: rewardDesc, inline: true },
                { name: isEn ? '👤 Your Contribution' : '👤 Đóng góp của bạn', value: `${fmt(myAmount, locale)} ${targetLabel} (${metMin ? '✅ Đủ điều kiện nhận quà' : `❌ Cần đóng góp thêm để đạt mốc tối thiểu ${fmt(reqMin, locale)}`})`, inline: true }
            ];

            const timeLeftMs = new Date(event.ends_at).getTime() - Date.now();
            const hoursLeft = Math.max(0, Math.floor(timeLeftMs / 3600000));
            const minsLeft = Math.max(0, Math.floor((timeLeftMs % 3600000) / 60000));
            
            const embed = buildWaguriEmbed(interaction, event.completed ? 'success' : 'info', {
                locale,
                title,
                description: `${desc}\n\n⏱️ **${isEn ? 'Time Left' : 'Thời gian còn lại'}:** ${hoursLeft}h ${minsLeft}m`,
                fields
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'contribute') {
            const amount = interaction.options.getInteger('amount');
            
            // Đóng góp vào DB
            const r = await db.contributeWorldEvent(userId, event.id, amount);
            if (r === 'event_ended') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: isEn ? 'Today\'s event has already ended or completed!' : 'Sự kiện hôm nay đã kết thúc hoặc hoàn thành rồi!'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r === 'insufficient') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: isEn ? `You don't have enough ${targetLabel} in your wallet or inventory!` : `Cậu không đủ ${targetLabel} trong ví hoặc kho đồ!`
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r === 'ok') {
                // Fetch lại để xem có completed sau đóng góp này không
                const latestEvent = await db.getLatestWorldEvent();
                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: isEn ? 'Contribution Success' : 'Đóng góp thành công',
                    description: isEn 
                        ? `You have contributed **${fmt(amount, locale)} ${targetLabel}** to the co-op event!`
                        : `Cậu đã đóng góp thành công **${fmt(amount, locale)} ${targetLabel}** vào sự kiện chung của thị trấn! 🌍`
                });
                if (latestEvent && latestEvent.completed && !event.completed) {
                    embed.addFields({ name: '🎉 Completed! 🎉', value: isEn ? 'The co-op event is 100% completed! Everyone can now claim the reward.' : 'Mục tiêu co-op đã đạt 100%! Mọi người đóng góp trên 1% đều có thể nhận quà ngay.' });
                }
                return interaction.editReply({ embeds: [embed] });
            }
        }

        if (sub === 'claim') {
            if (!event.completed) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: isEn ? 'Today\'s co-op event is not completed yet! Keep contributing!' : 'Sự kiện hôm nay chưa hoàn thành! Hãy tiếp tục đóng góp cùng mọi người nhé.'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const reqMin = Math.ceil(Number(event.target_amount) * 0.01);
            const contributions = await db.getWorldEventContributions(event.id);
            const myContrib = contributions.find(c => c.user_id === userId);
            const myAmount = myContrib ? Number(myContrib.amount) : 0;

            if (myAmount < reqMin) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: isEn 
                        ? `You did not contribute enough! Minimum required is ${fmt(reqMin, locale)} ${targetLabel}.`
                        : `Cậu không đủ điều kiện nhận thưởng! Cần đóng góp tối thiểu **${fmt(reqMin, locale)} ${targetLabel}** (1% mục tiêu).`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const r = await db.claimWorldEventReward(userId, event.id);
            if (r === 'already_claimed') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: isEn ? 'You have already claimed your reward for this event.' : 'Cậu đã nhận phần thưởng cho sự kiện này rồi.'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r === 'ok') {
                // Thưởng vật phẩm
                await db.giveItemAdmin(userId, evConf.rewardItemId, evConf.rewardQty);
                
                const embed = buildWaguriEmbed(interaction, 'jackpot', {
                    locale,
                    title: isEn ? '🎁 Reward Claimed!' : '🎁 Nhận Quà Thành Công!',
                    description: isEn
                        ? `Thank you for your contribution! You received **${evConf.rewardQty}x ${evConf.rewardDesc_en}**.`
                        : `Cảm ơn sự đóng góp của cậu cho thị trấn! Cậu nhận được **${evConf.rewardQty}x ${evConf.rewardDesc_vi}**.`
                });
                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
};
