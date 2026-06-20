const { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { isOwner } = require('../../lib/owner');
const { setBan } = require('../../lib/bans');
const { buildWaguriEmbed } = require('../../lib/embed');

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
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Lệnh này chỉ dành cho owner thôi nhé~ 🌸'
            });
            return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
        await interaction.deferReply();

        const sub = interaction.options.getSubcommand();
        const target = interaction.options.getUser('user');
        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                description: 'Thiếu người chơi.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        const C = config.CURRENCY;

        if (sub === 'addmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.addMoney(target.id, amount, field);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok
                    ? `✅ Đã ${amount >= 0 ? 'cộng' : 'trừ'} **${fmt(Math.abs(amount))}** ${C} (${field}) cho <@${target.id}>.`
                    : '❌ Thất bại (có thể số dư không đủ để trừ).'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setmoney') {
            const amount = interaction.options.getInteger('amount');
            const field = interaction.options.getString('field') || 'wallet';
            const ok = await db.setBalance(target.id, field, amount);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `✅ Đặt ${field} của <@${target.id}> = **${fmt(amount)}** ${C}.` : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setenergy') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setEnergy(target.id, value);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `✅ Đặt năng lượng của <@${target.id}> = **${value}**.` : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setexp') {
            const value = interaction.options.getInteger('value');
            const ok = await db.setExp(target.id, value);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `✅ Đặt EXP của <@${target.id}> = **${fmt(value)}**.` : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'giveitem') {
            const itemId = interaction.options.getString('item');
            const qty = interaction.options.getInteger('qty') || 1;
            const item = await db.getItem(itemId);
            const ok = await db.giveItemAdmin(target.id, itemId, qty);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `✅ Đã cấp **${qty}× ${item ? item.name : itemId}** cho <@${target.id}>.` : '❌ Thất bại (item không tồn tại?).'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'setjob') {
            const jobId = interaction.options.getString('job');
            const job = await db.getJob(jobId);
            if (!job) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    description: '❌ Không tìm thấy công việc này.'
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const ok = await db.setUserJob(target.id, jobId);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `✅ Đã bổ nhiệm <@${target.id}> làm **${job.name}**.` : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'ban') {
            const ok = await setBan(target.id, true);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `🚫 Đã chặn <@${target.id}> dùng bot.` : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'unban') {
            const ok = await setBan(target.id, false);
            const embed = buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                description: ok ? `✅ Đã bỏ chặn <@${target.id}>.` : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'premium') {
            const days = interaction.options.getInteger('days');
            const until = await db.grantPremium(target.id, days);
            const embed = buildWaguriEmbed(interaction, until ? 'success' : 'error', {
                description: until
                    ? `✅ Đã cấp **Premium ${days} ngày** cho <@${target.id}> — hết hạn <t:${Math.floor(new Date(until).getTime() / 1000)}:R>.`
                    : '❌ Thất bại.'
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (sub === 'resetuser') {
            // Hành động hủy diệt -> bắt buộc xác nhận để tránh gõ nhầm
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reset_yes').setLabel('Xóa sạch').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('reset_no').setLabel('Hủy').setStyle(ButtonStyle.Secondary));
            const warn = buildWaguriEmbed(interaction, 'warning', {
                description: `⚠️ Sắp **XÓA SẠCH** toàn bộ dữ liệu của <@${target.id}> — không thể hoàn tác. Xác nhận? (20s)`
            });
            const msg = await interaction.editReply({ embeds: [warn], components: [confirmRow] });
            try {
                const btn = await msg.awaitMessageComponent({
                    componentType: ComponentType.Button, time: 20000,
                    filter: i => i.user.id === interaction.user.id,
                });
                if (btn.customId === 'reset_no') {
                    return btn.update({ embeds: [buildWaguriEmbed(interaction, 'info', { description: 'Đã hủy, không xóa gì cả~ 🌸' })], components: [] });
                }
                const ok = await db.resetUser(target.id);
                return btn.update({ embeds: [buildWaguriEmbed(interaction, ok ? 'success' : 'error', {
                    description: ok ? `✅ Đã reset toàn bộ dữ liệu của <@${target.id}>.` : '❌ Thất bại.'
                })], components: [] });
            } catch {
                return interaction.editReply({ embeds: [buildWaguriEmbed(interaction, 'info', { description: 'Hết giờ xác nhận, không xóa gì cả~ 🌸' })], components: [] }).catch(() => {});
            }
        }
    },
};
