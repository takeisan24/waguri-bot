const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const {
    SPECIES, petLevel, expForLevel, findSpecies,
    petRarity, buffOf, petBuffValue, petThiefFineCut, nextRarity, RARITY,
} = require('../../data/pets');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

// Danh hiệu tiến hoá cho sáu loài gốc, hiện ra từ bậc 🟠 Huyền Thoại. Bảng cũ gắn danh
// hiệu vào Lv.10/30 — mà Lv.30 chưa ai từng tới, nên chúng chưa từng hiển thị. Nay gắn
// vào BẬC, và bậc thì với tới được.
const EVO_TITLES = {
    meo:  { vi: 'Hoàng Thượng Hoàng Gia', en: 'Cat King',        emoji: '🦁' },
    cun:  { vi: 'Ngáo Thần Vệ Sĩ',        en: 'Guard Dog',       emoji: '🐺' },
    rong: { vi: 'Hắc Long Vương',         en: 'Black Dragon',    emoji: '⚡' },
    cao:  { vi: 'Cửu Vĩ Thiên Cáo',       en: 'Nine-Tailed Fox', emoji: '🌟' },
    tho:  { vi: 'Ngọc Thỏ Cung Trăng',    en: 'Jade Rabbit',     emoji: '🌙' },
    gau:  { vi: 'Bán Thần Hùng Vương',    en: 'Divine Bear',     emoji: '💪' },
};

/**
 * Tên + emoji hiển thị của một pet, theo BẬC (không theo cấp như bản cũ).
 * Tên loài lấy qua i18n `species.*` — bản cũ đọc `sp.name_en`, một trường KHÔNG tồn tại
 * trong SPECIES, nên người dùng tiếng Anh luôn rơi về tên tiếng Việt.
 */
function getPetDisplay(pet, locale) {
    const isEn = locale.startsWith('en');
    const sp = findSpecies(pet.species);
    const rar = petRarity(pet);
    const speciesName = t(locale, `species.${pet.species}`) || sp?.name || pet.species;
    const evo = EVO_TITLES[pet.species];
    const evolved = evo && ['legendary', 'mythic'].includes(rar.key);
    return {
        emoji: evolved ? evo.emoji : (sp?.emoji || '🐾'),
        speciesEmoji: sp?.emoji || '🐾',
        speciesName,
        formName: evolved ? (isEn ? evo.en : evo.vi) : speciesName,
        rarity: rar,
        rarityName: t(locale, `rarity.${rar.key}`) || rar.key,
    };
}

/**
 * Tên hiển thị của một vật phẩm, theo ĐÚNG quy ước repo: `vi.json` cố tình KHÔNG dịch
 * `data.items.*` (tên tiếng Việt lấy thẳng từ cột `items.name`), chỉ `en.json` mới có
 * bản dịch. Thiếu nhánh fallback DB là in ra mã máy kiểu `ca_koi_nhat` — đúng lỗi đã
 * vá ở commit 8d3b60a.
 */
async function itemName(id, locale) {
    return t(locale, `data.items.${id}.name`) || (await db.getItem(id))?.name || id;
}

/** Mỗi phần tử của `sets` là MỘT bộ lễ vật thay thế nhau -> trả về mảng chuỗi đã nối "+". */
async function itemSetNames(sets, locale) {
    return Promise.all((sets || []).map(async set =>
        (await Promise.all((set || []).filter(Boolean).map(id => itemName(id, locale)))).join(' + ')));
}

