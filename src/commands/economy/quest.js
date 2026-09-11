const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { pickDailyQuests } = require('../../data/quests');
const { STORY_CHAPTERS } = require('../../data/story_chapters');
const { createWaguriBar, buildWaguriEmbed, getWaguriFooter } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

/** Render Tab 1: Hồi Ký Kikyo (Cốt truyện RPG Nghịch Thủy Hàn) */
function buildStoryTab(user, locale) {
    const chapterId = Number(user?.story_chapter || 1);
    const nodeId = Number(user?.story_node || 1);
    const affection = Number(user?.affection_points || 0);

    // Xác định cấp bậc hảo cảm
    let affectionName = '💛 Quen biết';
    if (affection >= 200) affectionName = '💞 Tri kỷ';
    else if (affection >= 80) affectionName = '💗 Thân thiết';
    else if (affection >= 25) affectionName = '💓 Bạn thân';

    if (chapterId > 5) {
        const embed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle('🌸 HỒI KÝ KIKYO — ĐẠI KẾT CỤC')
            .setDescription(
                `🎉 **Chúc mừng cậu đã hoàn thành trọn vẹn 5 Hồi Cốt Truyện Làng Kikyo!**\n\n` +
                `Bức tường ngăn cách giữa Học viện Kikyo và trường Chidori đã hoàn toàn được gỡ bỏ trong trái tim mọi người.\n` +
                `Cậu hiện đang mang danh hiệu **[🌸 Người Kết Nối Kikyo]** và là tri kỷ đặc biệt nhất của Waguri.\n\n` +
                `💖 **Độ thân mật với Waguri:** **${affection}** điểm (${affectionName})\n` +
                `*Hãy tiếp tục duy trì việc học (/study), nướng bánh (/tiembanh) và làm nhiệm vụ hằng ngày nhé!*`
            )
            .setTimestamp();
        return { embed, node: null, isFinished: true };
    }

    const chapter = STORY_CHAPTERS.find(c => c.id === chapterId) || STORY_CHAPTERS[0];
    const node = chapter.nodes.find(n => n.id === nodeId) || chapter.nodes[0];

    const embed = new EmbedBuilder()
        .setColor(chapter.color || '#F472B6')
        .setTitle(`📜 ${chapter.title}`)
        .setDescription(
            `*${chapter.summary}*\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `**📍 ${node.title}**\n` +
            `${node.intro}\n\n` +
            `💬 **Waguri Kaoruko:**\n` +
            `> ${node.dialogue}\n\n` +
            `🎯 **Hành động dẫn lối:** Gõ lệnh \`${node.command}\` trong server.\n` +
            `🎁 **Phần thưởng hoàn thành:**\n` +
            `> 🌟 **${node.rewardText}**\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💖 **Hảo cảm Waguri:** **${affection}** điểm (${affectionName})`
        )
        .setFooter({ text: `Tiến độ: Hồi ${chapterId}/5 • Tiết ${nodeId}/4 • Waguri 🌸` })
        .setTimestamp();

    return { embed, node, isFinished: false };
}

/** Render Tab 2: Treo Thưởng Kỳ Cựu (Hằng ngày) */
async function buildDailyTab(userId, locale) {
    const QUESTS = pickDailyQuests(userId);
    let { counters, claimed } = await db.getQuestRow(userId);

    let totalReward = 0;
    let claimedCount = 0;
    for (const q of QUESTS) {
        const cur = Number(counters[q.key] || 0);
        if (cur >= q.required && !claimed[q.id]) {
            const r = await db.questClaim(userId, q);
            if (r === 'ok') {
                totalReward += q.reward;
                claimed[q.id] = true;
                claimedCount++;
            }
        }
    }

    const lines = QUESTS.map(q => {
        const cur = Math.min(Number(counters[q.key] || 0), q.required);
        const done = claimed[q.id];
        const icon = done ? '✅' : (cur >= q.required ? '🎁' : '⬜');
        const qName = t(locale, `data.quests.${q.id}.name`) || q.name;
        return `${icon} **${qName}** — ${cur}/${q.required}\n` +
            `　${createWaguriBar(cur, q.required, 8)} · 🪙 ${fmt(q.reward, locale)} ${config.CURRENCY}`;
    });

    const embed = new EmbedBuilder()
        .setColor('#6366F1')
        .setTitle('⚔️ BẢNG TREO THƯỞNG KỲ CỰU (HẰNG NGÀY)')
        .setDescription(
            `*Hoàn thành các ủy thác hằng ngày để nhận Xu và Battle Pass XP!*\n\n` +
            lines.join('\n')
        )
        .setFooter({ text: 'Tự động nhận thưởng khi hoàn thành • Làm mới 00:00 UTC 🌸' })
        .setTimestamp();

    if (claimedCount > 0) {
        await require('../../lib/battlepass').addXp(userId, claimedCount * 150);
        embed.addFields({
            name: '🎁 Đã nhận thưởng!',
            value: `+${fmt(totalReward, locale)} ${config.CURRENCY} & +${claimedCount * 150} Pass XP!`,
            inline: false
        });
    }

    return embed;
}

/** Render Tab 3: Bách Khoa Danh Vọng */
async function buildAchievementsTab(user, userId, locale) {
    const prestige = Number(user?.prestige || 0);
    const totalMinutes = Number(user?.total_study_minutes || 0);
    const studyPoints = Number(user?.study_points || 0);
    const affection = Number(user?.affection_points || 0);
    const userBadges = await db.getUserBadges(userId);

    const embed = new EmbedBuilder()
        .setColor('#EAB308')
        .setTitle('🏆 BÁCH KHOA DANH VỌNG & CỘT MỐC')
        .setDescription(
            `🌟 **Cấp Chuyển Sinh (Prestige):** Cấp **${prestige}**\n` +
            `🎓 **Tổng giờ Pomodoro:** **${Math.floor(totalMinutes / 60)}** giờ **${totalMinutes % 60}** phút\n` +
            `📜 **Điểm Tri Thức:** **${studyPoints}** pts\n` +
            `💖 **Điểm Hảo Cảm Waguri:** **${affection}** điểm\n` +
            `🎖️ **Huy hiệu đã mở khóa:** **${userBadges.length}** huy hiệu\n\n` +
            `*Hành trình vạn dặm bắt đầu từ một mẩu bánh ngọt ấm áp.*`
        )
        .setTimestamp();

    return embed;
}

