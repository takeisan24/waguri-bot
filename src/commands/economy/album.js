const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const collections = require('../../data/collections');

const fmt = n => Number(n).toLocaleString('vi-VN');

const RARITY_INFO = {
    common: { name: 'Thường', emoji: '⚪', color: '#B0C4DE' },
    uncommon: { name: 'Bất Thường', emoji: '🟢', color: '#32CD32' },
    rare: { name: 'Hiếm', emoji: '🔵', color: '#1E90FF' },
    epic: { name: 'Sử Thi', emoji: '🟣', color: '#9370DB' },
    legendary: { name: 'Huyền Thoại', emoji: '🟠', color: '#FF8C00' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('album')
        .setDescription('Xem sổ tay sưu tầm vật phẩm và nhận phần thưởng bộ sưu tập 📖')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
        
    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('target') || interaction.user;
        const isSelf = target.id === interaction.user.id;
        
        // 1. Fetch dữ liệu từ DB
        const [allItems, userDiscoveries, user] = await Promise.all([
            db.getItems(),
            db.getDiscoveries(target.id),
            db.getUser(target.id)
        ]);

        if (!user) {
            return interaction.editReply({
                embeds: [buildWaguriEmbed(interaction, 'error', { description: 'Không tìm thấy thông tin người dùng này~' })]
            });
        }

        // Đọc danh sách đã nhận thưởng
        const { data: claimedRewardsData, error: claimedError } = await db.supabase
            .from('user_collection_rewards')
            .select('set_id')
            .eq('user_id', target.id);
        
        const claimedSets = new Set((claimedRewardsData || []).map(r => r.set_id));

        // 2. Tính toán thống kê theo Rarity
        const rarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
        const userRarityCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };

        for (const item of allItems) {
            const rarity = item.rarity || 'common';
            if (rarityCounts[rarity] !== undefined) {
                rarityCounts[rarity]++;
                if (userDiscoveries.has(item.id)) {
                    userRarityCounts[rarity]++;
                }
            }
        }

        const totalItems = allItems.length;
        const totalDiscovered = userDiscoveries.size;
        const pctDiscovered = totalItems > 0 ? Math.round((totalDiscovered / totalItems) * 100) : 0;

        // 3. Xây dựng trang Embed Sổ tay Sưu tầm
        const buildMainEmbed = () => {
            const desc = `📖 **Sổ Tay Sưu Tầm của ${target.username}**\n` +
                         `Tiến trình tổng: **${totalDiscovered}/${totalItems}** vật phẩm đã phát hiện (**${pctDiscovered}%**)\n\n` +
                         `__**Thống kê theo Độ Hiếm:**__\n` +
                         Object.entries(RARITY_INFO).map(([key, info]) => {
                             const userCount = userRarityCounts[key];
                             const sysCount = rarityCounts[key];
                             const pct = sysCount > 0 ? Math.round((userCount / sysCount) * 100) : 0;
                             return `${info.emoji} **${info.name}**: **${userCount}/${sysCount}** món (${pct}%)`;
                         }).join('\n');

            return buildWaguriEmbed(interaction, 'info', {
                title: `📖 Album Sưu Tầm của ${target.username}`,
                description: desc,
                thumbnail: target.displayAvatarURL()
            }).setFooter({
                text: isSelf ? 'Bấm các nút bên dưới để nhận thưởng khi hoàn thành bộ sưu tập!' : 'Đang xem album của người khác',
                iconURL: target.displayAvatarURL()
            });
        };

        // 4. Xây dựng trang Embed Bộ Sưu Tập (Sets)
        const buildSetsEmbed = () => {
            const embed = new EmbedBuilder()
                .setTitle(`🎨 Các Bộ Sưu Tập Đặc Biệt — ${target.username}`)
                .setColor(config.COLORS.INFO)
                .setThumbnail(target.displayAvatarURL());

            let desc = '';
            for (const set of collections) {
                const isClaimed = claimedSets.has(set.id);
                const hasAll = set.items.every(id => userDiscoveries.has(id));
                
                let statusIcon = '🔒 Chưa hoàn thành';
                if (isClaimed) statusIcon = '✅ Đã nhận thưởng';
                else if (hasAll) statusIcon = '🎁 Sẵn sàng nhận!';

                // Danh sách item kèm trạng thái mở khóa
                const itemLines = set.items.map(itemId => {
                    const it = allItems.find(i => i.id === itemId);
                    const itName = it ? it.name : itemId;
                    const rInfo = RARITY_INFO[it?.rarity || 'common'];
                    const hasIt = userDiscoveries.has(itemId);
                    return hasIt ? ` 🏅 **${itName}** (${rInfo.emoji} ${rInfo.name})` : ` 🔒 *${itName}* (chưa phát hiện)`;
                }).join('\n');

                desc += `### ${set.emoji} **${set.name}**\n` +
                        `*${set.desc}*\n` +
                        `**Trạng thái**: ${statusIcon}\n` +
                        `**Phần thưởng**: **+${fmt(set.reward_coins)}** xu + Danh hiệu \`${set.title}\`\n` +
                        `**Vật phẩm yêu cầu:**\n${itemLines}\n\n` +
                        `***\n\n`;
            }
            embed.setDescription(desc);
            return embed;
        };

        // 5. Tạo các Button
        const makeComponents = () => {
            const row1 = new ActionRowBuilder();
            
            // Các nút nhận thưởng chỉ bật nếu là chính mình (isSelf)
            for (const set of collections) {
                const isClaimed = claimedSets.has(set.id);
                const hasAll = set.items.every(id => userDiscoveries.has(id));
                
                let btnStyle = ButtonStyle.Secondary;
                let disabled = true;
                let label = set.name;

                if (isClaimed) {
                    btnStyle = ButtonStyle.Success;
                    label = `Đã nhận ${set.emoji}`;
                    disabled = true;
                } else if (hasAll && isSelf) {
                    btnStyle = ButtonStyle.Primary;
                    label = `Nhận ${set.emoji}`;
                    disabled = false;
                } else {
                    label = `Chưa đủ ${set.emoji}`;
                    disabled = true;
                }

                row1.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`claim_${set.id}`)
                        .setLabel(label)
                        .setStyle(btnStyle)
                        .setDisabled(disabled)
                );
            }

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('view_main')
                    .setLabel('Thống kê')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('view_sets')
                    .setLabel('Bộ Sưu Tập')
                    .setStyle(ButtonStyle.Secondary)
            );

            return [row1, row2];
        };

        // Gửi tin nhắn ban đầu
        const mainEmbed = buildMainEmbed();
        const components = makeComponents();
        
        const message = await interaction.editReply({
            embeds: [mainEmbed],
            components
        });

        // Tạo collector xử lý tương tác
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000 // 60 giây tương tác
        });

        collector.on('collect', async i => {
            // Chỉ chủ nhân lệnh mới có quyền nhấn
            if (i.user.id !== interaction.user.id) {
                return i.reply({
                    content: '🌸 Cậu không phải là người gọi lệnh này nên không nhấn được nhé~',
                    ephemeral: true
                });
            }

            const customId = i.customId;

            // Xử lý chuyển tab
            if (customId === 'view_main') {
                await i.update({ embeds: [buildMainEmbed()], components: makeComponents() });
                return;
            }
            if (customId === 'view_sets') {
                await i.update({ embeds: [buildSetsEmbed()], components: makeComponents() });
                return;
            }

            // Xử lý nhận thưởng
            if (customId.startsWith('claim_')) {
                await i.deferUpdate();
                const setId = customId.replace('claim_', '');
                const set = collections.find(s => s.id === setId);
                if (!set) return;

                const result = await db.claimCollectionReward(
                    interaction.user.id,
                    set.id,
                    set.items,
                    set.reward_coins,
                    set.title
                );

                if (result === 'ok') {
                    claimedSets.add(set.id);
                    // Cập nhật lại giao diện ngay lập tức
                    await interaction.editReply({
                        embeds: [buildSetsEmbed()],
                        components: makeComponents()
                    });
                    
                    // Gửi tin chúc mừng riêng
                    await interaction.followUp({
                        content: `🎉 Chúc mừng **${interaction.user.username}** đã hoàn thành bộ sưu tập **${set.name}**!\n` +
                                 `🎁 Nhận thành công **+${fmt(set.reward_coins)}** xu và danh hiệu mới: \`${set.title}\`! 🌟`,
                        ephemeral: false
                    });
                } else if (result === 'already_claimed') {
                    await interaction.followUp({ content: 'Cậu đã nhận phần thưởng cho bộ sưu tập này từ trước rồi nhé~ 🌸', ephemeral: true });
                } else if (result === 'not_completed') {
                    await interaction.followUp({ content: 'Cậu chưa thu thập đủ tất cả các vật phẩm yêu cầu đâu~ Hãy đi cày cuốc tiếp nhé! 💪', ephemeral: true });
                } else {
                    await interaction.followUp({ content: 'Có lỗi xảy ra khi nhận thưởng, cậu vui lòng thử lại sau nhé! 😟', ephemeral: true });
                }
            }
        });

        collector.on('end', () => {
            // Khi hết thời gian, disable tất cả các button để tránh treo tương tác
            const disabledComponents = makeComponents().map(row => {
                const newRow = new ActionRowBuilder();
                row.components.forEach(btn => {
                    newRow.addComponents(ButtonBuilder.from(btn).setDisabled(true));
                });
                return newRow;
            });
            
            interaction.editReply({ components: disabledComponents }).catch(() => {});
        });
    }
};
