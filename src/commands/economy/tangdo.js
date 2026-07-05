const { SlashCommandBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tangdo')
        .setDescription('Tặng vật phẩm trong kho cho người khác (mọi loại: đồ ăn, dụng cụ, xe...) 🎁')
        .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
        .addStringOption(o => o.setName('item').setDescription('Vật phẩm muốn tặng').setRequired(true).setAutocomplete(true))
        .addIntegerOption(o => o.setName('quantity').setDescription('Số lượng (mặc định 1)').setMinValue(1)),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const inv = await db.getInventory(interaction.user.id);
        const choices = inv
            .filter(r => (r.items?.name || '').toLowerCase().includes(focused) || r.item_id.includes(focused))
            .slice(0, 25)
            .map(r => ({ name: `${r.items?.name || r.item_id} (x${r.quantity})`, value: r.item_id }));
        await interaction.respond(choices);
    },

    async execute(interaction) {
        await interaction.deferReply();
        const target = interaction.options.getUser('user');
        const itemId = interaction.options.getString('item');
        const qty = interaction.options.getInteger('quantity') || 1;
        const err = (description) => interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'warning', { title: '🎁・Tặng vật phẩm', description })] });

        const isWaguri = target.id === interaction.client.user.id;
        if (!target || (target.bot && !isWaguri)) return err('Cậu muốn tặng cho ai? Gắn @người (không phải bot) nhé~ 🌸');
        if (target.id === interaction.user.id) return err('Tặng cho chính mình thì hơi kỳ á~ 😅');
        if (qty < 1) return err('Số lượng phải lớn hơn 0 nhé~');

        const item = await db.getItem(itemId);
        if (!item) return err('Mình không tìm thấy vật phẩm này~');

        if (isWaguri) {
            // Tặng quà cho Waguri
            const gifts = {
                bo_hoa: { gain: 10, msg: `A, bó hoa thơm ngát quá! Cảm ơn cậu nhiều nha, mình rất thích nó~ 🌸💕` },
                hop_qua: { gain: 25, msg: `Hộp quà bọc đẹp ghê, không biết bên trong có gì ta? Cậu chu đáo quá đi~ 🎁✨` },
                gau_bong: { gain: 50, msg: `Kyaaa! Gấu bông thỏ Waguri đáng yêu xỉu luôn á! Mình sẽ ôm nó đi ngủ mỗi tối. Thương cậu nhất! 🧸💖` }
            };
            const gift = gifts[itemId];
            if (!gift) {
                return err(`Món quà **${item.name}** này hơi kỳ lạ đối với mình... Cậu hãy tặng mình **Bó Hoa Tươi**, **Hộp Quà Gekka** hoặc **Gấu Bông Waguri** nhé! 🌸`);
            }

            const ok = await db.takeItem(interaction.user.id, itemId, qty);
            if (!ok) return err(`Cậu không có đủ **${qty}× ${item.name}** trong kho để tặng mình~`);

            const totalGain = gift.gain * qty;
            const res = await db.incrAffection(interaction.user.id, totalGain);
            const newAff = res ? res.affection : 0;
            const added = res ? res.added : 0;
            const capped = res ? res.capped : false;

            let desc = `${gift.msg}\n\n`;
            if (added > 0) {
                desc += `*Độ thân mật với Waguri tăng **+${added}** → **${newAff}** điểm!*`;
                if (capped) {
                    desc += `\n*(Cậu đã đạt giới hạn thiện cảm hằng ngày (+100 điểm) nên điểm nhận được ít hơn nhé~)*`;
                }
            } else {
                desc += `*Hôm nay cậu đã nhận đủ giới hạn thiện cảm hằng ngày (+100 điểm) rồi nên điểm không tăng thêm nữa nhé~ (Độ thân mật hiện tại: **${newAff}** điểm)*`;
            }

            const embed = buildWaguriEmbed(interaction, 'success', {
                title: '💖・Tặng quà cho Waguri',
                description: desc
            });
            return interaction.editReply({ embeds: [embed] });
        }

        await db.getUser(target.id); // đảm bảo người nhận có hồ sơ (tự tạo nếu chưa)
        const ok = await db.transferItem(interaction.user.id, target.id, itemId, qty);
        if (!ok) return err(`Cậu không có đủ **${qty}× ${item.name}** trong kho để tặng~`);

        const embed = buildWaguriEmbed(interaction, 'success', {
            title: '🎁・Tặng vật phẩm thành công',
            description: `Cậu đã tặng **${qty}× ${item.name}** cho <@${target.id}>. Tử tế và dễ thương ghê~ 🌸`
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
