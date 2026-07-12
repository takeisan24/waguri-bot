const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { SPECIES, petLevel, expForLevel, findSpecies } = require('../../data/pets');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

function getPetStageInfo(speciesId, lvl, locale) {
    const sp = findSpecies(speciesId);
    const isEn = locale.startsWith('en');
    if (lvl >= 30) {
        const stageEmojis = { meo: '🦁', cun: '🐺', rong: '⚡', cao: '🦊', tho: '🐰', gau: '🐻' };
        const stageNames = {
            meo: isEn ? 'Cat King' : 'Hoàng Thượng Hoàng Gia',
            cun: isEn ? 'Guard Dog' : 'Ngáo Thần Vệ Sĩ',
            rong: isEn ? 'Black Dragon' : 'Hắc Long Vương',
            cao: isEn ? 'Nine-Tailed Fox' : 'Cửu Vĩ Thiên Cáo',
            tho: isEn ? 'Jade Rabbit' : 'Ngọc Thỏ Cung Trăng',
            gau: isEn ? 'Divine Bear' : 'Bán Thần Hùng Vương'
        };
        return { emoji: stageEmojis[speciesId] || sp.emoji, stageName: stageNames[speciesId] || sp.name, stage: 3 };
    } else if (lvl >= 10) {
        const stageEmojis = { meo: '🐈', cun: '🐕', rong: '🐉', cao: '🦊', tho: '🐰', gau: '🐻' };
        const stageNames = {
            meo: isEn ? 'Adult Cat' : 'Mèo Lớn',
            cun: isEn ? 'Adult Dog' : 'Chó Lớn',
            rong: isEn ? 'Adult Dragon' : 'Rồng Trưởng Thành',
            cao: isEn ? 'Mystic Fox' : 'Linh Cáo',
            tho: isEn ? 'Swift Rabbit' : 'Linh Thỏ',
            gau: isEn ? 'Grizzly Bear' : 'Gấu Xám'
        };
        return { emoji: stageEmojis[speciesId] || sp.emoji, stageName: stageNames[speciesId] || sp.name, stage: 2 };
    }
    return { emoji: sp?.emoji || '🐾', stageName: isEn ? sp?.name_en || sp?.name : sp?.name, stage: 1 };
}

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
            .addStringOption(o => o.setName('name').setDescription('Tên mới').setRequired(true)))
        .addSubcommand(s => s.setName('skill-up').setDescription('Nâng cấp kỹ năng bị động cho thú cưng')
            .addStringOption(o => o.setName('skill').setDescription('Chọn kỹ năng').setRequired(true)
                .addChoices(
                    { name: '🎣 May mắn câu cá (+% tỉ lệ cá hiếm)', value: 'fishing_luck' },
                    { name: '⛏️ Nhân đôi quặng (+% cơ hội nhận x2 đá)', value: 'double_gem' },
                    { name: '🍰 Nướng bánh Gekka (-% thời gian nướng bánh)', value: 'bakery_efficiency' }
                ))),
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
            const stageInfo = getPetStageInfo(pet.species, lvl, locale);

            const isEn = locale.startsWith('en');
            const skills = pet.skills || {};
            const fishingLuckLvl = skills.fishing_luck || 0;
            const doubleGemLvl = skills.double_gem || 0;
            const bakeryLvl = skills.bakery_efficiency || 0;

            const skillsText = isEn
                ? `- 🎣 Fishing Luck: Lv.${fishingLuckLvl}/3\n- ⛏️ Double Ores: Lv.${doubleGemLvl}/2\n- 🍰 Bakery Efficiency: Lv.${bakeryLvl}/3`
                : `- 🎣 May mắn Câu cá: Cấp ${fishingLuckLvl}/3\n- ⛏️ Nhân đôi Đá quý: Cấp ${doubleGemLvl}/2\n- 🍰 Hiệu suất Tiệm bánh: Cấp ${bakeryLvl}/3`;

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: `${stageInfo.emoji}・${petName}`,
                fields: [
                    { name: t(locale, 'commands.pet.field_species'), value: `${stageInfo.stageName} (Stage ${stageInfo.stage})`, inline: true },
                    { name: t(locale, 'commands.pet.field_level'), value: `Lv.${lvl}`, inline: true },
                    { name: t(locale, 'commands.pet.field_exp', { current: pet.exp, next }), value: createWaguriBar(pet.exp, next, 10), inline: false },
                    { name: isEn ? '✨ Passive Skills' : '✨ Kỹ năng bị động', value: skillsText, inline: true },
                    { name: isEn ? '💡 Skill Points' : '💡 Điểm kỹ năng', value: `**${pet.skill_points || 0}**`, inline: true }
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
                if (newLvl > oldLvl) {
                    desc += `\n` + t(locale, 'commands.pet.level_up', { lvl: newLvl });
                    const oldPoints = Math.floor(oldLvl / 5);
                    const newPoints = Math.floor(newLvl / 5);
                    const pointsGained = newPoints - oldPoints;
                    if (pointsGained > 0) {
                        await db.addPetSkillPoints(userId, pointsGained);
                        desc += `\n` + (locale.startsWith('en') 
                            ? `✨ Your pet earned **+${pointsGained} Skill Points**!` 
                            : `✨ Thú cưng nhận thêm **+${pointsGained} Điểm kỹ năng**!`);
                    }
                }

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
                if (newLvl > oldLvl) {
                    desc += `\n` + t(locale, 'commands.pet.level_up', { lvl: newLvl });
                    const oldPoints = Math.floor(oldLvl / 5);
                    const newPoints = Math.floor(newLvl / 5);
                    const pointsGained = newPoints - oldPoints;
                    if (pointsGained > 0) {
                        await db.addPetSkillPoints(userId, pointsGained);
                        desc += `\n` + (locale.startsWith('en') 
                            ? `✨ Your pet earned **+${pointsGained} Skill Points**!` 
                            : `✨ Thú cưng nhận thêm **+${pointsGained} Điểm kỹ năng**!`);
                    }
                }

                const embed = buildWaguriEmbed(interaction, 'success', {
                    locale,
                    title: t(locale, 'commands.pet.feed_success_title'),
                    description: desc
                });
                return interaction.editReply({ embeds: [embed] });
            }
        }

        if (sub === 'skill-up') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pet.err_not_owned')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const skillId = interaction.options.getString('skill');
            const skillPoints = pet.skill_points || 0;
            if (skillPoints <= 0) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: locale.startsWith('en')
                        ? 'Your pet does not have any Skill Points left! Feed it to level up.'
                        : 'Thú cưng của cậu không còn Điểm kỹ năng nào! Hãy cho ăn để lên cấp.'
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const maxLevel = skillId === 'double_gem' ? 2 : 3;
            const skills = pet.skills || {};
            const curLvl = skills[skillId] || 0;

            if (curLvl >= maxLevel) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: locale.startsWith('en')
                        ? `This skill has already reached its maximum level (${maxLevel})!`
                        : `Kỹ năng này đã đạt cấp tối đa (${maxLevel})!`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            skills[skillId] = curLvl + 1;
            const newPoints = skillPoints - 1;

            const ok = await db.updatePetSkills(userId, skills, newPoints);
            if (!ok) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.pet.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const isEn = locale.startsWith('en');
            const skillNames = {
                fishing_luck: isEn ? 'Fishing Luck' : 'May mắn Câu cá',
                double_gem: isEn ? 'Double Ores' : 'Nhân đôi Đá quý',
                bakery_efficiency: isEn ? 'Bakery Efficiency' : 'Hiệu suất Tiệm bánh'
            };

            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: isEn ? 'Skill Upgraded!' : 'Nâng cấp kỹ năng thành công!',
                description: isEn
                    ? `Successfully upgraded **${skillNames[skillId]}** to **Level ${curLvl + 1}**! Remaining Skill Points: ${newPoints}.`
                    : `Đã nâng cấp kỹ năng **${skillNames[skillId]}** lên **Cấp ${curLvl + 1}**! Điểm kỹ năng còn lại: ${newPoints}.`
            });
            return interaction.editReply({ embeds: [embed] });
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