/** Build Menu Chọn Tab */
function buildTabMenu(activeTab) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('quest_tab_select')
            .setPlaceholder('Chuyển đổi danh mục nhiệm vụ...')
            .addOptions([
                {
                    label: 'Hồi Ký Kikyo (Cốt truyện RPG)',
                    value: 'tab_story',
                    description: 'Tuyến truyện 5 Hồi đồng hành cùng Waguri Kaoruko',
                    emoji: '📜',
                    default: activeTab === 'tab_story'
                },
                {
                    label: 'Treo Thưởng Kỳ Cựu (Hằng ngày)',
                    value: 'tab_daily',
                    description: 'Ủy thác hằng ngày, cày cuốc & chợ nông sản',
                    emoji: '⚔️',
                    default: activeTab === 'tab_daily'
                },
                {
                    label: 'Bách Khoa Danh Vọng (Cột mốc)',
                    value: 'tab_achievements',
                    description: 'Thành tựu trọn đời, chuyển sinh & danh hiệu',
                    emoji: '🏆',
                    default: activeTab === 'tab_achievements'
                }
            ])
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quest')
        .setDescription('Hệ thống nhiệm vụ: Hồi ký cốt truyện Kikyo & Treo thưởng hằng ngày 📜'),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;

        let activeTab = 'tab_story';
        let user = await db.getUser(userId);

        const storyData = buildStoryTab(user, locale);
        let currentEmbed = storyData.embed;

        const actionButtons = new ActionRowBuilder();
        if (!storyData.isFinished && storyData.node) {
            actionButtons.addComponents(
                new ButtonBuilder()
                    .setCustomId('quest_claim_story')
                    .setLabel('🎁 Nhận Thưởng Tiết')
                    .setStyle(ButtonStyle.Success)
            );
        }

        const components = [buildTabMenu(activeTab)];
        if (actionButtons.components.length > 0) components.push(actionButtons);

        const msg = await interaction.editReply({
            embeds: [currentEmbed],
            components
        });

        const collector = msg.createMessageComponentCollector({
            time: 120000
        });

        collector.on('collect', async i => {
            if (i.user.id !== userId) {
                return i.reply({
                    content: t(locale, 'common.not_for_you') || '🌸 *Đây không phải góc nhiệm vụ của cậu nhen~ Cậu hãy gõ `/quest` để xem hành trình của riêng mình nha!* 🍵',
                    flags: MessageFlags.Ephemeral
                });
            }

            if (i.isStringSelectMenu() && i.customId === 'quest_tab_select') {
                activeTab = i.values[0];
                user = await db.getUser(userId);

                let newComponents = [buildTabMenu(activeTab)];
                if (activeTab === 'tab_story') {
                    const st = buildStoryTab(user, locale);
                    currentEmbed = st.embed;
                    if (!st.isFinished && st.node) {
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('quest_claim_story')
                                .setLabel('🎁 Nhận Thưởng Tiết')
                                .setStyle(ButtonStyle.Success)
                        );
                        newComponents.push(row);
                    }
                } else if (activeTab === 'tab_daily') {
                    currentEmbed = await buildDailyTab(userId, locale);
                } else if (activeTab === 'tab_achievements') {
                    currentEmbed = await buildAchievementsTab(user, userId, locale);
                }

                await i.update({ embeds: [currentEmbed], components: newComponents });
            } else if (i.isButton() && i.customId === 'quest_claim_story') {
                user = await db.getUser(userId);
                const curChapter = Number(user?.story_chapter || 1);
                const curNode = Number(user?.story_node || 1);

                const chData = STORY_CHAPTERS.find(c => c.id === curChapter);
                const ndData = chData?.nodes.find(n => n.id === curNode);

                if (!ndData) {
                    return i.reply({ content: 'Không tìm thấy thông tin tiết đoạn hiện tại~ 🌸', flags: MessageFlags.Ephemeral });
                }

                const res = await db.advanceStoryNode(
                    userId,
                    curChapter,
                    curNode,
                    ndData.reward.coins,
                    ndData.reward.exp,
                    ndData.reward.item,
                    ndData.reward.affection
                );

                if (!res || !res.success) {
                    return i.reply({
                        content: 'Chưa thể nhận thưởng lúc này! Hãy chắc chắn cậu đã thực hiện hành động dẫn dắt nhé~ 🌸',
                        flags: MessageFlags.Ephemeral
                    });
                }

                user = await db.getUser(userId);
                const refreshedStory = buildStoryTab(user, locale);

                let newComponents = [buildTabMenu(activeTab)];
                if (!refreshedStory.isFinished && refreshedStory.node) {
                    newComponents.push(
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId('quest_claim_story')
                                .setLabel('🎁 Nhận Thưởng Tiết')
                                .setStyle(ButtonStyle.Success)
                        )
                    );
                }

                await i.update({ embeds: [refreshedStory.embed], components: newComponents });
                await i.followUp({
                    content: `🎉 **Đã hoàn thành ${ndData.title}!**\nNhận được: **${ndData.rewardText}** 🌸`,
                    flags: MessageFlags.Ephemeral
                });
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    }
};

