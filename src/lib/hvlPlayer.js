/**
 * @file hvlPlayer.js
 * @description Trình phát nhạc đĩa bí mật Easter Egg (Album HVL - MCK) tích hợp Discord Voice Status API.
 * @module lib/hvlPlayer
 */

const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } = require('discord.js');
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

const playlist = require('../data/hvl_playlist.json');
const db = require('../database.js');
const logger = require('./logger');
const { rateLimited } = require('./ratelimit');

// Local audio directory & Production CDN fallback
const LOCAL_AUDIO_DIR = process.env.HVL_AUDIO_DIR || path.join(process.cwd(), 'assets', 'hvl_audio');
const DEFAULT_REMOTE_BASE = 'https://kuvlkaxregnanhzgqrbp.supabase.co/storage/v1/object/public/hvl_audio';
const REMOTE_AUDIO_BASE = process.env.HVL_AUDIO_URL_BASE || DEFAULT_REMOTE_BASE;

// Active players map: guildId -> PlayerSession
const players = new Map();

// Mood color palette
const MOOD_COLORS = {
    INTRO: 0xFFC107,    // Caramel Gold
    MELLOW: 0xFF9EAA,   // Sakura Pink
    HYPE: 0x9B51E0,     // Neon Purple
    EMOTIONAL: 0x4A90E2, // Deep Blue
    FUN: 0x2ECC71       // Fresh Green
};

// Loop Modes
const LOOP_MODES = {
    OFF: 'OFF',
    ONE: 'ONE',
    ALL: 'ALL'
};

/**
 * Lấy đường dẫn âm thanh (File Stream hoặc HTTPS Stream)
 */
function getAudioStream(track) {
    if (fs.existsSync(LOCAL_AUDIO_DIR)) {
        const localPath = path.join(LOCAL_AUDIO_DIR, track.fileName);
        if (fs.existsSync(localPath)) {
            return { stream: fs.createReadStream(localPath), isUrl: false };
        }
    }

    if (REMOTE_AUDIO_BASE) {
        const fileSlug = String(track.id).padStart(2, '0') + '.mp3';
        const url = `${REMOTE_AUDIO_BASE.replace(/\/$/, '')}/${fileSlug}`;
        return { stream: url, isUrl: true };
    }

    return null;
}

/**
 * Cập nhật Voice Channel Status (Tính năng mới của Discord API)
 */
async function updateVoiceStatus(client, channelId, statusText) {
    try {
        if (!client || !channelId) return;
        await client.rest.put(`/channels/${channelId}/voice-status`, {
            body: { status: statusText }
        });
    } catch {
        // Bỏ qua nếu server chưa được bật Voice Status
    }
}

/**
 * Xóa Voice Channel Status khi ngắt kết nối
 */
async function clearVoiceStatus(client, channelId) {
    try {
        if (!client || !channelId) return;
        await client.rest.put(`/channels/${channelId}/voice-status`, {
            body: { status: '' }
        });
    } catch {
        // Ignore
    }
}

/**
 * Tạo Embed Player UI mượt mà
 */
function buildPlayerEmbed(session, track) {
    const color = MOOD_COLORS[track.group] || 0xFF9EAA;
    const trackNum = String(track.id).padStart(2, '0');
    const loopLabel = session.loopMode === LOOP_MODES.ONE ? '🔂 Lặp 1 bài' : (session.loopMode === LOOP_MODES.ALL ? '🔁 Lặp album' : '➡️ Tắt lặp');
    const shuffleLabel = session.isShuffled ? '🔀 Bật' : '➡️ Tắt';

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🎧 HVL - MCK (Special Easter Egg Album)')
        .setDescription(
            `🎉 **Chúc mừng cậu đã mở khóa thành công đĩa nhạc bí mật HVL - MCK!**\n\n` +
            `🎵 **Bài đang phát [${trackNum}/30]**: \`${track.title}\`\n` +
            `⏱️ \`00:00 ▰▰▰▰▱▱▱▱▱▱ 03:30\`\n\n` +
            `🔁 **Chế độ Lặp**: ${loopLabel} | 🔀 **Phát Ngẫu Nhiên**: ${shuffleLabel}`
        )
        .setFooter({ text: 'Waguri Music Engine • Phát mượt mà 320kbps 🌸' });

    return embed;
}

/**
 * Tạo Hàng Nút Tương Tác (Action Row)
 */
