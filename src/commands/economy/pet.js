const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { SPECIES, petLevel, expForLevel, findSpecies } = require('../../data/pets');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');

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
        .addSubcommand(s => s.setName('feed').setDescription('Cho ăn cho bé (giá tăng theo cấp)'))
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
            if (r === 'already') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu đã có thú cưng rồi mà~ Gõ `/pet view` để xem nhé.'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r !== 'ok') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: 'Ơ, có lỗi khi nhận nuôi, thử lại sau nhé~ 🌸'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const sp = findSpecies(species);
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🐾・Nhận nuôi thành công!',
                description: `Chào mừng ${sp.emoji} **${name}** đến với cậu! Nhớ \`/pet feed\` cho bé lớn nhé~`
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const pet = await db.getPet(userId);
        if (sub === 'view') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu chưa có thú cưng~ Gõ `/pet adopt` để nhận nuôi một bé nhé! 🐾'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const sp = findSpecies(pet.species);
            const lvl = petLevel(pet.exp);
            const next = expForLevel(lvl + 1);
            const embed = buildWaguriEmbed(interaction, 'info', {
                title: `${sp?.emoji || '🐾'}・${pet.name || sp?.name}`,
                fields: [
                    { name: 'Loài', value: sp?.name || pet.species, inline: true },
                    { name: 'Cấp độ', value: `Lv.${lvl}`, inline: true },
                    { name: `Tiến trình EXP (${pet.exp}/${next})`, value: createWaguriBar(pet.exp, next, 10), inline: false },
                ]
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'feed') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu chưa có thú cưng để cho ăn~ Gõ `/pet adopt` nhé!'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const oldLvl = petLevel(pet.exp);
            const cost = config.PET.FEED_COST + config.PET.FEED_PER_LEVEL * oldLvl; // cấp càng cao ăn càng tốn
            const gain = Math.floor(Math.random() * (config.PET.FEED_EXP_MAX - config.PET.FEED_EXP_MIN + 1)) + config.PET.FEED_EXP_MIN;
            const newExp = await db.feedPetWithFee(userId, gain, cost);
            if (newExp === -1) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Cậu không đủ **${fmt(cost)}** ${config.CURRENCY} để cho bé ăn (cấp càng cao ăn càng tốn)~ 😟`
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (newExp === -2 || newExp === null) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Ơ, có lỗi khi cho bé ăn hoặc cậu chưa nhận nuôi thú cưng, thử lại sau nhé~ 🌸`
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const newLvl = petLevel(newExp);
            const sp = findSpecies(pet.species);
            let desc = `${sp?.emoji || '🐾'} **${pet.name || sp?.name}** ăn ngon lành! +${gain} EXP 😋 *(tốn ${fmt(cost)} ${config.CURRENCY})*`;
            if (newLvl > oldLvl) desc += `\n🎉 Bé đã lên **Lv.${newLvl}**!`;
            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🍖・Cho thú cưng ăn',
                description: desc
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'rename') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: 'Cậu chưa có thú cưng~ Gõ `/pet adopt` nhé!'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const name = interaction.options.getString('name');
            await db.renamePet(userId, name);
            const embed = buildWaguriEmbed(interaction, 'success', {
                description: `✅ Đã đổi tên thú cưng thành **${name}**~ 🐾`
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
