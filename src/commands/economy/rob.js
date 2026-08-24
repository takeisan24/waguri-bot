const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { pvpEnabled } = require('../../lib/guildflags');
const { getInteractionLanguage, t } = require('../../lib/i18n');
const { petBuffValue, petThiefFineCut, petRarity, findSpecies } = require('../../data/pets');

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

        // Buff thú cưng của CẢ HAI phía. Ngưỡng Lv.5 cũ đã bỏ (xem src/data/pets.js):
        // đo trên prod thấy 0/2 pet từng chạm Lv.5 nên hai buff này chưa chạy lần nào.
        // Hai lời gọi getPet nay chạy song song — trước đây nối tiếp nhau vô cớ.
        const [targetPet, robberPet] = await Promise.all([db.getPet(target.id), db.getPet(robberId)]);
        const guardCut = petBuffValue(targetPet, 'guard');    // 🛡️ Cún con / Nghê Đá — hạ tỉ lệ kẻ cướp
        const thiefBonus = petBuffValue(robberPet, 'thief');  // 🗝️ Cáo nhỏ / Hổ Con  — tăng tiền cướp
        const thiefFineCut = petThiefFineCut(robberPet);      //                        và giảm tiền phạt
        const petLabel = p => (p ? `${petRarity(p).emoji}${findSpecies(p.species)?.emoji || '🐾'}` : '');
        const targetPetName = targetPet ? (targetPet.name || t(locale, `species.${targetPet.species}`) || findSpecies(targetPet.species)?.name || '') : '';
        const robberPetName = robberPet ? (robberPet.name || t(locale, `species.${robberPet.species}`) || findSpecies(robberPet.species)?.name || '') : '';

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
        // Sàn 5%: bậc Thần Thoại cho guardCut tới 0,40 nên phải chặn tỉ lệ tụt về <= 0.
        const successRate = Math.max(0.05, config.ROB.SUCCESS_RATE - guardCut);
        if (Math.random() < successRate) {
            const pct = config.ROB.STEAL_MIN_PCT + Math.random() * (config.ROB.STEAL_MAX_PCT - config.ROB.STEAL_MIN_PCT);
            let amount = Math.max(1, Math.floor(Number(tgt.wallet) * pct));
            if (thiefBonus > 0) {
                amount = Math.round(amount * (1 + thiefBonus));
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
            if (thiefBonus > 0) {
                desc += `\n` + t(locale, 'commands.rob.success_thief_buff', {
                    emoji: petLabel(robberPet), name: robberPetName, pct: (thiefBonus * 100).toFixed(0) });
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
            if (thiefFineCut > 0) {
                fine = Math.round(fine * (1 - thiefFineCut)); // bậc càng cao giảm càng nhiều
            }
            const usedIns = await db.useInsurance(robberId, 'bh_hoc_duong');
            if (usedIns) {
                fine = Math.round(fine * 0.5); // Giảm 50% tiền phạt
            }
            // GIỮ số ĐÃ TRỪ, đừng hiển thị số ĐỊNH TRỪ.
            //
            // `charge_assets` cắt khoản phạt theo tài sản đang có (`least(p_amount, ví+bank)`)
            // rồi TRẢ VỀ số thật sự lấy đi. Bản cũ bỏ giá trị đó và in ra `fine`, nên người
            // chỉ còn 100 xu bị phạt 500 sẽ đọc "bị phạt 500" trong khi thực tế mất 100.
            //
            // Số dư ở dòng dưới vốn đã đọc lại từ DB nên vẫn đúng — chỉ riêng con số tiền
            // phạt là bịa. Đó là kiểu sai khó thấy nhất: một nửa màn hình nói thật.
            const phatThat = fine > 0 ? await db.chargeAssets(robberId, fine) : 0;
            const robberAfter = await db.getUser(robberId);
            const displayBal = robberAfter ? Number(robberAfter.wallet) : (Number(robber.wallet) - phatThat);

            let desc = t(locale, 'commands.rob.fail_desc_base', { fine: fmt(phatThat, locale), currency: config.CURRENCY });
            if (usedIns) {
                desc += `\n` + t(locale, 'commands.rob.fail_insurance');
            }
            if (thiefFineCut > 0) {
                desc += `\n` + t(locale, 'commands.rob.fail_thief_buff', {
                    emoji: petLabel(robberPet), name: robberPetName, pct: (thiefFineCut * 100).toFixed(0) });
            }
            if (guardCut > 0) {
                desc += `\n` + t(locale, 'commands.rob.fail_guard_buff', {
                    emoji: petLabel(targetPet), name: targetPetName, target: target.id });
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
