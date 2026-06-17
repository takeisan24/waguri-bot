const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eco-admin')
        .setDescription('Công cụ quản trị economy (chỉ owner)')
        .addSubcommand(s => s.setName('addmoney').setDescription('Cộng/trừ tiền')
            .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền (âm để trừ)').setRequired(true))
            .addStringOption(o => o.setName('field').setDescription('Ví hay ngân hàng').addChoices({ name: 'Ví', value: 'wallet' }, { name: 'Ngân hàng', value: 'bank' })))
        .addSubcommand(s => s.setName('setmoney').setDescription('Đặt cứng số dư')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('amount').setDescription('Số tiền').setRequired(true).setMinValue(0))
            .addStringOption(o => o.setName('field').setDescription('Ví hay ngân hàng').addChoices({ name: 'Ví', value: 'wallet' }, { name: 'Ngân hàng', value: 'bank' })))
        .addSubcommand(s => s.setName('setenergy').setDescription('Đặt năng lượng')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('value').setDescription('Giá trị').setRequired(true).setMinValue(0)))
        .addSubcommand(s => s.setName('setexp').setDescription('Đặt EXP')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('value').setDescription('Giá trị').setRequired(true).setMinValue(0)))
        .addSubcommand(s => s.setName('giveitem').setDescription('Cấp vật phẩm miễn phí')
            .addUserOption(o => o.setName('user').setDescription('Người nhận').setRequired(true))
            .addStringOption(o => o.setName('item').setDescription('Vật phẩm').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('qty').setDescription('Số lượng (mặc định 1)').setMinValue(1)))
        .addSubcommand(s => s.setName('resetuser').setDescription('Xóa sạch dữ liệu một người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const items = await db.getItems();
        await interaction.respond(items
            .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
            .slice(0, 25)
            .map(i => ({ name: i.name, value: i.id })));
    },

    async execute(interaction) {
        // Chặn người không phải owner
        if (!config.OWNER_IDS.includes(interaction.user.id)) {
            return interaction.reply({ content: 'Lệnh này chỉ dành cho owner thôi nhé~ 🌸', flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();

        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser('user');
        if (!target) return interaction.editReply('Thiếu người chơi.');
        const C = config.CURRENCY;

        if (sub === 'addmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.addMoney(target.id, amount, field);
            return interaction.editReply(ok
                ? `✅ Đã ${amount >= 0 ? 'cộng' : 'trừ'} **${fmt(Math.abs(amount))}** ${C} (${field}) cho <@${target.id}>.`
                : '❌ Thất bại (có thể số dư không đủ để trừ).');
        }
        if (sub === 'setmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.setBalance(target.id, field, amount);
            return interaction.editReply(ok ? `✅ Đặt ${field} của <@${target.id}> = **${fmt(amount)}** ${C}.` : '❌ Thất bại.');
        }
        if (sub === 'setenergy') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setEnergy(target.id, value);
            return interaction.editReply(ok ? `✅ Đặt năng lượng của <@${target.id}> = **${value}**.` : '❌ Thất bại.');
        }
        if (sub === 'setexp') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setExp(target.id, value);
            return interaction.editReply(ok ? `✅ Đặt EXP của <@${target.id}> = **${fmt(value)}**.` : '❌ Thất bại.');
        }
        if (sub === 'giveitem') {
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('qty') || 1;
            const item = await db.getItem(itemId);
            const ok = await db.giveItemAdmin(target.id, itemId, qty);
            return interaction.editReply(ok ? `✅ Đã cấp **${qty}× ${item ? item.name : itemId}** cho <@${target.id}>.` : '❌ Thất bại (item không tồn tại?).');
        }
        if (sub === 'resetuser') {
            const ok = await db.resetUser(target.id);
            return interaction.editReply(ok ? `✅ Đã reset toàn bộ dữ liệu của <@${target.id}>.` : '❌ Thất bại.');
        }
    },
};