function buildControlRow(session, disabled = false) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('hvl_prev')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('hvl_toggle')
            .setEmoji(session.isPaused ? '▶️' : '⏸️')
            .setStyle(session.isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('hvl_next')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('hvl_loop')
            .setEmoji('🔁')
            .setStyle(session.loopMode !== LOOP_MODES.OFF ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId('hvl_stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled)
    );
    return row;
}

/**
 * Khởi tạo hoặc lấy Player Session cho Server Guild
 */
async function startHvlPlayer(interaction) {
    const guildId = interaction.guildId;
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
        return interaction.reply({
            content: '🌸 *Hủm? Cậu vừa thì thầm một mật mã kỳ lạ ở đâu đó... Nhưng dường như giọng nói ấy chưa chạm tới căn phòng thoại nào cả~* 🗝️',
            flags: MessageFlags.Ephemeral
        });
    }

    // Guard: Bắt lỗi thiếu quyền Connect / Speak
    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions || !permissions.has('Connect') || !permissions.has('Speak')) {
        return interaction.reply({
            content: '🌸 *Hủm? Căn phòng đó dường như đang khóa cửa đối với tớ mất rồi~* 🔒',
            flags: MessageFlags.Ephemeral
        });
    }

    // Guard: Đã có player ở server này
    if (players.has(guildId)) {
        const existing = players.get(guildId);
        if (existing.channelId !== voiceChannel.id) {
            return interaction.reply({
                content: '🌸 *Waguri đang dừng chân ở một căn phòng thoại khác trong server rồi nhen~* 🍵',
                flags: MessageFlags.Ephemeral
            });
        } else {
            // Nếu dùng lại ở cùng phòng -> dọn dẹp session cũ trước khi tạo mới
            await destroyPlayer(guildId);
        }
    }

    if (typeof interaction.deferReply === 'function') {
        await interaction.deferReply().catch(() => {});
    }

    // Ghi nhận Huy Hiệu Bí Mật RPG Waguri
    try {
        await db.recordDiscovery(interaction.user.id, 'hvl_album');
    } catch {
        // Non-blocking
    }

    // Logger Telemetry
    console.log(`[EASTER EGG] User ${interaction.user.tag} (${interaction.user.id}) unlocked HVL Album in Guild ${guildId}`);

    // Kết nối Voice
    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true
    });

    const audioPlayer = createAudioPlayer();
    connection.subscribe(audioPlayer);

    const session = {
        guildId,
        channelId: voiceChannel.id,
        connection,
        player: audioPlayer,
        currentIndex: 0,
        loopMode: LOOP_MODES.OFF,
        isShuffled: false,
        isPaused: false,
        textChannel: interaction.channel,
        lastMessage: null,
        idleTimer: null
    };

    players.set(guildId, session);

    // Lắng nghe kết nối rớt -> Thử reconnect trước (Discord chuyển region), chỉ cleanup nếu thật sự mất
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
            await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
        } catch {
            destroyPlayer(guildId);
        }
    });

    // Chờ kết nối VoiceConnection đi vào trạng thái Ready thực thụ trước khi phát nhạc
    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    } catch (err) {
        console.error('[EASTER EGG ERROR] Voice connection timeout:', err);
        destroyPlayer(guildId);
        return interaction.reply({
            content: '🌸 *Không thể kết nối vào phòng thoại, cậu kiểm tra lại kết nối mạng hoặc thử lại sau nhen~* 🍵'
        });
    }

    // Lắng nghe sự kiện phát hết bài -> Auto-Next (chỉ khi bài hát đang phát thực sự kết thúc)
    audioPlayer.on(AudioPlayerStatus.Idle, (oldState) => {
        if (oldState && (oldState.status === AudioPlayerStatus.Playing || oldState.status === AudioPlayerStatus.Buffering)) {
            handleTrackFinish(guildId);
        }
    });

    audioPlayer.on('error', (err) => {
        console.error(`[EASTER EGG AUDIO ERROR] Guild ${guildId}:`, err?.message || err);
    });

    // Bắt đầu phát bài đầu tiên (Elegie)
    await playTrackIndex(guildId, 0, interaction);
}

/**
 * Phát bài theo chỉ số Track Index
 */
async function playTrackIndex(guildId, index, interaction = null) {
    const session = players.get(guildId);
    if (!session) return;

    if (index < 0) index = playlist.length - 1;
    if (index >= playlist.length) index = 0;

    session.currentIndex = index;
    session.isPaused = false;
    const track = playlist[index];
    const source = getAudioStream(track);

    if (!source) {
        // Nếu thiếu file, tự động nhảy sang bài tiếp theo
        // Guard: đếm số bài bị skip liên tiếp để tránh vòng lặp vô hạn khi mất toàn bộ audio
        session._skipCount = (session._skipCount || 0) + 1;
        if (session._skipCount >= playlist.length) {
            session._skipCount = 0;
            console.warn(`[EASTER EGG] Không tìm thấy audio nào cho Guild ${guildId}, huỷ player.`);
            return destroyPlayer(guildId);
        }
        return handleTrackFinish(guildId);
    }
    session._skipCount = 0; // Reset khi phát thành công

    const resource = createAudioResource(source.stream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
    });

    session.player.play(resource);

    // Cập nhật Voice Channel Status
    await updateVoiceStatus(interaction?.client || session.textChannel?.client, session.channelId, `HVL - MCK 🎧 [${String(track.id).padStart(2, '0')}/30] ${track.title}`);

    // Render Embed UI
    const embed = buildPlayerEmbed(session, track);
    const row = buildControlRow(session);

    if (interaction && typeof interaction.editReply === 'function' && !session.lastMessage) {
        session.lastMessage = await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => null);
    } else if (session.lastMessage) {
        try {
            await session.lastMessage.edit({ embeds: [embed], components: [row] });
        } catch {
            session.lastMessage = await session.textChannel?.send({ embeds: [embed], components: [row] }).catch(() => null);
        }
    } else if (session.textChannel) {
        session.lastMessage = await session.textChannel?.send({ embeds: [embed], components: [row] }).catch(() => null);
    }
}

