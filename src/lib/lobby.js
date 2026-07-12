const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const config = require('../config');
const { buildWaguriEmbed, getWaguriQuote } = require('./embed');
const { getInteractionLanguage, t } = require('./i18n');

/**
 * Mở một sảnh chờ nhiều người chơi.
 * @param interaction - slash interaction CHƯA defer/reply
 * @param opts {title, description, minPlayers, maxPlayers, joinSeconds, validate}
 *   validate(userId, username) -> trả chuỗi lỗi (từ chối) hoặc null/undefined (cho vào). Dùng để check tiền cược.
 * @returns Promise<Array<{id,username}>|null> - danh sách người chơi khi bắt đầu, hoặc null nếu hủy/không đủ.
 */
function openLobby(interaction, opts) {
    const {
        title, description = '', minPlayers = 2, maxPlayers = 10, joinSeconds = 30, validate = null,
    } = opts;
    const hostId = interaction.user.id;
    const players = new Map(); // id -> username

    return new Promise((resolve) => {
        (async () => {
            const locale = await getInteractionLanguage(interaction);

            const render = (closed = false) => {
                const list = [...players.values()].map((u, i) => `\`${i + 1}.\` ${u}`).join('\n') || t(locale, 'commands.lobby.empty');
                const type = closed ? 'success' : 'info';
                const embed = buildWaguriEmbed(interaction, type, {
                    locale,
                    title: title,
                    description: `${description}\n\n**${t(locale, 'commands.lobby.player_list', { count: players.size, max: maxPlayers })}**\n${list}\n\n` +
                        (closed ? t(locale, 'commands.lobby.start') : t(locale, 'commands.lobby.join_prompt', { joinSeconds, min: minPlayers }))
                });
                
                embed.setFooter({
                    text: t(locale, 'commands.lobby.host', { host: players.get(hostId) || interaction.user.username }) + ` • ${getWaguriQuote(locale)}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                });
                return embed;
            };

            const buttons = () => new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('lobby_join').setLabel(t(locale, 'commands.lobby.btn_join')).setStyle(ButtonStyle.Success).setEmoji('🙋'),
                new ButtonBuilder().setCustomId('lobby_leave').setLabel(t(locale, 'commands.lobby.btn_leave')).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('lobby_start').setLabel(t(locale, 'commands.lobby.btn_start')).setStyle(ButtonStyle.Primary),
            );

            const replyEphemeral = (targetInteraction, type, text) => {
                const embed = buildWaguriEmbed(interaction, type, { locale, description: text });
                if (targetInteraction.deferred || targetInteraction.replied) {
                    return targetInteraction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
                }
                return targetInteraction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            };

            // Chủ phòng tự vào (kiểm tra điều kiện trước)
            if (validate) {
                const err = await validate(hostId, interaction.user.username);
                if (err) { await replyEphemeral(interaction, 'warning', err); return resolve(null); }
            }
            players.set(hostId, interaction.user.username);

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [render()], components: [buttons()] });
            } else {
                await interaction.reply({ embeds: [render()], components: [buttons()] });
            }
            const msg = await interaction.fetchReply();

            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: joinSeconds * 1000 });
            let outcome = null; // sẽ là 'start' | 'cancel'

            collector.on('collect', async (i) => {
                if (i.customId === 'lobby_join') {
                    if (players.has(i.user.id)) return replyEphemeral(i, 'warning', t(locale, 'commands.lobby.err_already_joined'));
                    if (players.size >= maxPlayers) return replyEphemeral(i, 'warning', t(locale, 'commands.lobby.err_full'));
                    if (validate) {
                        const err = await validate(i.user.id, i.user.username);
                        if (err) return replyEphemeral(i, 'warning', err);
                    }
                    players.set(i.user.id, i.user.username);
                    return i.update({ embeds: [render()], components: [buttons()] });
                }
                if (i.customId === 'lobby_leave') {
                    if (i.user.id === hostId) { outcome = 'cancel'; return collector.stop('cancel'); } // host rời = hủy
                    if (!players.has(i.user.id)) return replyEphemeral(i, 'warning', t(locale, 'commands.lobby.err_not_in'));
                    players.delete(i.user.id);
                    return i.update({ embeds: [render()], components: [buttons()] });
                }
                if (i.customId === 'lobby_start') {
                    if (i.user.id !== hostId) return replyEphemeral(i, 'warning', t(locale, 'commands.lobby.err_not_host'));
                    if (players.size < minPlayers) return replyEphemeral(i, 'warning', t(locale, 'commands.lobby.err_min_players', { min: minPlayers }));
                    outcome = 'start';
                    await i.update({ embeds: [render(true)], components: [] });
                    return collector.stop('start');
                }
            });

            collector.on('end', async () => {
                if (outcome === 'cancel') {
                    await interaction.editReply({ embeds: [render().setColor(config.COLORS.ERROR).setTitle(t(locale, 'commands.lobby.cancelled_title', { title }))], components: [] }).catch(() => {});
                    return resolve(null);
                }
                if (players.size >= minPlayers) {
                    if (outcome !== 'start') await interaction.editReply({ embeds: [render(true)], components: [] }).catch(() => {});
                    return resolve([...players].map(([id, username]) => ({ id, username })));
                }
                await interaction.editReply({ embeds: [render().setColor(config.COLORS.WARNING).setTitle(t(locale, 'commands.lobby.not_enough_title', { title })).setFooter({ text: t(locale, 'commands.lobby.try_again') })], components: [] }).catch(() => {});
                return resolve(null);
            });
        })().catch((e) => { console.error('[LOBBY ERROR]', e); resolve(null); });
    });
}

module.exports = { openLobby };
