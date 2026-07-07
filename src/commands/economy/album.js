const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const collections = require('../../data/collections');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('album')
        .setDescription('Xem sổ tay sưu tầm vật phẩm và nhận phần thưởng bộ sưu tập 📖')
        .addUserOption(o => o.setName('target').setDescription('Người muốn xem (mặc định: bạn)').setRequired(false)),
        
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
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
                embeds: [buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'common.db_error') })]
            });
        }

        // Đọc danh sách đã nhận thưởng
        const { data: claimedRewardsData, error: claimedError } = await db.supabase
            .from('user_collection_rewards')
            .select('set_id')
            .eq('user_id', target.id);
        
        const claimedSets = new Set((claimedRewardsData || []).map(r => r.set_id));

        const RARITY_INFO = {
            common: { name: t(locale, 'rarity.common'), emoji: '⚪', color: '#B0C4DE' },
            uncommon: { name: t(locale, 'rarity.uncommon'), emoji: '🟢', color: '#32CD32' },
            rare: { name: t(locale, 'rarity.rare'), emoji: '🔵', color: '#1E90FF' },
            epic: { name: t(locale, 'rarity.epic'), emoji: '🟣', color: '#9370DB' },
            legendary: { name: t(locale, 'rarity.legendary'), emoji: '🟠', color: '#FF8C00' }
        };

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
            const desc = t(locale, 'commands.album.main_desc', {
                user: target.username,
                current: totalDiscovered,
                total: totalItems,
                pct: pctDiscovered
            }) + '\n\n' +
            `__**${t(locale, 'commands.album.rarity_stats_title')}**__\n` +
            Object.entries(RARITY_INFO).map(([key, info]) => {
                const userCount = userRarityCounts[key];
                const sysCount = rarityCounts[key];
                const pct = sysCount > 0 ? Math.round((userCount / sysCount) * 100) : 0;
                return `${info.emoji} **${info.name}**: **${userCount}/${sysCount}** (${pct}%)`;
            }).join('\n');

            return buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.album.title', { user: target.username }),
                description: desc,
                thumbnail: target.displayAvatarURL()
            }).setFooter({
                text: isSelf ? t(locale, 'commands.album.footer_self') : t(locale, 'commands.album.footer_other'),
                iconURL: target.displayAvatarURL()
            });
        };

        // 4. Xây dựng trang Embed Bộ Sưu Tập (Sets)
        const buildSetsEmbed = () => {
            const embed = new EmbedBuilder()
                .setTitle(t(locale, 'commands.album.sets_title', { user: target.username }))
                .setColor(config.COLORS.INFO)
                .setThumbnail(target.displayAvatarURL());

            let desc = '';
            for (const set of collections) {
                const isClaimed = claimedSets.has(set.id);
                const hasAll = set.items.every(id => userDiscoveries.has(id));
                
                let statusIcon = t(locale, 'commands.album.status_lock');
                if (isClaimed) statusIcon = t(locale, 'commands.album.status_claimed');
                else if (hasAll) statusIcon = t(locale, 'commands.album.status_ready');

                // Danh sách item kèm trạng thái mở khóa
                const itemLines = set.items.map(itemId => {
                    const it = allItems.find(i => i.id === itemId);
                    const itName = it ? (t(locale, `data.items.${itemId}.name`) || it.name) : itemId;
                    const rInfo = RARITY_INFO[it?.rarity || 'common'];
                    const hasIt = userDiscoveries.has(itemId);
                    return hasIt 
                        ? t(locale, 'commands.album.item_unlocked', { name: itName, emoji: rInfo.emoji, rarity: rInfo.name })
                        : t(locale, 'commands.album.item_locked', { name: itName });
                }).join('\n');

                const setName = t(locale, `data.collections.${set.id}.name`) || set.name;
                const setDesc = t(locale, `data.collections.${set.id}.desc`) || set.desc;
                const setTitle = t(locale, `data.collections.${set.id}.title`) || set.title;

                desc += `### ${set.emoji} **${setName}**\n` +
                        `*${setDesc}*\n` +
                        `**${t(locale, 'commands.album.set_status')}**: ${statusIcon}\n` +
                        `**${t(locale, 'commands.album.set_reward')}**: **+${fmt(set.reward_coins, locale)}** xu + ${t(locale, 'commands.album.set_title_label')} \`${setTitle}\`\n` +
                        `**${t(locale, 'commands.album.required_items')}**:\n${itemLines}\n\n` +
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
                let label = t(locale, `data.collections.${set.id}.name`) || set.name;

                if (isClaimed) {
                    btnStyle = ButtonStyle.Success;
                    label = t(locale, 'commands.album.btn_claimed_set', { emoji: set.emoji });
                    disabled = true;
                } else if (hasAll && isSelf) {
                    btnStyle = ButtonStyle.Primary;
                    label = t(locale, 'commands.album.btn_ready_set', { emoji: set.emoji });
                    disabled = false;
                } else {
                    label = t(locale, 'commands.album.btn_incomplete_set', { emoji: set.emoji });
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
                    .setLabel(t(locale, 'commands.album.btn_stats'))
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('view_sets')
                    .setLabel(t(locale, 'commands.album.btn_sets'))
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
                    content: t(locale, 'common.not_for_you'),
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

                const setName = t(locale, `data.collections.${set.id}.name`) || set.name;
                const setTitle = t(locale, `data.collections.${set.id}.title`) || set.title;

                if (result === 'ok') {
                    claimedSets.add(set.id);
                    // Cập nhật lại giao diện ngay lập tức
                    await interaction.editReply({
                        embeds: [buildSetsEmbed()],
                        components: makeComponents()
                    });
                    
                    // Gửi tin chúc mừng riêng
                    await interaction.followUp({
                        content: t(locale, 'commands.album.congrats', { 
                            user: interaction.user.username, 
                            name: setName, 
                            reward: fmt(set.reward_coins, locale), 
                            title: setTitle 
                        }),
                        ephemeral: false
                    });
                } else if (result === 'already_claimed') {
                    await interaction.followUp({ content: t(locale, 'commands.album.already_claimed'), ephemeral: true });
                } else if (result === 'not_completed') {
                    await interaction.followUp({ content: t(locale, 'commands.album.not_completed'), ephemeral: true });
                } else {
                    await interaction.followUp({ content: t(locale, 'commands.album.error'), ephemeral: true });
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
