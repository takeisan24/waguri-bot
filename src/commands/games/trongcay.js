const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const plant = require('../../lib/plant');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trongcay')
        .setDescription('Trồng cây 🌱 — mua giống, tưới, thu hoạch, trộm (cũng dùng được prefix w!muagiong...)')
        .addSubcommand(s => s.setName('info').setDescription('Xem tình trạng cây của cậu'))
        .addSubcommand(s => s.setName('muagiong').setDescription('Mua giống & trồng cây (500)'))
        .addSubcommand(s => s.setName('tuoi').setDescription('Tưới nước (hoặc tưới hộ cây người khác)')
            .addUserOption(o => o.setName('user').setDescription('Tưới hộ cây của ai (bỏ trống = cây của cậu)')))
        .addSubcommand(s => s.setName('bonphan').setDescription('Bón phân để cây thêm 1 nước ngay (200)'))
        .addSubcommand(s => s.setName('thuhoach').setDescription('Thu hoạch cây trưởng thành (nhận trái/hoa)'))
        .addSubcommand(s => s.setName('hoisinh').setDescription('Hồi sinh cây đã chết (1.000)'))
        .addSubcommand(s => s.setName('phacay').setDescription('Phá cây hiện tại để trồng cây mới'))
        .addSubcommand(s => s.setName('trom').setDescription('Trộm cây trưởng thành của người khác (rủi ro!)')
            .addUserOption(o => o.setName('user').setDescription('Mục tiêu').setRequired(true)))
        .addSubcommand(s => s.setName('box').setDescription('Mở Plantbox may mắn (600)')
            .addUserOption(o => o.setName('user').setDescription('Tặng Plantbox cho ai (bỏ trống = cho mình)'))),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const target = interaction.options.getUser('user');

        let r;
        switch (sub) {
            case 'info': r = await plant.plantStatus(userId, locale); break;
            case 'muagiong': r = await plant.buyPlant(userId, locale); break;
            case 'tuoi': r = target ? await plant.waterHelp(userId, target, locale) : await plant.waterPlant(userId, locale); break;
            case 'bonphan': r = await plant.fertilize(userId, locale); break;
            case 'thuhoach': r = await plant.harvest(userId, locale); break;
            case 'hoisinh': r = await plant.revivePlant(userId, locale); break;
            case 'phacay': r = await plant.destroyPlant(userId, locale); break;
            case 'trom': r = await plant.stealPlant(userId, target, interaction.guildId, locale); break;
            case 'box': r = await plant.plantBox(userId, target, locale); break;
            default: r = { type: 'error', title: t(locale, 'plant.title'), description: t(locale, 'common.invalid_subcommand') };
        }
        const embed = buildWaguriEmbed(interaction, r.type, { locale, title: r.title, description: r.description });
        await interaction.editReply({ embeds: [embed] });
    },
};
