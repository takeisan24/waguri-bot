const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { isOwner } = require('../../lib/owner');
const { setBan } = require('../../lib/bans');

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
        .addSubcommand(s => s.setName('setjob').setDescription('Bổ nhiệm công việc')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addStringOption(o => o.setName('job').setDescription('Nghề nghiệp').setRequired(true).setAutocomplete(true)))
        .addSubcommand(s => s.setName('premium').setDescription('Cấp/gia hạn Premium cho người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))
            .addIntegerOption(o => o.setName('days').setDescription('Số ngày').setRequired(true).setMinValue(1)))
        .addSubcommand(s => s.setName('ban').setDescription('Chặn user dùng bot')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('unban').setDescription('Bỏ chặn user')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true)))
        .addSubcommand(s => s.setName('resetuser').setDescription('Xóa sạch dữ liệu một người chơi')
            .addUserOption(o => o.setName('user').setDescription('Người chơi').setRequired(true))),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused().toLowerCase();
        const sub = interaction.options.getSubcommand();
        if (sub === 'giveitem') {
            const items = await db.getItems();
            await interaction.respond(items
                .filter(i => i.name.toLowerCase().includes(focused) || i.id.includes(focused))
                .slice(0, 25)
                .map(i => ({ name: i.name, value: i.id })));
        } else if (sub === 'setjob') {
            const jobs = await db.getJobs();
            await interaction.respond(jobs
                .filter(j => j.name.toLowerCase().includes(focused) || j.id.includes(focused))
                .slice(0, 25)
                .map(j => ({ name: j.name, value: j.id })));
        }
    },

    async execute(interaction) {
        // Chặn người không phải owner (chủ app tự nhận + OWNER_IDS env)
        if (!await isOwner(interaction.client, interaction.user.id)) {
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
        if (sub === 'setjob') {
            const jobId = interaction.options.getString('job');
            const job = await db.getJob(jobId);
            if (!job) return interaction.editReply('❌ Không tìm thấy công việc này.');
            const ok = await db.setUserJob(target.id, jobId);
            return interaction.editReply(ok ? `✅ Đã bổ nhiệm <@${target.id}> làm **${job.name}**.` : '❌ Thất bại.');
        }
        if (sub === 'ban') {
            const ok = await setBan(target.id, true);
            return interaction.editReply(ok ? `🚫 Đã chặn <@${target.id}> dùng bot.` : '❌ Thất bại.');
        }
        if (sub === 'unban') {
            const ok = await setBan(target.id, false);
            return interaction.editReply(ok ? `✅ Đã bỏ chặn <@${target.id}>.` : '❌ Thất bại.');
        }
        if (sub === 'premium') {
            const days = interaction.options.getInteger('days');
            const until = await db.grantPremium(target.id, days);
            return interaction.editReply(until
                ? `✅ Đã cấp **Premium ${days} ngày** cho <@${target.id}> — hết hạn <t:${Math.floor(new Date(until).getTime() / 1000)}:R>.`
                : '❌ Thất bại.');
        }
        if (sub === 'resetuser') {
            const ok = await db.resetUser(target.id);
            return interaction.editReply(ok ? `✅ Đã reset toàn bộ dữ liệu của <@${target.id}>.` : '❌ Thất bại.');
        }
    },
};
