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
const { createWaguriBar } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { checkStoryNodeCondition } = require('../../lib/storyCondition');

const fmt = (n, locale) => Number(n || 0).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

/** Render Tab 1: Hồi Ký Kikyo (Cốt truyện RPG Nghịch Thủy Hàn) */
async function buildStoryTab(user, locale) {
    const isEn = locale && locale.startsWith('en');
    const chapterId = Number(user?.story_chapter || 1);
    const nodeId = Number(user?.story_node || 1);
    const affection = Number(user?.affection_points || 0);

    // Xác định cấp bậc hảo cảm
    let affectionName = isEn ? '💛 Acquaintance' : '💛 Quen biết';
    if (affection >= 200) affectionName = isEn ? '💞 Soulmate' : '💞 Tri kỷ';
    else if (affection >= 80) affectionName = isEn ? '💗 Close Friend' : '💗 Thân thiết';
    else if (affection >= 25) affectionName = isEn ? '💓 Good Friend' : '💓 Bạn thân';

    if (chapterId > 5) {
        const embed = new EmbedBuilder()
            .setColor('#10B981')
            .setTitle(isEn ? '🌸 KIKYO MEMOIR — THE GRAND FINALE' : '🌸 HỒI KÝ KIKYO — ĐẠI KẾT CỤC')
            .setDescription(
                (isEn
                    ? `🎉 **Congratulations! You have completed all 5 Chapters of the Kikyo Memoir!**\n\n` +
                      `The wall between Kikyo Academy and Chidori High has been completely dissolved in everyone's hearts.\n` +
                      `You now hold the title **[🌸 Kikyo Connector]** and are Waguri's most precious soulmate.\n\n`
                    : `🎉 **Chúc mừng cậu đã hoàn thành trọn vẹn 5 Hồi Cốt Truyện Làng Kikyo!**\n\n` +
                      `Bức tường ngăn cách giữa Học viện Kikyo và trường Chidori đã hoàn toàn được gỡ bỏ trong trái tim mọi người.\n` +
                      `Cậu hiện đang mang danh hiệu **[🌸 Người Kết Nối Kikyo]** và là tri kỷ đặc biệt nhất của Waguri.\n\n`) +
                `💖 **${isEn ? 'Affection with Waguri:' : 'Độ thân mật với Waguri:'}** **${affection}** ${isEn ? 'points' : 'điểm'} (${affectionName})\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `🌟 **${isEn ? 'INFINITE ENDGAME ADVENTURES:' : 'HÀNH TRÌNH VÔ TẬN TIẾP THEO:'}**\n` +
                `> 🧁 **${isEn ? 'Gekka Bakery Master:' : 'Lò Nướng Gekka Đỉnh Cao:'}** ${isEn ? 'Upgrade oven to Level 5, hire 3 staff, craft strawberry cakes (`/tiembanh`)' : 'Nâng cấp lò nướng Cấp 5, thuê đủ 3 nhân viên và làm bánh kem dâu (`/tiembanh`)'}\n` +
                `> 📚 **${isEn ? 'Grand Scholar of Kikyo:' : 'Đại Học Sĩ Kikyo:'}** ${isEn ? 'Keep your daily Pomodoro focus streak and exchange Knowledge Points at `/study shop`' : 'Duy trì chuỗi Pomodoro chuyên cần `/study` và đổi bảo vật tại `/study shop`'}\n` +
                `> 🐾 **${isEn ? 'Pet Companion Evolution:' : 'Tiến Hóa Thú Cưng:'}** ${isEn ? 'Train pet skills to max level and ascend their rarity (`/pet`)' : 'Nâng cấp kỹ năng thú cưng tối đa và thăng hoa độ hiếm (`/pet`)'}\n` +
                `> 📈 **${isEn ? 'Crop Commodity Trading:' : 'Thương Hội Nông Sản:'}** ${isEn ? 'Track 4-hour market shifts at `/market prices` for maximum trading yield' : 'Canh biểu đồ biến động giá 4 giờ tại `/market prices` để tối ưu lợi nhuận'}\n` +
                `> 🛡️ **${isEn ? 'Clan Shrine & Rebirth:' : 'Đền Thờ Bang & Chuyển Sinh:'}** ${isEn ? 'Build the Clan Shrine (`/clan`) and prepare for Rebirth (`/prestige`)' : 'Góp sức xây Đền Thờ Bang `/clan` và chuẩn bị Chuyển Sinh (`/prestige`)'}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*${isEn ? 'May your days with Waguri always be sweet and warm 🌸' : 'Mỗi ngày trôi qua cùng Waguri sẽ luôn tràn ngập những điều ngọt ngào và ấm áp 🌸'}*`
            )
            .setTimestamp();
        return { embed, node: null, isFinished: true, condition: { pass: true } };
    }

    const chapter = STORY_CHAPTERS.find(c => c.id === chapterId) || STORY_CHAPTERS[0];
    const node = chapter.nodes.find(n => n.id === nodeId) || chapter.nodes[0];

    const condition = await checkStoryNodeCondition(user?.user_id, chapterId, nodeId, user, locale);

    let conditionSection = '';
    if (condition.pass) {
        conditionSection = isEn
            ? `\n\n✅ **Status:** Condition satisfied! You can claim the chapter reward now! 🌸`
            : `\n\n✅ **Trạng thái:** Đã hoàn thành điều kiện! Cậu có thể nhận thưởng Tiết ngay bây giờ nha! 🌸`;
    } else {
        conditionSection = `\n\n⚠️ **${isEn ? 'Next Step Requirement:' : 'Điều kiện tiếp bước:'}**\n> ${condition.guideText}`;
        if (condition.progressText) {
            conditionSection += `\n> ${condition.progressText}`;
        }
    }

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
            `🎯 **${isEn ? 'Guiding Command:' : 'Hành động dẫn lối:'}** Gõ lệnh \`${node.command}\` trong server.\n` +
            `🎁 **${isEn ? 'Completion Reward:' : 'Phần thưởng hoàn thành:'}**\n` +
            `> 🌟 **${node.rewardText}**` +
            conditionSection +
            `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💖 **${isEn ? 'Waguri Affection:' : 'Hảo cảm Waguri:'}** **${affection}** ${isEn ? 'points' : 'điểm'} (${affectionName})`
        )
        .setFooter({ text: `${isEn ? 'Progress:' : 'Tiến độ:'} Hồi ${chapterId}/5 • Tiết ${nodeId}/4 • Waguri 🌸` })
        .setTimestamp();

    return { embed, node, isFinished: false, condition };
}

/** Build Nút Nhận Thưởng / Hành Động Nhanh cho Tab Cốt Truyện */
function buildStoryActionRow(storyData, locale) {
    if (storyData.isFinished || !storyData.node) return null;

    const isEn = locale && locale.startsWith('en');
    const row = new ActionRowBuilder();
    const cond = storyData.condition || { pass: true };

    if (!cond.pass && cond.actionButton) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(cond.actionButton.customId)
                .setLabel(cond.actionButton.label)
                .setStyle(cond.actionButton.style || ButtonStyle.Primary)
        );
    }

    const claimBtn = new ButtonBuilder()
        .setCustomId('quest_claim_story')
        .setLabel(isEn ? '🎁 Claim Chapter Reward' : '🎁 Nhận Thưởng Tiết')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!cond.pass);

    row.addComponents(claimBtn);
    return row;
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

        const storyData = await buildStoryTab(user, locale);
        let currentEmbed = storyData.embed;

        const components = [buildTabMenu(activeTab)];
        const initialStoryRow = buildStoryActionRow(storyData, locale);
        if (initialStoryRow) components.push(initialStoryRow);

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
                    const st = await buildStoryTab(user, locale);
                    currentEmbed = st.embed;
                    const row = buildStoryActionRow(st, locale);
                    if (row) newComponents.push(row);
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

                // Chốt chặn kiểm tra điều kiện thực thi
                const cond = await checkStoryNodeCondition(userId, curChapter, curNode, user, locale);
                if (!cond.pass) {
                    return i.reply({
                        content: cond.guideText,
                        flags: MessageFlags.Ephemeral
                    });
                }

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
                const refreshedStory = await buildStoryTab(user, locale);

                let newComponents = [buildTabMenu(activeTab)];
                const storyRow = buildStoryActionRow(refreshedStory, locale);
                if (storyRow) newComponents.push(storyRow);

                await i.update({ embeds: [refreshedStory.embed], components: newComponents });
                await i.followUp({
                    content: `🎉 **Đã hoàn thành ${ndData.title}!**\nNhận được: **${ndData.rewardText}** 🌸`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (i.isButton() && i.customId === 'quest_quick_open_bakery') {
                user = await db.getUser(userId);
                const { getLevelFromExp } = require('../../lib/leveling');
                const lvl = getLevelFromExp(Number(user?.exp || 0));

                if (lvl < 5) {
                    return i.reply({
                        content: `🌸 Cậu cần đạt Cấp 5 (1.600 EXP) để mở lò nướng nhé! (Hiện tại: ${Number(user?.exp || 0).toLocaleString('vi-VN')} EXP) Hãy làm việc hoặc câu cá thêm chút nữa nha~`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (Number(user?.wallet || 0) < 10000) {
                    return i.reply({
                        content: `🌸 Cậu ơi, chúng mình cần 10.000 xu tiền vốn để chuẩn bị lò nướng nhen~ (Hiện tại ví cậu có: ${Number(user?.wallet || 0).toLocaleString('vi-VN')} xu)`,
                        flags: MessageFlags.Ephemeral
                    });
                }

                const hasTool = await db.hasItem(userId, 'bo_lam_banh');
                if (!hasTool) {
                    await db.giveItemAdmin(userId, 'bo_lam_banh', 1);
                }

                const res = await db.bakeryOpen(userId, 10000, 'bo_lam_banh');
                if (res === 'ok' || res === 'has') {
                    user = await db.getUser(userId);
                    const refreshedStory = await buildStoryTab(user, locale);
                    let newComponents = [buildTabMenu(activeTab)];
                    const storyRow = buildStoryActionRow(refreshedStory, locale);
                    if (storyRow) newComponents.push(storyRow);

                    await i.update({ embeds: [refreshedStory.embed], components: newComponents });
                    await i.followUp({
                        content: `🎉 **Oa, lò nướng Tiệm Bánh Gekka đã rực lửa rồi!** 🍰\nChúng mình chính thức có một góc bếp riêng tại tiệm bánh Gekka rồi đó cậu ơi~\nBây giờ cậu có thể bấm **[🎁 Nhận Thưởng Tiết]** để hoàn thành tiết đoạn nha! 🌸`,
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    return i.reply({
                        content: `Chưa thể mở tiệm bánh lúc này (${res}). Cậu thử lại sau một chút nhé~ 🌸`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            } else if (i.isButton() && i.customId === 'quest_quick_study_start') {
                const studyLib = require('../../lib/study');
                const result = await studyLib.startStudySession(userId, i.guildId || 'global', 'Học Cùng Waguri 🌸', 25, i);

                if (!result.success && result.reason === 'ALREADY_ACTIVE') {
                    return i.reply({
                        content: '📖 Cậu đang có một phiên học Pomodoro đang chạy rồi nè! Cố gắng học thật tập trung để hoàn thành phiên và nhận thưởng cốt truyện nha~ 🌸',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!result.success) {
                    return i.reply({
                        content: 'Chưa thể mở phiên học lúc này. Cậu thử gõ `/study start` hoặc thử lại sau nha~ 🌸',
                        flags: MessageFlags.Ephemeral
                    });
                }

                const session = result.session;
                const studyEmbed = studyLib.buildStudyEmbed(session, session.remainingMs);
                const studyRow = studyLib.buildControlRow(session.isPaused, locale);
                const studyMsg = await i.reply({ embeds: [studyEmbed], components: [studyRow], fetchReply: true });
                session.message = studyMsg;
            } else if (i.isButton() && i.customId === 'quest_quick_adopt_pet') {
                const r = await db.adoptPet(userId, 'meo', 'Mèo Hoa Kikyo');
                if (r === 'ok' || r === 'already') {
                    user = await db.getUser(userId);
                    const refreshedStory = await buildStoryTab(user, locale);
                    let newComponents = [buildTabMenu(activeTab)];
                    const storyRow = buildStoryActionRow(refreshedStory, locale);
                    if (storyRow) newComponents.push(storyRow);

                    await i.update({ embeds: [refreshedStory.embed], components: newComponents });
                    await i.followUp({
                        content: `🐱 **Oa, bé mèo đã rúc vào lòng cậu rồi này!**\nChào mừng bé **Mèo Hoa Kikyo** đến với mái ấm mới~ Cậu hãy chăm sóc bé thật chu đáo nhé! 🌸\nBây giờ cậu có thể bấm **[🎁 Nhận Thưởng Tiết]** để nhận thưởng nha!`,
                        flags: MessageFlags.Ephemeral
                    });
                } else {
                    return i.reply({
                        content: `Chưa thể nhận nuôi bé mèo lúc này (${r}). Cậu thử lại sau nha~ 🌸`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => {});
        });
    }
};
