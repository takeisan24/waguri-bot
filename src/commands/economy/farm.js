const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const plant = require('../../lib/plant');
const config = require('../../config');
const db = require('../../database.js');
const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('farm')
        .setNameLocalizations({
            vi: 'trongcay'
        })
        .setDescription('Vườn nông sản Gekka 🌱 — mua giống, tưới nước, thu hoạch trái cây & lúa mì')
        .setDescriptionLocalizations({
            vi: 'Vườn nông sản Gekka 🌱 — mua giống, tưới nước, thu hoạch trái cây & lúa mì',
            'en-US': 'Gekka Farm 🌱 — plant seeds, water, harvest crops & fruits for bakery',
            'en-GB': 'Gekka Farm 🌱 — plant seeds, water, harvest crops & fruits for bakery'
        })
        .addSubcommand(s => s.setName('info').setDescription('Xem tình trạng cây của cậu'))
        .addSubcommand(s => s.setName('muagiong').setDescription('Mua giống & trồng cây (500)'))
        .addSubcommand(s => s.setName('tuoi').setDescription('Tưới nước (hoặc tưới hộ cây người khác)')
            .addUserOption(o => o.setName('user').setDescription('Tưới hộ cây của ai (bỏ trống = cây của cậu)')))
        .addSubcommand(s => s.setName('bonphan').setDescription('Bón phân để cây thêm 1 nước ngay (200)'))
        .addSubcommand(s => s.setName('thuhoach').setDescription('Thu hoạch cây trưởng thành (nhận trái/hoa)'))
        .addSubcommand(s => s.setName('hoisinh').setDescription('Hồi sinh cây đã chết (1.000)'))
        .addSubcommand(s => s.setName('phacay').setDescription('Phá cây hiện tại để trồng cây mới'))
        .addSubcommand(s => s.setName('trom').setDescription('Trộm cây trưởng thành của người khác (rủi ro!)')
            .addUserOption(o => o.setName('user').setDescription('Mục tiêu').setRequired(true)))
        .addSubcommand(s => s.setName('box').setDescription('Mở Plantbox may mắn (600)')
            .addUserOption(o => o.setName('user').setDescription('Tặng Plantbox cho ai (bỏ trống = cho mình)'))),

    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const isEn = locale?.startsWith('en');
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const target = interaction.options.getUser('user');

        let r;
        switch (sub) {
            case 'info': r = await plant.plantStatus(userId, locale); break;
            case 'muagiong': r = await plant.buyPlant(userId, locale); break;
            case 'tuoi': r = target ? await plant.waterHelp(userId, target, locale) : await plant.waterPlant(userId, locale); break;
            case 'bonphan': r = await plant.fertilize(userId, locale); break;
            case 'thuhoach': r = await plant.harvest(userId, locale); break;
            case 'hoisinh': r = await plant.revivePlant(userId, locale); break;
            case 'phacay': r = await plant.destroyPlant(userId, locale); break;
            case 'trom': r = await plant.stealPlant(userId, target, interaction.guildId, locale); break;
            case 'box': r = await plant.plantBox(userId, target, locale); break;
            default: r = { type: 'error', title: t(locale, 'plant.title'), description: t(locale, 'common.invalid_subcommand') };
        }

        const embed = buildWaguriEmbed(interaction, r.type, {
            locale,
            title: `${config.CORE_THEMES.FARM.EMOJI} ` + (r.title || 'Vườn Nông Sản Gekka'),
            description: r.description
        }).setColor(config.CORE_THEMES.FARM.COLOR);

        // Nút bấm 1-chạm chỉ hiển thị khi xem /farm info để thao tác nhanh
        if (sub === 'info') {
            const p = await db.getPlant(userId);
            const buttons = [];

            if (!p) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('farm_btn_buy')
                        .setLabel(isEn ? '🌱 Plant Seed (500)' : '🌱 Mua Giống Trồng Cây (500)')
                        .setStyle(ButtonStyle.Success)
                );
            } else if (p.stage === 'mature') {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('farm_btn_harvest')
                        .setLabel(isEn ? '🧺 Harvest Crop' : '🧺 Thu Hoạch Ngay')
                        .setStyle(ButtonStyle.Success)
                );
            } else {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId('farm_btn_water')
                        .setLabel(isEn ? '💧 Water Plant' : '💧 Tưới Nước')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('farm_btn_fertilize')
                        .setLabel(isEn ? '🌿 Fertilize (200)' : '🌿 Bón Phân (200)')
                        .setStyle(ButtonStyle.Secondary)
                );
            }

            if (buttons.length > 0) {
                const row = new ActionRowBuilder().addComponents(buttons);
                const msg = await interaction.editReply({ embeds: [embed], components: [row] });

                // Collector an toàn: TTL 60s, tự hủy để triệt tiêu 100% rủi ro Memory Leak
                const collector = msg.createMessageComponentCollector({
                    componentType: ComponentType.Button,
                    time: 60_000,
                    max: 3
                });

                collector.on('collect', async i => {
                    if (i.user.id !== userId) {
                        return i.reply({
                            content: isEn ? 'This is not your farm!' : 'Đây là vườn nông sản của người khác nhen! 🌸',
                            ephemeral: true
                        });
                    }

                    await i.deferUpdate();
                    let actRes;
                    if (i.customId === 'farm_btn_buy') actRes = await plant.buyPlant(userId, locale);
                    else if (i.customId === 'farm_btn_water') actRes = await plant.waterPlant(userId, locale);
                    else if (i.customId === 'farm_btn_harvest') actRes = await plant.harvest(userId, locale);
                    else if (i.customId === 'farm_btn_fertilize') actRes = await plant.fertilize(userId, locale);

                    const updatedEmbed = buildWaguriEmbed(interaction, actRes.type, {
                        locale,
                        title: `${config.CORE_THEMES.FARM.EMOJI} ` + (actRes.title || 'Vườn Nông Sản Gekka'),
                        description: actRes.description
                    }).setColor(config.CORE_THEMES.FARM.COLOR);

                    await interaction.editReply({ embeds: [updatedEmbed], components: [] });
                    collector.stop('acted');
                });

                collector.on('end', async (_, reason) => {
                    if (reason !== 'acted') {
                        const disabledRow = new ActionRowBuilder().addComponents(
                            buttons.map(b => ButtonBuilder.from(b).setDisabled(true))
                        );
                        await interaction.editReply({ components: [disabledRow] }).catch(() => {});
                    }
                });

                return;
            }
        }

        await interaction.editReply({ embeds: [embed] });
    },
};
