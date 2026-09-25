const { 
    SlashCommandBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags,
    PermissionFlagsBits 
} = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { isOwner } = require('../../lib/owner');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { chonKenhThongBao } = require('../../lib/kenhThongBao');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announcement')
        .setDescription('Xem hoặc gửi thông báo cập nhật từ nhà phát triển 📢')
        .addSubcommand(s => s.setName('view').setDescription('Xem thông báo cập nhật mới nhất'))
        .addSubcommand(s => s.setName('send').setDescription('Gửi thông báo cập nhật tới toàn bộ server qua Form Modal (chỉ owner)'))
        .addSubcommand(s => s.setName('clear').setDescription('Xóa thông báo hiện tại (chỉ owner)')),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();

        // 1. CLEAR: Xóa thông báo hiện tại
        if (sub === 'clear') {
            await interaction.deferReply();
            if (!await isOwner(interaction.client, interaction.user.id)) {
                return interaction.editReply({ content: t(locale, 'commands.announcement.err_owner') });
            }
            await db.setGuildSetting('global', 'latest_announcement', '');
            await db.setGuildSetting('global', 'latest_announcement_title', '');
            await db.setGuildSetting('global', 'latest_announcement_commit', '');
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.announcement.clear_success_title'),
                description: t(locale, 'commands.announcement.clear_success_desc')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 2. VIEW: Xem thông báo mới nhất
        if (sub === 'view') {
            await interaction.deferReply();
            const s = await db.getGuildSettings('global');
            const message = s?.latest_announcement;
            const savedTitle = s?.latest_announcement_title;

            if (!message) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    title: t(locale, 'commands.announcement.title_latest'),
                    description: t(locale, 'commands.announcement.no_announcement')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: savedTitle ? (savedTitle.startsWith('📢') ? savedTitle : `📢 ${savedTitle}`) : t(locale, 'commands.announcement.title_latest'),
                description: message
            });
            embed.setTimestamp();
            embed.setFooter({
                text: t(locale, 'commands.announcement.footer_view', { original: embed.data.footer.text }),
                iconURL: embed.data.footer.icon_url
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // 3. SEND: Mở Modal Form 5 trường nhập liệu chuẩn hóa
        if (sub === 'send') {
            if (!await isOwner(interaction.client, interaction.user.id)) {
                return interaction.reply({ 
                    content: t(locale, 'commands.announcement.err_owner'), 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const isEn = locale === 'en';
            const modal = new ModalBuilder()
                .setCustomId('announcement_modal')
                .setTitle(isEn ? '📢 Compose Announcement' : '📢 Soạn Thông Báo Cập Nhật');

            const titleInput = new TextInputBuilder()
                .setCustomId('ann_title')
                .setLabel(isEn ? 'Update Title' : 'Tiêu đề bản cập nhật')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100)
                .setPlaceholder(isEn ? 'e.g. 🌸 UPDATE: GEKKA BAKERY & COMMODITY MARKET' : 'Vd: 🌸 CẬP NHẬT: TIỆM BÁNH GEKKA & CHỢ NÔNG SẢN');

            const highlightsInput = new TextInputBuilder()
                .setCustomId('ann_highlights')
                .setLabel(isEn ? 'Feature Highlights (Bullet points)' : 'Chi tiết các điểm nổi bật')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(2500)
                .setPlaceholder(isEn 
                    ? '✨ Bakery:\n- Added VIP orders...\n💼 Market:\n- MurmurMix32 hash upgrade...' 
                    : '✨ Góc Tiệm Bánh Nhỏ:\n- Thêm đơn VIP khách quen...\n💼 Góc Chợ:\n- Nâng cấp bộ trộn MurmurMix32...');

function resolveAnnouncementBanner(raw) {
    if (!raw) return config.PRESET_BANNERS?.UPDATE;
    const lower = raw.trim().toLowerCase();
    if (lower === 'bakery' || lower === 'tiembanh' || lower === 'farm') {
        return config.PRESET_BANNERS?.BAKERY;
    }
    if (lower === 'study' || lower === 'lofi' || lower === 'hocbai') {
        return config.PRESET_BANNERS?.STUDY;
    }
    if (lower === 'event' || lower === 'trungthu' || lower === 'festival') {
        return config.PRESET_BANNERS?.MID_AUTUMN;
    }
    if (lower === 'update' || lower === 'capnhat' || lower === 'pastel') {
        return config.PRESET_BANNERS?.UPDATE;
    }
    if (/^https?:\/\/.+/i.test(raw)) {
        return raw.trim();
    }
    return config.PRESET_BANNERS?.UPDATE;
}

            const imageInput = new TextInputBuilder()
                .setCustomId('ann_image')
                .setLabel(isEn ? 'Banner Preset / Image URL (Optional)' : 'Banner Preset / Link ảnh (Tùy chọn)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(300)
                .setPlaceholder('update, bakery, study, trungthu hoặc link URL');

            const ctaInput = new TextInputBuilder()
                .setCustomId('ann_cta')
                .setLabel(isEn ? '1-Click Buttons (Optional)' : 'Nút trải nghiệm nhanh 1-Click (Tùy chọn)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(100)
                .setPlaceholder('tiembanh, market, quest, study, daily');

            const noteInput = new TextInputBuilder()
                .setCustomId('ann_note')
                .setLabel(isEn ? 'Waguri Warm Note (Optional)' : 'Lời nhắn từ Waguri (Tùy chọn)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
                .setPlaceholder(isEn 
                    ? 'A sweet note to our adventurers...' 
                    : 'Mong rằng những cập nhật này sẽ mang lại cho cậu những phút giây thật ấm áp...');

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(highlightsInput),
                new ActionRowBuilder().addComponents(imageInput),
                new ActionRowBuilder().addComponents(ctaInput),
                new ActionRowBuilder().addComponents(noteInput)
            );

            await interaction.showModal(modal);

            const submitted = await interaction.awaitModalSubmit({
                time: 600_000,
                filter: i => i.customId === 'announcement_modal' && i.user.id === interaction.user.id
            }).catch(() => null);

            if (!submitted) return;
            await submitted.deferReply();

            const title = submitted.fields.getTextInputValue('ann_title').trim();
            const highlights = submitted.fields.getTextInputValue('ann_highlights').trim();
            const imageUrl = submitted.fields.getTextInputValue('ann_image')?.trim() || null;
            const ctaRaw = submitted.fields.getTextInputValue('ann_cta')?.trim() || '';
            const note = submitted.fields.getTextInputValue('ann_note')?.trim() || '';

            let content = highlights;
            if (note) {
                content += `\n\n${note}`;
            }
            if (content.length > 4000) content = content.slice(0, 4000) + '…';

            // 1. Lưu thông báo vào cấu hình global
            await db.setGuildSetting('global', 'latest_announcement', content);
            await db.setGuildSetting('global', 'latest_announcement_title', title);

            const embed = buildWaguriEmbed(submitted, 'jackpot', {
                locale,
                title: title.startsWith('📢') ? title : `📢 ${title}`,
                description: content
            });

            // Tự động giải quyết Preset Banner hoặc URL người dùng nhập
            const finalBanner = resolveAnnouncementBanner(imageUrl);
            if (finalBanner) {
                embed.setImage(finalBanner);
            }
            embed.setTimestamp();
            embed.setFooter({
                text: t(locale, 'commands.announcement.footer_sent', { user: submitted.user.username }),
                iconURL: submitted.client.user.displayAvatarURL()
            });

            // 2. Tạo các Action Buttons 1-Click
            const ctaKeys = (ctaRaw || '').toLowerCase().split(/[\s,]+/).filter(Boolean);
            const btnMap = {
                tiembanh: { label: isEn ? '🧁 Gekka Bakery' : '🧁 Tiệm Bánh Gekka', style: ButtonStyle.Primary, id: 'ann_btn_tiembanh' },
                market: { label: isEn ? '🛒 Market Prices' : '🛒 Chợ Nông Sản', style: ButtonStyle.Primary, id: 'ann_btn_market' },
                quest: { label: isEn ? '📜 Kikyo Quests' : '📜 Cốt Truyện Kikyo', style: ButtonStyle.Secondary, id: 'ann_btn_quest' },
                study: { label: isEn ? '☕ Lo-Fi Study' : '☕ Phòng Học Lo-Fi', style: ButtonStyle.Success, id: 'ann_btn_study' },
                daily: { label: isEn ? '🎁 Daily Reward' : '🎁 Điểm Danh /daily', style: ButtonStyle.Secondary, id: 'ann_btn_daily' },
            };

            const components = [];
            const buttons = [];
            for (const k of ctaKeys) {
                if (btnMap[k] && buttons.length < 5) {
                    buttons.push(new ButtonBuilder().setCustomId(btnMap[k].id).setLabel(btnMap[k].label).setStyle(btnMap[k].style));
                }
            }
            if (buttons.length > 0) {
                components.push(new ActionRowBuilder().addComponents(buttons));
            }

            const payload = { embeds: [embed] };
            if (components.length > 0) payload.components = components;

            let sentCount = 0;
            let failCount = 0;

            // 3. Gửi lên kênh thông báo chính thức của Server Support
            const supportChannelId = '1517931376865710120';
            let supportChannel = null;
            try {
                supportChannel = await interaction.client.channels.fetch(supportChannelId).catch(() => null);
            } catch { /* bỏ qua */ }

            if (supportChannel) {
                const ok = await supportChannel.send(payload).then(() => true).catch(() => false);
                if (ok) sentCount++;
            }

            // 4. Phát tới tất cả server qua Smart Fallback
            const guilds = interaction.client.guilds.cache;
            for (const [gid, guild] of guilds) {
                if (supportChannel && supportChannel.guild.id === gid) continue;

                try {
                    const s = await db.getGuildSettings(gid);
                    const { channel, nhac } = await chonKenhThongBao(guild, s);

                    let sent = false;
                    if (channel) {
                        const sendPayload = nhac
                            ? { content: t(locale, nhac), ...payload }
                            : payload;
                        try {
                            await channel.send(sendPayload);
                            sentCount++;
                            sent = true;
                        } catch (sendErr) {
                            // Nếu kênh bị lỗi quyền bất ngờ (50001 Missing Access hoặc 50013 Missing Permissions),
                            // tự động dò tìm các kênh văn bản khác trong guild thay vì bỏ cuộc
                            if (sendErr.code === 50001 || sendErr.code === 50013) {
                                const backupChannels = Array.from(guild.channels?.cache?.values() || []).filter(ch => 
                                    ch.id !== channel.id &&
                                    (ch.type === 0 || (typeof ch.isTextBased === 'function' && ch.isTextBased() && !ch.isVoiceBased?.() && !ch.isThread?.()))
                                );
                                for (const altCh of backupChannels) {
                                    const perms = guild.members?.me?.permissionsIn(altCh);
                                    if (perms?.has?.(PermissionFlagsBits.ViewChannel) && perms?.has?.(PermissionFlagsBits.SendMessages)) {
                                        try {
                                            await altCh.send({ content: t(locale, 'commands.announcement.nhac_kenh'), ...payload });
                                            sentCount++;
                                            sent = true;
                                            break;
                                        } catch { /* tiếp tục tìm */ }
                                    }
                                }
                            }
                            if (!sent) {
                                console.error(`[ANNOUNCEMENT ERROR] Guild ID: ${gid} (Kênh ${channel.id})`, sendErr.message || sendErr);
                                failCount++;
                            }
                        }
                    } else {
                        failCount++;
                    }
                } catch (err) {
                    console.error(`[ANNOUNCEMENT ERROR] Guild ID: ${gid}`, err.message || err);
                    failCount++;
                }
            }

            const resEmbed = buildWaguriEmbed(submitted, 'success', {
                locale,
                title: t(locale, 'commands.announcement.success_title'),
                description: t(locale, 'commands.announcement.success_desc', { sent: sentCount, fail: failCount })
            });
            await submitted.editReply({ embeds: [resEmbed] });
        }
    },
};
