const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const pig = require('../../lib/pig');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('heo')
        .setDescription('Nuôi heo 🐷 — mua, chăm, bán, trộm (cũng dùng được prefix w!muaheo...)')
        .addSubcommand(s => s.setName('info').setDescription('Xem tình trạng heo của cậu'))
        .addSubcommand(s => s.setName('mua').setDescription('Mua một chú heo con (1.000)'))
        .addSubcommand(s => s.setName('an').setDescription('Cho heo ăn (lần 1 miễn phí, lần 2 tốn 500 để trưởng thành)'))
        .addSubcommand(s => s.setName('tam').setDescription('Tắm cho heo (hoặc tắm hộ heo người khác)')
            .addUserOption(o => o.setName('user').setDescription('Tắm hộ heo của ai (bỏ trống = heo của cậu)')))
        .addSubcommand(s => s.setName('ngu').setDescription('Cho heo ngủ'))
        .addSubcommand(s => s.setName('ban').setDescription('Chế biến & bán heo trưởng thành (nhận thịt heo)'))
        .addSubcommand(s => s.setName('chuabenh').setDescription('Chữa bệnh cho heo (1.000)'))
        .addSubcommand(s => s.setName('trom').setDescription('Trộm heo trưởng thành của người khác (rủi ro!)')
            .addUserOption(o => o.setName('user').setDescription('Mục tiêu').setRequired(true)))
        .addSubcommand(s => s.setName('box').setDescription('Mở Pigbox may mắn (2.400)')
            .addUserOption(o => o.setName('user').setDescription('Tặng Pigbox cho ai (bỏ trống = cho mình)'))),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const target = interaction.options.getUser('user');

        let r;
        switch (sub) {
            case 'info': r = await pig.pigStatus(userId, locale); break;
            case 'mua': r = await pig.buyPig(userId, locale); break;
            case 'an': r = await pig.feedPig(userId, locale); break;
            case 'tam': r = target ? await pig.bathHelp(userId, target, locale) : await pig.bathePig(userId, locale); break;
            case 'ngu': r = await pig.sleepPig(userId, locale); break;
            case 'ban': r = await pig.sellPig(userId, locale); break;
            case 'chuabenh': r = await pig.healPig(userId, locale); break;
            case 'trom': r = await pig.stealPig(userId, target, interaction.guildId, locale); break;
            case 'box': r = await pig.pigBox(userId, target, locale); break;
            default: r = { type: 'error', title: t(locale, 'pig.title'), description: t(locale, 'common.invalid_subcommand') };
        }
        const embed = buildWaguriEmbed(interaction, r.type, { locale, title: r.title, description: r.description });
        await interaction.editReply({ embeds: [embed] });
    },
};
