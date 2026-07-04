const db = require('../database');
const { buildWaguriEmbed } = require('./embed');

const NEWBIE_STEPS = [
    null,
    { name: 'Bước 1: Điểm danh đầu tiên 📅', reward: 1000 },
    { name: 'Bước 2: Chăm chỉ làm việc ⚡', reward: 1500 },
    { name: 'Bước 3: Mua sắm trải nghiệm 🛒', reward: 2000 },
    { name: 'Bước 4: Xin việc chính thức 🧑‍💼', reward: 2500 },
    { name: 'Bước 5: Trải nghiệm may rủi 🪙', reward: 3000 }
];

const fmt = n => Number(n).toLocaleString('vi-VN');

async function handleNewbieQuest(interaction, key, amount = 1) {
    if (!interaction || !interaction.user) return;
    const userId = interaction.user.id;
    try {
        const res = await db.newbieQuestIncr(userId, key, amount);
        if (res && res.claimed) {
            const completedStep = res.step - 1;
            const ns = NEWBIE_STEPS[completedStep];
            if (!ns) return;

            let desc = `🎉 Chúc mừng cậu đã hoàn thành **${ns.name}**!\n` +
                       `🎁 Nhận ngay **+${fmt(ns.reward)} VNĐ** vào ví!`;

            if (res.completed) {
                desc += `\n\n🏆 **[HOÀN THÀNH CHUỖI TÂN THỦ]**\n` +
                        `Cậu thật xuất sắc! Nhận thêm **+${fmt(res.bonus)} VNĐ** và Danh hiệu: 🏷️ **Tân Thủ Ngọt Ngào**! 🌸💖`;
            } else {
                const nextNs = NEWBIE_STEPS[res.step];
                if (nextNs) {
                    desc += `\n\n👉 **Nhiệm vụ tiếp theo:** *${nextNs.name}* (Gõ \`/quest\` để xem chi tiết)`;
                }
            }

            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '🔰・Nhiệm vụ tân thủ',
                description: desc
            });

            await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    } catch (err) {
        console.error('[NEWBIE ERROR] handleNewbieQuest:', err);
    }
}

module.exports = { handleNewbieQuest };
