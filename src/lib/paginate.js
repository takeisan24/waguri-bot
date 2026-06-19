const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { getWaguriQuote } = require('./embed');

/**
 * Gửi danh sách dạng phân trang (nút ◀ ▶). Chạy được cả slash lẫn prefix.
 * Yêu cầu: đã deferReply() trước khi gọi.
 * @param interaction - interaction (hoặc shim prefix) đã defer
 * @param {{title, color, lines:string[], perPage?, footerNote?, thumbnail?}} opts
 */
async function sendPaginated(interaction, { title, color, lines, perPage = 10, footerNote, thumbnail }) {
    const pages = [];
    for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
    if (pages.length === 0) pages.push(['(trống)']);

    let page = 0;
    const render = () => {
        const e = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(pages[page].join('\n'))
            .setFooter({
                text: `🌸 Trang ${page + 1}/${pages.length}` + (footerNote ? ` · ${footerNote}` : '') + ` • Waguri`,
                iconURL: interaction.client.user.displayAvatarURL()
            });
        if (thumbnail) e.setThumbnail(thumbnail);
        return e;
    };

    if (pages.length === 1) {
        return interaction.editReply({ embeds: [render()] });
    }

    const row = () => new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page === pages.length - 1),
    );

    const msg = await interaction.editReply({ embeds: [render()], components: [row()] });
    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button, time: 90_000,
        filter: i => i.user.id === interaction.user.id,
    });

    collector.on('collect', async (i) => {
        if (i.customId === 'prev') page = Math.max(0, page - 1);
        else if (i.customId === 'next') page = Math.min(pages.length - 1, page + 1);
        await i.update({ embeds: [render()], components: [row()] });
    });
    collector.on('end', async () => {
        await interaction.editReply({ components: [] }).catch(() => {});
    });
}

module.exports = { sendPaginated };
