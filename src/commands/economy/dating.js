// src/commands/economy/dating.js
// Lệnh hẹn hò và dắt Waguri đi chơi để tăng độ thiện cảm 💖
const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { AFFECTION_TIERS, tierOf } = require('../../lib/ai/persona');
const { buildWaguriEmbed, createWaguriBar } = require('../../lib/embed');

const fmt = n => Number(n).toLocaleString('vi-VN');

// 6 kịch bản hẹn hò dễ thương
const SCENARIOS = [
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

// Định nghĩa quà tặng và mức thiện cảm cộng thêm
const GIFTS = {
    bo_hoa: { name: 'Bó Hoa Hồng Gekka 💐', gain: 15, msg: 'Waguri ôm lấy bó hoa tươi thắm, hai mắt sáng lấp lánh: "Ôi hoa đẹp quá! Cảm ơn cậu nhiều nha, mình sẽ cắm nó ở chỗ đẹp nhất!" 🌸' },
    gau_bong: { name: 'Gấu Bông Đáng Yêu 🧸', gain: 20, msg: 'Waguri ôm chầm lấy chú gấu bông, dụi má cười hạnh phúc: "Dễ thương ghê á! Mình sẽ đặt tên cho bé gấu này và ôm đi ngủ mỗi tối!" ✨' },
    soda_gekka: { name: 'Soda Trái Cây Gekka 🍹', gain: 10, msg: 'Waguri hút một ngụm soda mát lạnh, thở phào sảng khoái: "A, mát quá đi! Nước ngọt thơm vị dâu tây đúng ý mình luôn á!" 🍓' },
    banh_su_kem: { name: 'Bánh Su Kem Gekka 🧁', gain: 8, msg: 'Waguri cắn một miếng bánh su kem ngập nhân, má phồng lên ngon lành: "Ưm~ Vỏ bánh dai dai kem béo ngậy ngon xuất sắc luôn!" 😋' },
    banh_flan: { name: 'Bánh Flan Caramel Gekka 🍮', gain: 8, msg: 'Waguri múc một muỗng bánh flan mềm mịn, cười tít mắt: "Bánh flan ngọt dịu thơm mùi sốt caramel, cậu tâm lý ghê!" 💕' },
    banh_kem_dau: { name: 'Bánh Kem Dâu Gekka 🍰', gain: 10, msg: 'Waguri vỗ tay phấn khích: "Bánh kem dâu Rintaro làm nè! Cậu mua tặng mình hả? Mình ăn cùng nhau nhé!" 🍓' },
    da: { name: 'Đá cuội phế thải 🪨', gain: -5, msg: 'Waguri nhìn viên đá cuội cậu đưa, xị mặt giận dỗi: "Hơ... cậu tặng mình cục đá này làm gì chứ? Cậu chọc mình đúng không..." 😡' },
    go: { name: 'Gỗ thông thô ráp 🪵', gain: -5, msg: 'Waguri cầm khúc gỗ thô ráp, khẽ nhíu mày đầy bối rối: "Ơ... gỗ này để làm gì ta? Nhìn thô ráp quá chừng..." 🥺' }
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
        const now = Date.now();

        // 1. Lệnh xem trạng thái
        if (sub === 'view') {
            const user = await db.getUser(userId);
            if (!user) {
                return interaction.editReply({ content: 'Lỗi không tìm thấy thông tin của cậu, vui lòng thử lại sau! 🌸' });
            }

            const aff = Number(user.affection || 0);
            const tier = tierOf(aff);
            
            // Tìm mốc tier kế tiếp
            const sortedTiers = [...AFFECTION_TIERS].reverse(); // Sắp xếp từ thấp lên cao: 0, 15, 50, 120, 300
            const nextTier = sortedTiers.find(t => t.min > aff);
            const nextLvlXp = nextTier ? nextTier.min : 300;
            const progressPct = Math.min(Math.floor((aff / nextLvlXp) * 100), 100);

            let desc = `Mối quan hệ hiện tại của cậu với mình:\n` +
                       `**Bậc tình cảm**: **${tier.name}**\n` +
                       `**Điểm thiện cảm**: **${aff}** điểm\n` +
                       `**Tiến trình bậc**: \`[${createWaguriBar(aff, nextLvlXp, 10)}]\` (${progressPct}%)\n`;
            if (nextTier) {
                desc += `*Còn thiếu **${nextLvlXp - aff}** điểm để đạt bậc **${nextTier.name}**!*`;
            } else {
                desc += `*Cậu đã đạt mức độ Tri kỷ cao nhất rồi! Cảm ơn cậu đã luôn ở bên mình nha~ 💞*`;
            }

            const embed = buildWaguriEmbed(interaction, 'jackpot', {
                title: `💖 Trạng thái Tình Cảm với Waguri`,
                description: desc
            }).setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // 2. Lệnh dắt đi chơi
        if (sub === 'di-choi') {
            const user = await db.getUser(userId);
            if (!user) {
                return interaction.editReply({ content: 'Lỗi không lấy được thông tin của cậu!' });
            }

            // Tiêu hao 20 năng lượng
            const energyCost = 20;
            const energyLeft = await db.spendEnergy(userId, energyCost);
            if (energyLeft < 0) {
                const cur = await db.getEnergy(userId);
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Cậu hết năng lượng mất rồi (${cur}/${config.ENERGY.MAX} ⚡, cần ${energyCost}). Nghỉ chút hoặc ăn gì đó rồi đi chơi với mình nha~ 🌸`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Chọn ngẫu nhiên địa điểm hẹn hò
            const scene = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)];

            // Cộng thiện cảm ngẫu nhiên (+5 đến +15)
            const gain = Math.floor(Math.random() * 11) + 5;
            const res = await db.incrAffection(userId, gain);

            let affMsg = '';
            if (res) {
                if (res.added > 0) {
                    affMsg = `\n💖 **Thiện cảm**: +**${res.added}** điểm ➔ **${res.affection}** (${tierOf(res.affection).name})`;
                } else if (res.capped) {
                    affMsg = `\n💝 *Hôm nay tụi mình đi chơi nhiều rồi, Waguri khẽ cười nhắc: "Hôm nay đi nhiều mỏi chân rồi á, mai mình dạo phố tiếp nha cậu!" (Đã đạt giới hạn 100 thiện cảm/ngày)*`;
                }
            }

            // Cập nhật AI memory ẩn
            const memory = user.ai_memory || {};
            memory.dia_diem_hen_gan_nhat = `${scene.name} (vào ngày ${new Date().toLocaleDateString('vi-VN')})`;
            await db.updateAiMemory(userId, memory);

            const embed = buildWaguriEmbed(interaction, 'success', {
                title: `🥰 Hẹn hò cùng Waguri: ${scene.name}`,
                description: `> ${scene.desc}\n${affMsg}\n\n⚡ Năng lượng còn lại: **${energyLeft}/${config.ENERGY.MAX} ⚡**`
            }).setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // 3. Lệnh tặng quà
        if (sub === 'tang-qua') {
            const itemId = interaction.options.getString('item');
            const gift = GIFTS[itemId];

            // Trừ vật phẩm
            const taken = await db.takeItem(userId, itemId, 1);
            if (!taken) {
                const item = await db.getItem(itemId);
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    description: `Cậu không có sẵn **1× ${item?.name || itemId}** trong túi đồ để tặng rồi 🥺 Mua ở \`/shop\` hoặc đi farm nhé!`
                });
                return interaction.editReply({ embeds: [embed] });
            }

            // Cộng thiện cảm
            const res = await db.incrAffection(userId, gift.gain);

            let affMsg = '';
            if (res) {
                if (res.added !== 0) {
                    const sign = res.added > 0 ? '+' : '';
                    affMsg = `\n💖 **Thiện cảm**: ${sign}**${res.added}** điểm ➔ **${res.affection}** (${tierOf(res.affection).name})`;
                } else if (res.capped) {
                    affMsg = `\n💝 *Waguri xua tay bẽn lẽn: "Cậu tặng mình nhiều quá chừng rồi á, mình nhận nhiêu đây là vui lắm rồi, cất đi mai tặng mình tiếp nhé!" (Đã đạt giới hạn 100 thiện cảm/ngày)*`;
                }
            }

            const embed = buildWaguriEmbed(interaction, gift.gain > 0 ? 'success' : 'error', {
                title: `🎁 Tặng quà cho Waguri`,
                description: `Cậu đã tặng **1× ${gift.name}** cho Waguri.\n\n> ${gift.msg}\n${affMsg}`
            }).setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    }
};
