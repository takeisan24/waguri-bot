const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

// Chi phí sửa = 15% giá mua (làm tròn). Gồm cả công cụ khai thác lẫn xe cộ.
const REPAIR_COSTS = {
    can_cau: 150,
    riu_sat: 225,
    cuoc_sat: 225,
    // Xe cộ (15% giá): đi làm trừ độ bền, hỏng phải sửa thay vì mua lại từ đầu.
    xe_dap: 120,
    xe_wave: 450,
    xe_vespa: 2250,
    o_to_vinfast: 7500,
    sh: 12000,
    o_to_cu: 22500,
    mercedes: 75000,
};

const TOOL_NAMES = {
    can_cau: 'Cần câu cá 🎣',
    riu_sat: 'Rìu sắt 🪓',
    cuoc_sat: 'Cuốc sắt ⛏️',
    xe_dap: 'Xe Đạp Mini Nhật Bản 🚲',
    xe_wave: 'Xe Honda Wave 🛵',
    xe_vespa: 'Xe Vespa Hồng Cute 🛵',
    o_to_vinfast: 'Ô tô VinFast VF3 🚗',
    sh: 'Xe Honda SH Mode 🛵',
    o_to_cu: 'Ô Tô Cũ Của Rintaro 🚗',
    mercedes: 'Xe Rolls-Royce Kikyo 🚗',
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('repair')
        .setDescription('Sửa chữa công cụ khai thác (chi phí 15% giá mua)')
        .addStringOption(o => o.setName('tool').setDescription('Chọn công cụ muốn sửa').setRequired(true)
            .addChoices(
                { name: 'Cần câu cá 🎣 (150 VNĐ)', value: 'can_cau' },
                { name: 'Rìu sắt 🪓 (225 VNĐ)', value: 'riu_sat' },
                { name: 'Cuốc sắt ⛏️ (225 VNĐ)', value: 'cuoc_sat' },
                { name: 'Xe Đạp Mini 🚲 (120 VNĐ)', value: 'xe_dap' },
                { name: 'Xe Honda Wave 🛵 (450 VNĐ)', value: 'xe_wave' },
                { name: 'Xe Vespa Hồng 🛵 (2.250 VNĐ)', value: 'xe_vespa' },
                { name: 'Ô tô VinFast VF3 🚗 (7.500 VNĐ)', value: 'o_to_vinfast' },
                { name: 'Xe Honda SH Mode 🛵 (12.000 VNĐ)', value: 'sh' },
                { name: 'Ô Tô Cũ Của Rintaro 🚗 (22.500 VNĐ)', value: 'o_to_cu' },
                { name: 'Xe Rolls-Royce Kikyo 🚗 (75.000 VNĐ)', value: 'mercedes' }
            )),

    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const userId = interaction.user.id;
        const toolId = interaction.options.getString('tool');
        const cost = REPAIR_COSTS[toolId];

        const r = await db.repairTool(userId, toolId, cost);
        const toolName = t(locale, `items.${toolId}.name`) || TOOL_NAMES[toolId] || toolId;

        if (r === 'no_tool') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.repair.embed_title_warning'),
                description: t(locale, 'commands.repair.err_no_tool', { tool: toolName })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (r === 'already_repaired') {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.repair.embed_title_warning'),
                description: t(locale, 'commands.repair.err_already_healthy', { tool: toolName })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (r === 'insufficient_funds') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.repair.embed_title_warning'),
                description: t(locale, 'commands.repair.err_poor', { cost: fmt(cost, locale), currency: config.CURRENCY })
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (r !== 'ok') {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.repair.embed_title_warning'),
                description: t(locale, 'commands.repair.err_system')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const u = await db.getUser(userId);

        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.repair.success_title'),
            description: t(locale, 'commands.repair.success_desc', { cost: fmt(cost, locale), currency: config.CURRENCY, tool: toolName }),
            fields: [
                { name: t(locale, 'commands.repair.field_wallet'), value: `**${fmt(u?.wallet || 0, locale)}** ${config.CURRENCY}`, inline: true }
            ]
        });

        await interaction.editReply({ embeds: [embed] });
    },
};
