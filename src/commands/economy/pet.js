const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { SPECIES, petLevel, expForLevel, findSpecies } = require('../../data/pets');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pet')
        .setDescription('Thú cưng của bạn 🐾')
        .addSubcommand(s => s.setName('adopt').setDescription('Nhận nuôi một bé')
            .addStringOption(o => o.setName('species').setDescription('Loài').setRequired(true)
                .addChoices(...SPECIES.map(sp => ({ name: `${sp.emoji} ${sp.name}`, value: sp.id }))))
            .addStringOption(o => o.setName('name').setDescription('Đặt tên (tuỳ chọn)')))
        .addSubcommand(s => s.setName('view').setDescription('Xem thú cưng'))
        .addSubcommand(s => s.setName('feed').setDescription(`Cho ăn (tốn ${200} ${'VNĐ'})`))
        .addSubcommand(s => s.setName('rename').setDescription('Đổi tên thú cưng')
            .addStringOption(o => o.setName('name').setDescription('Tên mới').setRequired(true))),
    async execute(interaction) {
        await interaction.deferReply();
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'adopt') {
            const species = interaction.options.getString('species');
            const name = interaction.options.getString('name') || findSpecies(species)?.name;
            const r = await db.adoptPet(userId, species, name);
            if (r === 'already') return interaction.editReply('Cậu đã có thú cưng rồi mà~ Gõ `/pet view` để xem nhé.');
            if (r !== 'ok') return interaction.editReply('Ơ, có lỗi khi nhận nuôi, thử lại sau nhé~ 🌸');
            const sp = findSpecies(species);
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.SUCCESS)
                .setTitle('🐾 Nhận nuôi thành công!')
                .setDescription(`Chào mừng ${sp.emoji} **${name}** đến với cậu! Nhớ \`/pet feed\` cho bé lớn nhé~`)] });
        }

        const pet = await db.getPet(userId);
        if (sub === 'view') {
            if (!pet) return interaction.editReply('Cậu chưa có thú cưng~ Gõ `/pet adopt` để nhận nuôi một bé nhé! 🐾');
            const sp = findSpecies(pet.species);
            const lvl = petLevel(pet.exp);
            const next = expForLevel(lvl + 1);
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.INFO)
                .setTitle(`${sp?.emoji || '🐾'} ${pet.name || sp?.name}`)
                .addFields(
                    { name: 'Loài', value: sp?.name || pet.species, inline: true },
                    { name: 'Cấp độ', value: `Lv.${lvl}`, inline: true },
                    { name: 'EXP', value: `${pet.exp}/${next}`, inline: true },
                )] });
        }

        if (sub === 'feed') {
            if (!pet) return interaction.editReply('Cậu chưa có thú cưng để cho ăn~ Gõ `/pet adopt` nhé!');
            if (!await db.addMoney(userId, -config.PET.FEED_COST, 'wallet')) {
                return interaction.editReply(`Cậu không đủ **${fmt(config.PET.FEED_COST)}** ${config.CURRENCY} để mua đồ ăn cho bé~ 😟`);
            }
            const gain = Math.floor(Math.random() * (config.PET.FEED_EXP_MAX - config.PET.FEED_EXP_MIN + 1)) + config.PET.FEED_EXP_MIN;
            const oldLvl = petLevel(pet.exp);
            const newExp = await db.feedPet(userId, gain);
            const newLvl = petLevel(newExp);
            const sp = findSpecies(pet.species);
            let desc = `${sp?.emoji || '🐾'} **${pet.name || sp?.name}** ăn ngon lành! +${gain} EXP 😋`;
            if (newLvl > oldLvl) desc += `\n🎉 Bé đã lên **Lv.${newLvl}**!`;
            return interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.COLORS.SUCCESS).setDescription(desc)] });
        }

        if (sub === 'rename') {
            if (!pet) return interaction.editReply('Cậu chưa có thú cưng~ Gõ `/pet adopt` nhé!');
            const name = interaction.options.getString('name');
            await db.renamePet(userId, name);
            return interaction.editReply(`✅ Đã đổi tên thú cưng thành **${name}**~ 🐾`);
        }
    },
};
