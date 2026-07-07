const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isOwner } = require('../../lib/owner');
const { setEvent, clearEvent, getEventInfo } = require('../../lib/event');
const { buildWaguriEmbed } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Sự kiện nhân thu nhập/EXP toàn bot (bật/tắt chỉ owner)')
        .addSubcommand(s => s.setName('start').setDescription('Bật sự kiện (owner)')
            .addNumberOption(o => o.setName('multiplier').setDescription('Hệ số nhân (vd 2)').setRequired(true).setMinValue(1).setMaxValue(10))
            .addIntegerOption(o => o.setName('hours').setDescription('Số giờ kéo dài').setRequired(true).setMinValue(1).setMaxValue(720))
            .addStringOption(o => o.setName('name').setDescription('Tên sự kiện (vd Tết)')))
        .addSubcommand(s => s.setName('stop').setDescription('Tắt sự kiện (owner)'))
        .addSubcommand(s => s.setName('status').setDescription('Xem sự kiện hiện tại')),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        if (sub !== 'status' && !await isOwner(interaction.client, interaction.user.id)) {
            return interaction.reply({ content: t(locale, 'commands.event.err_owner'), flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();

        if (sub === 'start') {
            const mult = interaction.options.getNumber('multiplier');
            const hours = interaction.options.getInteger('hours');
            const name = interaction.options.getString('name') || t(locale, 'commands.event.name_default') || 'Sự kiện';
            await setEvent(mult, hours, name);
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.event.start_title'),
                description: t(locale, 'commands.event.start_desc', { name, mult, hours })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'stop') {
            await clearEvent();
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.event.stop_title'),
                description: t(locale, 'commands.event.stop_desc')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const e = getEventInfo();
        if (!e.active) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                description: t(locale, 'commands.event.no_event')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        const ts = Math.floor(e.until / 1000);
        const embed = buildWaguriEmbed(interaction, 'jackpot', {
            locale,
            title: t(locale, 'commands.event.active_title'),
            description: t(locale, 'commands.event.active_desc', { name: e.name || 'Sự kiện', mult: e.mult, time: ts })
        });
        return interaction.editReply({ embeds: [embed] });
    },
};
