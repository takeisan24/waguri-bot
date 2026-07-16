const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { clearUserContexts } = require('../../lib/ai');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletedata')
        .setDescription('Xoá toàn bộ dữ liệu cá nhân của bạn khỏi Waguri (không hoàn tác) 🗑️'),

    async execute(interaction) {
        // Ephemeral: chuyện dữ liệu cá nhân — chỉ mình cậu thấy.
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const locale = await getInteractionLanguage(interaction);
        const userId = interaction.user.id;

        const warn = buildWaguriEmbed(interaction, 'warning', {
            locale,
            title: t(locale, 'commands.deletedata.warning_title'),
            description: t(locale, 'commands.deletedata.warning_desc')
        });
        const row = (disabled = false) => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm').setLabel(t(locale, 'commands.deletedata.btn_confirm')).setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId('cancel').setLabel(t(locale, 'commands.deletedata.btn_cancel')).setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        );

        const msg = await interaction.editReply({ embeds: [warn], components: [row()] });
        const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60_000 });

        let acted = false;
        collector.on('collect', async (i) => {
            if (i.user.id !== userId) {
                return i.reply({ content: t(locale, 'common.not_for_you'), flags: MessageFlags.Ephemeral });
            }
            acted = true;

            if (i.customId === 'cancel') {
                const e = buildWaguriEmbed(interaction, 'success', { locale, description: t(locale, 'commands.deletedata.cancelled_desc') });
                await i.update({ embeds: [e], components: [] });
                return collector.stop('done');
            }

            const res = await db.deleteUserData(userId);
            let e;
            if (res === 'ok') {
                clearUserContexts(userId);
                e = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.deletedata.success_title'),
                    description: t(locale, 'commands.deletedata.success_desc')
                });
            } else if (res === 'blocked_loans') {
                e = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.deletedata.blocked_loans_desc')
                });
            } else if (res === 'blocked_clan_leader') {
                e = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.deletedata.blocked_clan_leader_desc')
                });
            } else {
                e = buildWaguriEmbed(interaction, 'error', { locale, description: t(locale, 'commands.deletedata.error_desc') });
            }
            await i.update({ embeds: [e], components: [] });
            collector.stop('done');
        });

        collector.on('end', async () => {
            if (!acted) await interaction.editReply({ components: [row(true)] }).catch(() => {});
        });
    },
};
