const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const { chatWithWaguri } = require('../../lib/ai');
const config = require('../../config');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { dungDauVao, ghep } = require('../../lib/ai/dauVao');
const { taiAnh } = require('../../lib/ai/taiAnh');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ask')
        .setDescription('Trò chuyện với Waguri 🌸')
        .addStringOption(o => o.setName('message').setDescription('Cậu muốn nói gì với Waguri?').setRequired(true))
        .addAttachmentOption(o => o.setName('anh').setDescription('Gửi kèm một tấm ảnh cho Waguri xem (tuỳ chọn)')),
    async execute(interaction) {
        await interaction.deferReply();
        const goc = interaction.options.getString('message');
        const locale = await getInteractionLanguage(interaction);

        // Dựng đầu vào qua CÙNG một đường với @mention, để hai lối gọi không lệch nhau.
        const dinhKem = interaction.options.getAttachment?.('anh');
        const dv = dungDauVao({
            content: goc,
            attachments: dinhKem ? new Map([['0', dinhKem]]) : new Map(),
            stickers: new Map(),
            author: interaction.user
        });
        const text = ghep(dv.text, dv.nhan);

        // Tải ngay: URL đính kèm Discord có chữ ký hết hạn, không để dành được.
        const anhGui = dv.anh ? await taiAnh(dv.anh) : null;
        const res = await chatWithWaguri(interaction.channelId, interaction.user.id, interaction.user.username, text, locale, anhGui);
        if (!res.ok) {
            // Hết ngân sách CHUNG của cả dự án — không phải lỗi của riêng người này, nên
            // thông điệp cũng không nên đổ cho họ. Waguri nói là mình mệt, không nói "cậu hết lượt".
            if (res.reason === 'quota_global') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'common.ai_quota_global')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            if (res.reason === 'quota') {
                const embed = buildWaguriEmbed(interaction, 'warning', {
                    locale,
                    description: t(locale, 'commands.ask.quota_msg', { cap: res.cap, premium_cap: config.AI.PREMIUM_DAILY })
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                description: t(locale, 'common.retry_later')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        
        // Cộng XP Sổ Sứ Mệnh (30% cơ hội, max 50 XP/ngày)
        if (Math.random() < 0.30) {
            const bpRes = await require('../../lib/battlepass').addAiXp(interaction.user.id);
            if (bpRes && bpRes.success && bpRes.levelUp) {
                await interaction.followUp({
                    content: t(locale, 'commands.daily.bp_levelup', { level: bpRes.newLevel }),
                    flags: MessageFlags.Ephemeral
                }).catch(() => null);
            }
        }

        // allowedMentions rỗng: chặn AI bị "mồi" để @everyone/@here/tag role hàng loạt (prompt injection).
        await interaction.editReply({ content: res.reply.slice(0, 2000), allowedMentions: { parse: [] } });
    },
};
