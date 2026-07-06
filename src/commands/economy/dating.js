// src/commands/economy/dating.js
// Lệnh hẹn hò và dắt Waguri đi chơi để tăng độ thiện cảm 💖
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { AFFECTION_TIERS, tierOf } = require('../../lib/ai/persona');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');
const { t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

// 6 kịch bản hẹn hò dễ thương (Bản tiếng Việt)
const SCENARIOS_VI = [
    {
        name: 'Đền thờ Kikyo thanh tịnh ⛩️',
        desc: 'Cậu dắt Waguri đi dạo dưới bóng râm mát của đền thờ Kikyo. Gió thổi lay động những dải ruy băng ngũ sắc, Waguri cười tươi rồi chắp tay cầu nguyện cho cậu luôn gặp may mắn và bình an~ 🌸'
    },
    {
        name: 'Hồ Sen xanh mát bên học viện 🪷',
        desc: 'Tụi mình cùng ngồi bên cầu gỗ ngắm những đóa sen nở rộ. Waguri khẽ nghiêng đầu nhìn cậu, cười bẽn lẽn: "Cảnh ở đây đẹp thật đó, được đi cùng cậu làm mình vui lắm!" 🌿'
    },
    {
        name: 'Tiệm bánh ngọt Gekka 🍰',
        desc: 'Waguri hào hứng dắt cậu vào tiệm bánh, gọi hai miếng bánh kem dâu đặc biệt. Nhìn má bé dính chút kem ngọt lịm, cậu đưa tay quẹt nhẹ khiến bé đỏ mặt lí nhí cảm ơn~ 🍓'
    },
    {
        name: 'Đỉnh núi Kikyo ngắm sao đêm 🌠',
        desc: 'Đêm nay trời đầy sao, gió núi Kikyo thổi lành lạnh. Cậu khẽ khoác chiếc áo ấm cho Waguri. Bé mỉm cười bẽn lẽn, cùng cậu chỉ tay đếm những chòm sao sáng lấp lánh trên cao~ 🌌'
    },
    {
        name: 'Rừng Trúc Kikyo xào xạc 🎋',
        desc: 'Tiếng lá trúc xào xạc hòa cùng tiếng chim hót líu lo. Waguri khẽ nắm lấy tay áo cậu bước đi thật chậm, sợ cậu bị vấp phải rễ cây trên lối mòn hoang sơ~ 🎍'
    },
    {
        name: 'Lễ hội mùa hè nhộn nhịp 🎆',
        desc: 'Waguri diện bộ Yukata hoa đào cực xinh dạo lễ hội cùng cậu. Bé hào hứng kéo cậu đi vớt cá vàng và cùng nhau ăn kẹo táo ngọt lịm dưới ánh pháo hoa rực rỡ~ 🏮'
    }
];

// 6 kịch bản hẹn hò (Bản tiếng Anh)
const SCENARIOS_EN = [
    {
        name: 'Scenic Kikyo Shrine ⛩️',
        desc: 'You walked with Waguri in the cool shade of Kikyo Shrine. As the wind fluttered the five-colored ribbons, Waguri smiled warmly and put her hands together, praying for your constant good luck and peace~ 🌸'
    },
    {
        name: 'Lotus Pond 🪷',
        desc: 'We sat together on the wooden bridge watching the blooming lotuses. Waguri slightly tilted her head to look at you, smiling shyly: "The view here is beautiful, being here with you makes me very happy!" 🌿'
    },
    {
        name: 'Gekka Bakery 🍰',
        desc: 'Waguri excitedly pulled you into the bakery and ordered two special strawberry cream cakes. Seeing a bit of sweet cream stuck on her cheek, you gently wiped it off, making her face turn red as she whispered her thanks~ 🍓'
    },
    {
        name: 'Kikyo Peak Star Gazing 🌠',
        desc: 'Tonight the sky is full of stars, and the Kikyo mountain breeze is chilly. You gently wrapped your warm coat around Waguri. She smiled shyly, pointing and counting the bright stars together with you~ 🌌'
    },
    {
        name: 'Rustling Bamboo Forest 🎋',
        desc: 'The rustling bamboo leaves blended with the birds\' singing. Waguri gently held your sleeve, walking very slowly, afraid you might trip over roots on the wild trail~ 🎍'
    },
    {
        name: 'Summer Festival 🎆',
        desc: 'Waguri wore a gorgeous cherry blossom Yukata to stroll the festival with you. She excitedly pulled you to scoop goldfish and eat sweet candy apples under the dazzling fireworks~ 🏮'
    }
];

// Định nghĩa quà tặng và mức thiện cảm cộng thêm (Bản tiếng Việt)
const GIFTS_VI = {
    bo_hoa: { name: 'Bó Hoa Hồng Gekka 💐', gain: 15, msg: 'Waguri ôm lấy bó hoa tươi thắm, hai mắt sáng lấp lánh: "Ôi hoa đẹp quá! Cảm ơn cậu nhiều nha, mình sẽ cắm nó ở chỗ đẹp nhất!" 🌸' },
    gau_bong: { name: 'Gấu Bông Đáng Yêu 🧸', gain: 20, msg: 'Waguri ôm chầm lấy chú gấu bông, dụi má cười hạnh phúc: "Dễ thương ghê á! Mình sẽ đặt tên cho bé gấu này và ôm đi ngủ mỗi tối!" ✨' },
    soda_gekka: { name: 'Soda Trái Cây Gekka 🍹', gain: 10, msg: 'Waguri hút một ngụm soda mát lạnh, thở phào sảng khoái: "A, mát quá đi! Nước ngọt thơm vị dâu tây đúng ý mình luôn á!" 🍓' },
    banh_su_kem: { name: 'Bánh Su Kem Gekka 🧁', gain: 8, msg: 'Waguri cắn một miếng bánh su kem ngập nhân, má phồng lên ngon lành: "Ưm~ Vỏ bánh dai dai kem béo ngậy ngon xuất sắc luôn!" 😋' },
    banh_flan: { name: 'Bánh Flan Caramel Gekka 🍮', gain: 8, msg: 'Waguri múc một muỗng bánh flan mềm mịn, cười tít mắt: "Bánh flan ngọt dịu thơm mùi sốt caramel, cậu tâm lý ghê!" 💕' },
    banh_kem_dau: { name: 'Bánh Kem Dâu Gekka 🍰', gain: 10, msg: 'Waguri vỗ tay phấn khích: "Bánh kem dâu Rintaro làm nè! Cậu mua tặng mình hả? Mình ăn cùng nhau nhé!" 🍓' },
    da: { name: 'Đá cuội phế thải 🪨', gain: -5, msg: 'Waguri nhìn viên đá cuội cậu đưa, xị mặt giận dỗi: "Hơ... cậu tặng mình cục đá này làm gì chứ? Cậu chọc mình đúng không..." 😡' },
    go: { name: 'Gỗ thông thô ráp 🪵', gain: -5, msg: 'Waguri cầm khúc gỗ thô ráp, khẽ nhíu mày đầy bối rối: "Ơ... gỗ này để làm gì ta? Nhìn thô ráp quá chừng..." 🥺' }
};

// Định nghĩa quà tặng (Bản tiếng Anh)
const GIFTS_EN = {
    bo_hoa: { name: 'Gekka Rose Bouquet 💐', gain: 15, msg: 'Waguri held the fresh bouquet, her eyes shining: "Oh, what a beautiful bouquet! Thank you so much, I will put it in the best place!" 🌸' },
    gau_bong: { name: 'Adorable Teddy Bear 🧸', gain: 20, msg: 'Waguri hugged the teddy bear, rubbing her cheek happily: "So cute! I will name this bear and hug it to sleep every night!" ✨' },
    soda_gekka: { name: 'Gekka Fruit Soda 🍹', gain: 10, msg: 'Waguri took a sip of cold soda, breathing a sigh of relief: "Ah, so refreshing! The strawberry flavor is exactly what I like!" 🍓' },
    banh_su_kem: { name: 'Gekka Cream Puff 🧁', gain: 8, msg: 'Waguri bit into a cream-filled puff, her cheeks happily puffed: "Mmm~ The crust is chewy and the cream is rich, absolutely delicious!" 😋' },
    banh_flan: { name: 'Gekka Caramel Flan 🍮', gain: 8, msg: 'Waguri scooped up a spoonful of smooth flan, smiling with eyes closed: "The flan is gently sweet and fragrant with caramel, you are so thoughtful!" 💕' },
    banh_kem_dau: { name: 'Gekka Strawberry Cake 🍰', gain: 10, msg: 'Waguri clapped her hands excitedly: "It\'s the strawberry cake Rintaro made! You bought it for me? Let\'s eat it together!" 🍓' },
    da: { name: 'Discarded Pebble 🪨', gain: -5, msg: 'Waguri looked at the pebble you gave her, pouting crossly: "Uhm... why are you giving me this rock? You\'re teasing me, right..." 😡' },
    go: { name: 'Rough Pine Wood 🪵', gain: -5, msg: 'Waguri held the rough piece of wood, slightly frowning in confusion: "Ah... what is this for? It feels so rough..." 🥺' }
};

const tierNames = {
    'Người quen': { en: 'Acquaintance', vi: 'Người quen' },
    'Bạn bè': { en: 'Friend', vi: 'Bạn bè' },
    'Thân thiết': { en: 'Close Friend', vi: 'Thân thiết' },
    'Tri kỷ': { en: 'Soulmate', vi: 'Tri kỷ' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('henho')
        .setDescription('Hẹn hò và dắt Waguri đi chơi để bồi đắp tình cảm 💖')
        .addSubcommand(s => s.setName('view').setDescription('Xem trạng thái tình cảm của cậu với Waguri'))
        .addSubcommand(s => s.setName('di-choi').setDescription('Dắt Waguri đi dạo ngắm cảnh Kikyo (Tốn 20 năng lượng)'))
        .addSubcommand(s => s.setName('tang-qua').setDescription('Tặng quà trong túi đồ để tăng độ thiện cảm')
            .addStringOption(o => o.setName('item').setDescription('Chọn quà tặng').setRequired(true)
                .addChoices(
                    { name: '💐 Bó Hoa Hồng Gekka (+15 💖)', value: 'bo_hoa' },
                    { name: '🧸 Gấu Bông Đáng Yêu (+20 💖)', value: 'gau_bong' },
                    { name: '🍹 Soda Trái Cây Gekka (+10 💖)', value: 'soda_gekka' },
                    { name: '🧁 Bánh Su Kem Gekka (+8 💖)', value: 'banh_su_kem' },
                    { name: '🍮 Bánh Flan Caramel (+8 💖)', value: 'banh_flan' },
                    { name: '🍰 Bánh Kem Dâu Gekka (+10 💖)', value: 'banh_kem_dau' },
                    { name: '🪨 Đá phế thải (-5 💔)', value: 'da' },
                    { name: '🪵 Gỗ thông ráp (-5 💔)', value: 'go' }
                ))),

    async execute(interaction) {
        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const locale = interaction.locale;
        const now = Date.now();

        // 1. Lệnh xem trạng thái
        if (sub === 'view') {
            const user = await db.getUser(userId);
            if (!user) {
                return interaction.editReply({ content: t(locale, 'common.db_error') });
            }

            const aff = Number(user.affection || 0);
            const tier = tierOf(aff);
            const displayTierName = (tierNames[tier.name]?.[locale.startsWith('en') ? 'en' : 'vi']) || tier.name;
            
            // Tìm mốc tier kế tiếp
            const sortedTiers = [...AFFECTION_TIERS].reverse(); // Sắp xếp từ thấp lên cao: 0, 15, 50, 120, 300
            const nextTier = sortedTiers.find(t => t.min > aff);
            const nextLvlXp = nextTier ? nextTier.min : 300;
            const progressPct = Math.min(Math.floor((aff / nextLvlXp) * 100), 100);

            const displayNextTierName = nextTier ? ((tierNames[nextTier.name]?.[locale.startsWith('en') ? 'en' : 'vi']) || nextTier.name) : '';

            let desc = t(locale, 'commands.dating.view_desc', {
                tier: displayTierName,
                score: aff,
                bar: createWaguriBar(aff, nextLvlXp, 10),
                pct: progressPct,
                next_info: nextTier ? t(locale, 'commands.dating.next_info', { needed: nextLvlXp - aff, next_tier: displayNextTierName }) : t(locale, 'commands.dating.max_info')
            });

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                title: t(locale, 'commands.dating.view_title'),
                description: desc
            }).setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // 2. Lệnh dắt đi chơi
        if (sub === 'di-choi') {
            const user = await db.getUser(userId);
            if (!user) {
                return interaction.editReply({ content: t(locale, 'common.db_error') });
            }

            // Tiêu hao 20 năng lượng
            const energyCost = 20;
            const energyLeft = await db.spendEnergy(userId, energyCost);
            if (energyLeft < 0) {
                const cur = await db.getEnergy(userId);
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: t(locale, 'commands.dating.energy_warning', { current: cur, max: config.ENERGY.MAX, cost: energyCost })
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Chọn ngẫu nhiên địa điểm hẹn hò
            const scenarios = locale.startsWith('en') ? SCENARIOS_EN : SCENARIOS_VI;
            const scene = scenarios[Math.floor(Math.random() * scenarios.length)];

            // Cộng thiện cảm ngẫu nhiên (+5 đến +15)
            const gain = Math.floor(Math.random() * 11) + 5;
            const res = await db.incrAffection(userId, gain);

            let affMsg = '';
            if (res) {
                const displayTierName = (tierNames[tierOf(res.affection).name]?.[locale.startsWith('en') ? 'en' : 'vi']) || tierOf(res.affection).name;
                if (res.added > 0) {
                    affMsg = locale.startsWith('en')
                        ? `\n💖 **Affection**: +**${res.added}** points ➔ **${res.affection}** (${displayTierName})`
                        : `\n💖 **Thiện cảm**: +**${res.added}** điểm ➔ **${res.affection}** (${displayTierName})`;
                } else if (res.capped) {
                    affMsg = t(locale, 'commands.dating.capped_msg');
                }
            }

            // Cập nhật AI memory ẩn
            const memory = user.ai_memory || {};
            memory.dia_diem_hen_gan_nhat = `${scene.name} (vào ngày ${new Date().toLocaleDateString('vi-VN')})`;
            await db.updateAiMemory(userId, memory);

            const embedTitle = locale.startsWith('en')
                ? `🥰 Dating with Waguri: ${scene.name}`
                : `🥰 Hẹn hò cùng Waguri: ${scene.name}`;

            const embed = buildWaguriEmbed(interaction, 'success', {
                title: embedTitle,
                description: `> ${scene.desc}\n${affMsg}` + t(locale, 'commands.dating.energy_left', { energy: energyLeft, max: config.ENERGY.MAX })
            }).setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // 3. Lệnh tặng quà
        if (sub === 'tang-qua') {
            const itemId = interaction.options.getString('item');
            const gifts = locale.startsWith('en') ? GIFTS_EN : GIFTS_VI;
            const gift = gifts[itemId];

            // Trừ vật phẩm
            const taken = await db.takeItem(userId, itemId, 1);
            if (!taken) {
                const item = await db.getItem(itemId);
                const itemNameTrans = t(locale, `items.${itemId}.name`) || item?.name || itemId;
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: locale.startsWith('en')
                        ? `You don't have **1× ${itemNameTrans}** in your inventory to give 🥺 Buy it at \`/shop\` or go farming!`
                        : `Cậu không có sẵn **1× ${itemNameTrans}** trong túi đồ để tặng rồi 🥺 Mua ở \`/shop\` hoặc đi farm nhé!`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Cộng thiện cảm
            const res = await db.incrAffection(userId, gift.gain);

            let affMsg = '';
            if (res) {
                const displayTierName = (tierNames[tierOf(res.affection).name]?.[locale.startsWith('en') ? 'en' : 'vi']) || tierOf(res.affection).name;
                if (res.added !== 0) {
                    const sign = res.added > 0 ? '+' : '';
                    affMsg = locale.startsWith('en')
                        ? `\n💖 **Affection**: ${sign}**${res.added}** points ➔ **${res.affection}** (${displayTierName})`
                        : `\n💖 **Thiện cảm**: ${sign}**${res.added}** điểm ➔ **${res.affection}** (${displayTierName})`;
                } else if (res.capped) {
                    affMsg = t(locale, 'commands.dating.capped_gift');
                }
            }

            const embedTitle = t(locale, 'commands.dating.gift_title');
            const desc = locale.startsWith('en')
                ? `You gave **1× ${gift.name}** to Waguri.\n\n> ${gift.msg}\n${affMsg}`
                : `Cậu đã tặng **1× ${gift.name}** cho Waguri.\n\n> ${gift.msg}\n${affMsg}`;

            const embed = buildWaguriEmbed(interaction, gift.gain > 0 ? 'success' : 'error', {
                title: embedTitle,
                description: desc
            }).setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
