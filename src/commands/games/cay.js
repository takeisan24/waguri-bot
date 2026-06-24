const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const plant = require('../../lib/plant');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cay')
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
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const target = interaction.options.getUser('user');

        let r;
        switch (sub) {
            case 'info': r = await plant.plantStatus(userId); break;
            case 'muagiong': r = await plant.buyPlant(userId); break;
            case 'tuoi': r = target ? await plant.waterHelp(userId, target) : await plant.waterPlant(userId); break;
            case 'bonphan': r = await plant.fertilize(userId); break;
            case 'thuhoach': r = await plant.harvest(userId); break;
            case 'hoisinh': r = await plant.revivePlant(userId); break;
            case 'phacay': r = await plant.destroyPlant(userId); break;
            case 'trom': r = await plant.stealPlant(userId, target, interaction.guildId); break;
            case 'box': r = await plant.plantBox(userId, target); break;
            default: r = { type: 'error', title: '🌱・Trồng cây', description: 'Lệnh con không hợp lệ~' };
        }
        const embed = buildWaguriEmbed(interaction, r.type, { title: r.title, description: r.description });
        await interaction.editReply({ embeds: [embed] });
    },
};