/** Dòng mô tả buff loài — sinh TỪ CODE đang chạy, nên không thể hứa sai như bản web cũ. */
function describeBuff(pet, locale) {
    const isEn = locale.startsWith('en');
    const id = buffOf(pet);
    if (!id) return isEn ? '_No species power._' : '_Loài này chưa có năng lực._';
    const pct = v => (v * 100).toFixed(0);
    const v = petBuffValue(pet, id);
    const lines = {
        jackpot: isEn ? `🍀 **Fortune** — +${pct(v)} pts jackpot chance on \`/work\``
                      : `🍀 **Chiêu tài** — +${pct(v)} điểm % cơ hội trúng lớn khi \`/work\``,
        guard:   isEn ? `🛡️ **Guardian** — robbers lose ${pct(v)} pts success rate against you`
                      : `🛡️ **Hộ chủ** — kẻ cướp bị trừ ${pct(v)} điểm % tỉ lệ thành công khi nhắm vào cậu`,
        exp:     isEn ? `📘 **Scholar** — +${pct(v)}% EXP from \`/work\` and all gathering`
                      : `📘 **Khai trí** — +${pct(v)}% EXP từ \`/work\` và mọi lệnh cày cuốc`,
        thief:   isEn ? `🗝️ **Trickster** — +${pct(v)}% stolen on \`/rob\`, −${pct(petThiefFineCut(pet))}% fine when caught`
                      : `🗝️ **Ranh mãnh** — +${pct(v)}% tiền cướp được, giảm ${pct(petThiefFineCut(pet))}% tiền phạt khi trượt`,
        stamina: isEn ? `⚡ **Vigor** — −${pct(v)}% energy on \`/fish\` \`/mine\` \`/chop\``
                      : `⚡ **Bền sức** — giảm ${pct(v)}% năng lượng khi \`/fish\` \`/mine\` \`/chop\``,
        harvest: isEn ? `🌾 **Bounty** — +${pct(v)}% yield, +${pct(v)}% on \`/sell\`, +${pct(v)}% rare-catch upgrade`
                      : `🌾 **Bội thu** — +${pct(v)}% sản lượng, +${pct(v)}% tiền \`/sell\`, +${pct(v)}% cơ hội nâng mẻ cá`,
    };
    return lines[id] || '';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pet')
        .setDescription('Thú cưng của bạn 🐾')
        .addSubcommand(s => s.setName('adopt').setDescription('Nhận nuôi một bé')
            .addStringOption(o => o.setName('species').setDescription('Loài').setRequired(true)
                // CHỈ loài `adoptable`. Loài bậc cao chỉ nở ra từ Trứng nhặt khi cày —
                // để chúng trong danh sách này thì bậc mất sạch ý nghĩa.
                .addChoices(...SPECIES.filter(sp => sp.adoptable).map(sp => ({ name: `${sp.emoji} ${sp.name}`, value: sp.id }))))
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
        .addSubcommand(s => s.setName('ascend').setDescription('Làm lễ thăng bậc độ hiếm cho thú cưng ✨'))
        .addSubcommand(s => s.setName('hatch').setDescription('Ấp trứng nhặt được khi cày để đánh thức loài hiếm 🥚')
            .addStringOption(o => o.setName('egg').setDescription('Chọn quả trứng').setRequired(true)
                .addChoices(
                    { name: '🥚 Trứng Sử Thi', value: 'trung_su_thi' },
                    { name: '🪺 Trứng Huyền Thoại', value: 'trung_huyen_thoai' },
                    { name: '🌟 Trứng Thần Thoại', value: 'trung_than_thoai' }
                )))
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

        // `hatch` CỐ Ý đứng trước `getPet`: trứng dùng được cả khi chưa nuôi con nào
        // (RPC tự tạo pet). Mọi nhánh dưới đây mới cần pet sẵn có.
        if (sub === 'hatch') {
            const egg = interaction.options.getString('egg');
            const r = await db.hatchPetEgg(userId, egg);
            const eggName = await itemName(egg, locale);

            if (!r) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale, description: t(locale, 'commands.pet.err_system') })] });
            }
            if (r.status === 'no_egg') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale, description: t(locale, 'commands.pet.hatch_no_egg', { egg: eggName }) })] });
            }
            if (r.status !== 'ok') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale, description: t(locale, 'commands.pet.err_system') })] });
            }

            const sp = findSpecies(r.species);
            const rar = RARITY[r.rarity];
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
                locale,
                color: rar?.color,
                title: t(locale, 'commands.pet.hatch_title'),
                description: t(locale, 'commands.pet.hatch_success', {
                    egg: eggName,
                    emoji: `${rar?.emoji || ''}${sp?.emoji || '🐾'}`,
                    species: t(locale, `species.${r.species}`) || sp?.name || r.species,
                    rarity: t(locale, `rarity.${r.rarity}`) || r.rarity,
                }),
            })] });
        }

        const pet = await db.getPet(userId);
        if (sub === 'ascend') {
            if (!pet) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale, description: t(locale, 'commands.pet.err_not_owned') })] });
            }
            const r = await db.ascendPet(userId);
            if (!r) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale, description: t(locale, 'commands.pet.err_system') })] });
            }

            if (r.status === 'max_rarity') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale, description: t(locale, 'commands.pet.ascend_max', {
                        rarity: t(locale, `rarity.${r.rarity}`) || r.rarity }) })] });
            }
            if (r.status === 'low_level') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale, description: t(locale, 'commands.pet.ascend_low_level', {
                        next: `${RARITY[r.next]?.emoji || ''} ${t(locale, `rarity.${r.next}`) || r.next}`,
                        level: r.level, need: r.need_level }) })] });
            }
            if (r.status === 'missing_items') {
                // `need` là danh sách các bộ THAY THẾ NHAU -> nối bằng "HOẶC", đừng nối bằng
                // "+" kẻo hứa người chơi phải gom cả hai bộ.
                const sets = (await itemSetNames(r.need, locale)).filter(Boolean);
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale, description: t(locale, 'commands.pet.ascend_missing', {
                        next: `${RARITY[r.next]?.emoji || ''} ${t(locale, `rarity.${r.next}`) || r.next}`,
                        need: sets.join(locale.startsWith('en') ? ' **OR** ' : ' **HOẶC** ') }) })] });
            }
            if (r.status !== 'ok') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale, description: t(locale, 'commands.pet.err_system') })] });
            }

            const rar = RARITY[r.rarity];
            const spent = (await itemSetNames([r.spent], locale))[0] || '';
            return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'success', {
                locale,
                color: rar?.color,
                title: t(locale, 'commands.pet.ascend_title'),
                description: t(locale, 'commands.pet.ascend_success', {
                    name: pet.name || t(locale, `species.${pet.species}`) || findSpecies(pet.species)?.name,
                    from: `${RARITY[r.from]?.emoji || ''} ${t(locale, `rarity.${r.from}`) || r.from}`,
                    to: `${rar?.emoji || ''} **${t(locale, `rarity.${r.rarity}`) || r.rarity}**`,
                    mult: rar ? rar.mult.toFixed(2) : '1.00',
                }) + (spent ? `\n` + t(locale, 'commands.pet.ascend_spent', { items: spent }) : ''),
            })] });
        }

        if (sub === 'view') {
            if (!pet) {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.pet.err_not_owned')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const lvl = petLevel(pet.exp);
            const next = expForLevel(lvl + 1);
            const petName = pet.name || t(locale, `species.${pet.species}`) || findSpecies(pet.species)?.name;
            const d = getPetDisplay(pet, locale);
            const nxt = nextRarity(pet);

            const isEn = locale.startsWith('en');
            const skills = pet.skills || {};
            const fishingLuckLvl = skills.fishing_luck || 0;
            const doubleGemLvl = skills.double_gem || 0;
            const bakeryLvl = skills.bakery_efficiency || 0;

            const skillsText = isEn
                ? `- 🎣 Fishing Luck: Lv.${fishingLuckLvl}/3\n- ⛏️ Double Ores: Lv.${doubleGemLvl}/2\n- 🍰 Bakery Efficiency: Lv.${bakeryLvl}/3`
                : `- 🎣 May mắn Câu cá: Cấp ${fishingLuckLvl}/3\n- ⛏️ Nhân đôi Đá quý: Cấp ${doubleGemLvl}/2\n- 🍰 Hiệu suất Tiệm bánh: Cấp ${bakeryLvl}/3`;

            // Dòng "bậc kế tiếp": nói THẲNG còn thiếu gì. Bản cũ không hé lộ gì về ngưỡng
            // nên người chơi không có lý do nào để cho ăn tiếp.
            let nextLine;
            if (!nxt) {
                nextLine = isEn ? '🌟 **Highest tier reached.**' : '🌟 **Đã đạt bậc cao nhất.**';
            } else {
                const needLvl = Math.max(0, nxt.minLevel - lvl);
                const parts = [];
                if (needLvl > 0) parts.push(isEn ? `${needLvl} more level(s)` : `còn ${needLvl} cấp nữa`);
                if (nxt.ascend) {
                    const sets = await itemSetNames(nxt.ascend, locale);
                    parts.push((isEn ? 'offering: ' : 'lễ vật: ') + sets.join(isEn ? ' OR ' : ' HOẶC '));
                }
                nextLine = `${nxt.emoji} ${t(locale, `rarity.${nxt.key}`) || nxt.key} — ` +
                    (parts.length ? parts.join(isEn ? ' · ' : ' · ') : (isEn ? 'ready! Use `/pet ascend`' : 'đủ điều kiện! Dùng `/pet ascend`'));
            }

            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: `${d.rarity.emoji}${d.emoji}・${petName}`,
                color: d.rarity.color,
                fields: [
                    { name: isEn ? '💠 Tier' : '💠 Bậc', value: `${d.rarity.emoji} **${d.rarityName}** (×${d.rarity.mult.toFixed(2)})`, inline: true },
                    { name: t(locale, 'commands.pet.field_species'), value: `${d.speciesEmoji} ${d.formName}`, inline: true },
                    { name: t(locale, 'commands.pet.field_level'), value: `Lv.${lvl}`, inline: true },
                    { name: t(locale, 'commands.pet.field_exp', { current: pet.exp, next }), value: createWaguriBar(pet.exp, next, 10), inline: false },
                    // Vá P2-3: 6 buff loài có thật nhưng trước đây KHÔNG nơi nào trong Discord nói ra.
                    { name: isEn ? '🐾 Species Power' : '🐾 Năng lực loài', value: describeBuff(pet, locale), inline: false },
                    { name: isEn ? '⬆️ Next Tier' : '⬆️ Bậc kế tiếp', value: nextLine, inline: false },
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
                // Trần FEED_LEVEL_CAP: không trần thì chi phí tăng theo bình phương cấp và
                // mốc bậc cao trở thành bất khả thi (xem chú thích ở config.PET).
                const cost = config.PET.FEED_COST
                    + config.PET.FEED_PER_LEVEL * Math.min(oldLvl, config.PET.FEED_LEVEL_CAP);
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
                const foodName = t(locale, `data.items.${food}.name`) || cfg.name;
                const taken = await db.takeItem(userId, food, 1);
                if (taken === null) {
                    // DB lỗi ≠ hết đồ. Bản cũ báo "cậu không có món này" cho cả hai, nên
                    // Supabase chập chờn là người chơi bị đổ oan là kho rỗng.
                    const embed = buildWaguriEmbed(interaction, 'error', {
                        locale,
                        description: t(locale, 'commands.pet.err_system')
                    });
                    return interaction.editReply({ embeds: [embed] });
                }
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

            // Toàn bộ "kiểm điểm -> kiểm cấp trần -> trừ điểm -> nâng cấp" nằm TRONG một
            // RPC khoá hàng (migration 0109). Lối cũ đọc pet rồi ghi đè cả khối `skills`
            // ở JS: bấm đúp / mở 2 tab / dùng web và bot cùng lúc đều đọc skill_points = 1
            // rồi cùng ghi 0 => 2 cấp kỹ năng cho 1 điểm.
            const r = await db.upgradePetSkill(userId, skillId);
            const isEn = locale.startsWith('en');

            if (r && r.status === 'no_points') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: isEn
                        ? 'Your pet does not have any Skill Points left! Feed it to level up.'
                        : 'Thú cưng của cậu không còn Điểm kỹ năng nào! Hãy cho ăn để lên cấp.',
                })] });
            }
            if (r && r.status === 'max_level') {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: isEn
                        ? `This skill has already reached its maximum level (${r.max})!`
                        : `Kỹ năng này đã đạt cấp tối đa (${r.max})!`,
                })] });
            }
            if (r && (r.status === 'no_pet' || r.status === 'bad_skill')) {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'error', {
                    locale, description: t(locale, 'common.generic_error'),
                })] });
            }

            // RPC là nguồn sự thật cho cấp mới & điểm còn lại -> không tự tính lại ở JS.
            if (!r || r.status !== 'ok') {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    description: t(locale, 'commands.pet.err_system')
                });
                return interaction.editReply({ embeds: [embed] });
            }

            const skillNames = {
                fishing_luck: isEn ? 'Fishing Luck' : 'May mắn Câu cá',
                double_gem: isEn ? 'Double Ores' : 'Nhân đôi Đá quý',
                bakery_efficiency: isEn ? 'Bakery Efficiency' : 'Hiệu suất Tiệm bánh'
            };

            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: isEn ? 'Skill Upgraded!' : 'Nâng cấp kỹ năng thành công!',
                description: isEn
                    ? `Successfully upgraded **${skillNames[skillId]}** to **Level ${r.level}**! Remaining Skill Points: ${r.points_left}.`
                    : `Đã nâng cấp kỹ năng **${skillNames[skillId]}** lên **Cấp ${r.level}**! Điểm kỹ năng còn lại: ${r.points_left}.`
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