/**
 * Xử lý khi bài hát hoàn thành (Auto-Next logic)
 */
function handleTrackFinish(guildId) {
    const session = players.get(guildId);
    if (!session) return;

    if (session.loopMode === LOOP_MODES.ONE) {
        playTrackIndex(guildId, session.currentIndex);
    } else if (session.loopMode === LOOP_MODES.ALL) {
        const nextIdx = (session.currentIndex + 1) % playlist.length;
        playTrackIndex(guildId, nextIdx);
    } else {
        if (session.currentIndex + 1 < playlist.length) {
            playTrackIndex(guildId, session.currentIndex + 1);
        } else {
            // Hết album -> Dừng phát
            destroyPlayer(guildId);
        }
    }
}

/**
 * Xử lý Tương tác Nút bấm Player UI
 */
async function handleHvlButton(interaction) {
    const { customId, guildId } = interaction;
    if (!customId || !customId.startsWith('hvl_')) return false;

    const session = players.get(guildId);
    if (!session) {
        await interaction.reply({
            content: '🌸 *Đĩa nhạc bí mật đã ngắt kết nối mất rồi...* 🗝️',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return true;
    }

    // Cooldown 1.2s chống spam button (max=1 lần trong cửa sổ 1200ms)
    if (rateLimited(`hvl:${interaction.user.id}`, 1, 1200)) {
        await interaction.deferUpdate().catch(() => {});
        return true;
    }

    if (customId === 'hvl_prev') {
        await interaction.deferUpdate().catch(() => {});
        const prevIdx = (session.currentIndex - 1 + playlist.length) % playlist.length;
        await playTrackIndex(guildId, prevIdx);
    } else if (customId === 'hvl_toggle') {
        if (session.isPaused) {
            session.player.unpause();
            session.isPaused = false;
        } else {
            session.player.pause();
            session.isPaused = true;
        }
        const track = playlist[session.currentIndex];
        const embed = buildPlayerEmbed(session, track);
        const row = buildControlRow(session);
        await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    } else if (customId === 'hvl_next') {
        await interaction.deferUpdate().catch(() => {});
        const nextIdx = (session.currentIndex + 1) % playlist.length;
        await playTrackIndex(guildId, nextIdx);
    } else if (customId === 'hvl_loop') {
        if (session.loopMode === LOOP_MODES.OFF) session.loopMode = LOOP_MODES.ONE;
        else if (session.loopMode === LOOP_MODES.ONE) session.loopMode = LOOP_MODES.ALL;
        else session.loopMode = LOOP_MODES.OFF;

        const track = playlist[session.currentIndex];
        const embed = buildPlayerEmbed(session, track);
        const row = buildControlRow(session);
        await interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
    } else if (customId === 'hvl_stop') {
        // Reply trước, destroy sau — đảm bảo user nhận được thông báo
        await interaction.reply({
            content: '🌸 *Waguri đã cất đĩa nhạc bí mật HVL - MCK vào tủ kính tiệm Gekka rùi nhen~ Hẹn gặp lại cậu!* ✨',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        await destroyPlayer(guildId);
    }

    return true;
}

/**
 * Hủy Player & Cleanup tài nguyên
 */
async function destroyPlayer(guildId) {
    const session = players.get(guildId);
    if (!session) return;

    if (session.idleTimer) clearTimeout(session.idleTimer);

    try {
        session.player.stop();
        session.connection.destroy();
    } catch {
        // Ignore
    }

    await clearVoiceStatus(session.textChannel?.client, session.channelId);

    if (session.lastMessage) {
        try {
            const row = buildControlRow(session, true);
            await session.lastMessage.edit({ components: [row] }).catch(() => {});
        } catch {
            // Ignore
        }
    }

    players.delete(guildId);
}

module.exports = {
    startHvlPlayer,
    handleHvlButton,
    destroyPlayer,
    players,
    playlist
};
