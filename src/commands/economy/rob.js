const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { pvpEnabled } = require('../../lib/guildflags');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Cướp tiền trong ví người khác (rủi ro cao!)')
        .addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        await interaction.deferReply();
        const robberId = interaction.user.id;
        const target = interaction.options.getUser('target');

        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.rob.embed_title_warning'),
                description: t(locale, 'commands.rob.err_target_missing')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.bot) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.rob.embed_title_warning'),
                description: t(locale, 'commands.rob.err_bot')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.id === robberId) {
            const embed = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.rob.embed_title_warning'),
                description: t(locale, 'commands.rob.err_self')
            });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!await pvpEnabled(interaction.guildId || interaction.guild?.id)) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.rob.embed_title_warning'),
                description: t(locale, 'commands.rob.err_pvp_disabled')
            });
            return interaction.editReply({ embeds: [embed] });
        }

        const tgt = await db.getUser(target.id);
        if (!tgt || Number(tgt.wallet) < config.ROB.MIN_TARGET_WALLET) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.rob.embed_title_warning'),
                description: t(locale, 'commands.rob.err_target_poor', { target: target.id })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Kiểm tra xem mục tiêu có nuôi Cún bảo vệ không (Level >= 5)
        let dogBuff = false;
        let targetPetName = '';
        const targetPet = await db.getPet(target.id);
        if (targetPet && targetPet.species === 'cun') {
            const { petLevel } = require('../../data/pets');
            const dogLvl = petLevel(targetPet.exp);
            if (dogLvl >= 5) {
                dogBuff = true;
                targetPetName = targetPet.name || t(locale, 'species.cun') || 'Cún con';
            }
        }

        // Kiểm tra xem kẻ trộm có nuôi Cáo nhỏ ranh mãnh không (Level >= 5)
        let caoBuff = false;
        let robberPetName = '';
        const robberPet = await db.getPet(robberId);
        if (robberPet && robberPet.species === 'cao') {
            const { petLevel } = require('../../data/pets');
            const caoLvl = petLevel(robberPet.exp);
            if (caoLvl >= 5) {
                caoBuff = true;
                robberPetName = robberPet.name || t(locale, 'species.cao') || 'Cáo nhỏ';
            }
        }

        // Cooldown (atomic) — chỉ tính khi mục tiêu hợp lệ
        const cd = await db.claimCooldown(robberId, 'rob', config.ROB.COOLDOWN_SECONDS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.rob.embed_title_warning'),
                description: t(locale, 'commands.rob.err_cooldown', { ts: Math.floor(cd / 1000) })
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Waguri không khuyến khích đâu nha 😟 nhưng game là game~
        const successRate = dogBuff ? (config.ROB.SUCCESS_RATE - 0.2) : config.ROB.SUCCESS_RATE;
        if (Math.random() < successRate) {
            const pct = config.ROB.STEAL_MIN_PCT + Math.random() * (config.ROB.STEAL_MAX_PCT - config.ROB.STEAL_MIN_PCT);
            let amount = Math.max(1, Math.floor(Number(tgt.wallet) * pct));
            if (caoBuff) {
                amount = Math.round(amount * 1.1);
            }
            const ok = await db.transferMoney(target.id, robberId, amount);
            if (!ok) {
                const embed = buildWaguriEmbed(interaction, 'error', {
                    locale,
                    title: t(locale, 'commands.rob.embed_title_fail'),
                    description: t(locale, 'commands.rob.err_transfer_fail')
                });
                return interaction.editReply({ embeds: [embed] });
            }
            const me = await db.getUser(robberId);
            let desc = t(locale, 'commands.rob.success_desc', {
                amount: fmt(amount, locale),
                currency: config.CURRENCY,
                target: target.id,
                wallet: fmt(me?.wallet || 0, locale)
            });
            if (caoBuff) {
                desc += `\n` + t(locale, 'commands.rob.success_cao_buff', { name: robberPetName });
            }
            const embedSuccess = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'commands.rob.success_title'),
                description: desc
            });
            return interaction.editReply({ embeds: [embedSuccess] });
        } else {
            const robber = await db.getUser(robberId);
            // Phạt theo TỔNG TÀI SẢN (ví+bank) -> không né được bằng cách giấu tiền trong bank.
            const robberAssets = Number(robber.wallet || 0) + Number(robber.bank || 0);
            let fine = Math.floor(robberAssets * config.ROB.FINE_PCT);
            if (caoBuff) {
                fine = Math.round(fine * 0.85); // Giảm 15% tiền phạt
            }
            const usedIns = await db.useInsurance(robberId, 'bh_hoc_duong');
            if (usedIns) {
                fine = Math.round(fine * 0.5); // Giảm 50% tiền phạt
            }
            if (fine > 0) await db.chargeAssets(robberId, fine); // trừ ví trước, thiếu thì bank
            const robberAfter = await db.getUser(robberId);
            const displayBal = robberAfter ? Number(robberAfter.wallet) : (Number(robber.wallet) - fine);
            
            let desc = t(locale, 'commands.rob.fail_desc_base', { fine: fmt(fine, locale), currency: config.CURRENCY });
            if (usedIns) {
                desc += `\n` + t(locale, 'commands.rob.fail_insurance');
            }
            if (caoBuff) {
                desc += `\n` + t(locale, 'commands.rob.fail_cao_buff', { name: robberPetName });
            }
            if (dogBuff) {
                desc += `\n` + t(locale, 'commands.rob.fail_dog_buff', { name: targetPetName, target: target.id });
            }
            desc += `\n` + t(locale, 'commands.rob.fail_desc_footer', { bal: fmt(displayBal, locale), currency: config.CURRENCY });

            const embedFail = buildWaguriEmbed(interaction, 'error', {
                locale,
                title: t(locale, 'commands.rob.fail_title'),
                description: desc
            });
            return interaction.editReply({ embeds: [embedFail] });
        }
    },
};
