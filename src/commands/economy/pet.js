const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { SPECIES, petLevel, expForLevel, findSpecies } = require('../../data/pets');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pet')
        .setDescription('Thú cưng của bạn 🐾')
        .addSubcommand(s => s.setName('adopt').setDescription('Nhận nuôi một bé')
            .addStringOption(o => o.setName('species').setDescription('Loài').setRequired(true)
                .addChoices(...SPECIES.map(sp => ({ name: `${sp.emoji} ${sp.name}`, value: sp.id }))))
            .addStringOption(o => o.setName('name').setDescription('Đặt tên (tuỳ chọn)')))
        .addSubcommand(s => s.setName('view').setDescription('Xem thú cưng'))
        .addSubcommand(s => s.setName('feed').setDescription('Cho thú cưng ăn để tăng kinh nghiệm')
            .addStringOption(o => o.setName('food').setDescription('Chọn loại thức ăn cho bé').setRequired(true)
                .addChoices(
                    { name: '🪙 Dùng xu (giá tăng theo cấp)', value: 'money' },
                    { name: '🍞 Bánh mì Việt Nam (Nông sản - x1.2 EXP)', value: 'banh_mi' },
                    { name: '🐟 Cá ngon (Nông sản - x1.5 EXP)', value: 'ca_ngon' },
                    { name: '🐠 Cá hiếm (Đặc sản - x2.2 EXP)', value: 'ca_hiem' },
                    { name: '🧁 Bánh Su Kem Gekka (Bánh nướng - x2.5 EXP)', value: 'banh_su_kem' },
                    { name: '🍮 Bánh Flan Caramel (Bánh nướng - x2.5 EXP)', value: 'banh_flan' },
                    { name: '🍰 Bánh Kem Dâu Gekka (Bánh nướng - x3.0 EXP)', value: 'banh_kem_dau' }
                )))
        .addSubcommand(s => s.setName('rename').setDescription('Đổi tên thú cưng')
            .addStringOption(o => o.setName('name').setDescription('Tên mới').setRequired(true))),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'adopt') {
            const species = interaction.options.getString('species');
            const name = interaction.options.getString('name') || findSpecies(species)?.name;
            const r = await db.adoptPet(userId, species, name);
            if (r === 'already') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pet.err_already_owned')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (r !== 'ok') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.pet.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const sp = findSpecies(species);
            const speciesName = t(locale, `species.${sp.id}`) || sp.name;
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.pet.adopt_success_title'),
                description: t(locale, 'commands.pet.adopt_success_desc', { emoji: sp.emoji, name, species: speciesName })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const pet = await db.getPet(userId);
        if (sub === 'view') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pet.err_not_owned')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const sp = findSpecies(pet.species);
            const lvl = petLevel(pet.exp);
            const next = expForLevel(lvl + 1);
            const petName = pet.name || t(locale, `species.${pet.species}`) || sp?.name;
            const speciesName = t(locale, `species.${pet.species}`) || sp?.name || pet.species;

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: `${sp?.emoji || '🐾'}・${petName}`,
                fields: [
                    { name: t(locale, 'commands.pet.field_species'), value: speciesName, inline: true },
                    { name: t(locale, 'commands.pet.field_level'), value: `Lv.${lvl}`, inline: true },
                    { name: t(locale, 'commands.pet.field_exp', { current: pet.exp, next }), value: createWaguriBar(pet.exp, next, 10), inline: false },
                ]
            });
            return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'feed') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pet.err_not_owned_feed')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const food = interaction.options.getString('food');
            const oldLvl = petLevel(pet.exp);
            const baseGain = Math.floor(Math.random() * (config.PET.FEED_EXP_MAX - config.PET.FEED_EXP_MIN + 1)) + config.PET.FEED_EXP_MIN;

            if (food === 'money') {
                const cost = config.PET.FEED_COST + config.PET.FEED_PER_LEVEL * oldLvl; // cấp càng cao ăn càng tốn
                const newExp = await db.feedPetWithFee(userId, baseGain, cost);
                if (newExp === -1) {
                    const embed = buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: t(locale, 'commands.pet.err_poor', { cost: fmt(cost, locale), currency: config.CURRENCY })
                    });
                    return interaction.editReply({ embeds: [embed] });
                }
                if (newExp === -2 || newExp === null) {
                    const embed = buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: t(locale, 'commands.pet.err_system')
                    });
                    return interaction.editReply({ embeds: [embed] });
                }
                const newLvl = petLevel(newExp);
                const sp = findSpecies(pet.species);
                const petName = pet.name || t(locale, `species.${pet.species}`) || sp?.name;
                
                let desc = t(locale, 'commands.pet.feed_success_desc_money', {
                    emoji: sp?.emoji || '🐾',
                    name: petName,
                    gain: baseGain,
                    cost: fmt(cost, locale),
                    currency: config.CURRENCY
                });
                if (newLvl > oldLvl) desc += `\n` + t(locale, 'commands.pet.level_up', { lvl: newLvl });

                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.pet.feed_success_title'),
                    description: desc
                });
                return interaction.editReply({ embeds: [embed] });
            } else {
                const FOOD_CONFIGS = {
                    banh_mi: { name: 'Bánh Mì Việt Nam 🍞', mult: 1.2 },
                    ca_ngon: { name: 'Cá ngon 🐟', mult: 1.5 },
                    ca_hiem: { name: 'Cá hiếm 🐠', mult: 2.2 },
                    banh_su_kem: { name: 'Bánh Su Kem Gekka 🧁', mult: 2.5 },
                    banh_flan: { name: 'Bánh Flan Caramel Gekka 🍮', mult: 2.5 },
                    banh_kem_dau: { name: 'Bánh Kem Dâu Gekka 🍰', mult: 3.0 }
                };
                const cfg = FOOD_CONFIGS[food];
                const foodName = t(locale, `items.${food}.name`) || cfg.name;
                const taken = await db.takeItem(userId, food, 1);
                if (!taken) {
                    const embed = buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: t(locale, 'commands.pet.err_no_food', { food: foodName })
                    });
                    return interaction.editReply({ embeds: [embed] });
                }

                const gain = Math.floor(baseGain * cfg.mult);
                const newExp = await db.feedPet(userId, gain);
                if (newExp === null) {
                    const embed = buildWaguriEmbed(interaction, 'warning', {
                        locale,
                        description: t(locale, 'commands.pet.err_system')
                    });
                    return interaction.editReply({ embeds: [embed] });
                }

                const newLvl = petLevel(newExp);
                const sp = findSpecies(pet.species);
                const petName = pet.name || t(locale, `species.${pet.species}`) || sp?.name;

                let desc = t(locale, 'commands.pet.feed_success_desc_item', {
                    emoji: sp?.emoji || '🐾',
                    name: petName,
                    food: foodName,
                    gain,
                    mult: cfg.mult
                });
                if (newLvl > oldLvl) desc += `\n` + t(locale, 'commands.pet.level_up', { lvl: newLvl });

                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.pet.feed_success_title'),
                    description: desc
                });
                return interaction.editReply({ embeds: [embed] });
            }
        }

        if (sub === 'rename') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pet.err_not_owned')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const name = interaction.options.getString('name');
            await db.renamePet(userId, name);
            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                description: t(locale, 'commands.pet.rename_success', { name })
            });
            return interaction.editReply({ embeds: [embed] });
        }
    },
};
