const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { buildWaguriEmbed } = require('../../lib/embed');
const db = require('../../database.js');
const config = require('../../config');
const { pvpEnabled } = require('../../lib/guildflags');

const fmt = n => Number(n).toLocaleString('vi-VN');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rob')
        .setDescription('Cướp tiền trong ví người khác (rủi ro cao!)')
        .addUserOption(o => o.setName('target').setDescription('Mục tiêu').setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply();
        const robberId = interaction.user.id;
        const target = interaction.options.getUser('target');

        if (!target) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🦹・Trộm cướp', description: 'Cậu định "ghé thăm" ai cơ? Nhập @người nhé~' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.bot) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🦹・Trộm cướp', description: 'Bot làm gì có ví mà cướp~ 😄' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (target.id === robberId) {
            const embed = buildWaguriEmbed(interaction, 'error', { title: '🦹・Trộm cướp', description: 'Cậu tự cướp mình à? 🤨' });
            return interaction.editReply({ embeds: [embed] });
        }
        if (!await pvpEnabled(interaction.guildId || interaction.guild?.id)) {
            const embed = buildWaguriEmbed(interaction, 'warning', { title: '🦹・Trộm cướp', description: 'Server này đã **tắt PvP** (cướp/trộm) rồi nha~ 🌸' });
            return interaction.editReply({ embeds: [embed] });
        }

        const tgt = await db.getUser(target.id);
        if (!tgt || Number(tgt.wallet) < config.ROB.MIN_TARGET_WALLET) {
            const embed = buildWaguriEmbed(interaction, 'warning', { title: '🦹・Trộm cướp', description: `Ví của <@${target.id}> trống trơn, chả có gì để lấy đâu~ 🌸` });
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
                targetPetName = targetPet.name || 'Cún con';
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
                robberPetName = robberPet.name || 'Cáo nhỏ';
            }
        }

        // Cooldown (atomic) — chỉ tính khi mục tiêu hợp lệ
        const cd = await db.claimCooldown(robberId, 'rob', config.ROB.COOLDOWN_SECONDS);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                title: '🦹・Trộm cướp',
                description: `Cậu vừa "ra tay" xong, nghỉ chút đã nhé~ Quay lại sau <t:${Math.floor(cd / 1000)}:R>.`
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
                const embed = buildWaguriEmbed(interaction, 'error', { title: '🦹・Thất bại', description: 'Hụt rồi, con mồi nhanh tay cất tiền mất tiêu~' });
                return interaction.editReply({ embeds: [embed] });
            }
            const me = await db.getUser(robberId);
            let desc = `Cậu lén lấy được **${fmt(amount)}** ${config.CURRENCY} từ ví <@${target.id}>.\n💵 Số dư của cậu: **${fmt(me?.wallet || 0)}** ${config.CURRENCY}\n*(Waguri giả vờ không thấy gì~ 🙈)*`;
            if (caoBuff) {
                desc += `\n🦊 Bé cáo **${robberPetName}** ranh mãnh giúp cậu trộm thêm 10% số tiền!`;
            }
            const embedSuccess = buildWaguriEmbed(interaction, 'success', {
                title: '🦹・Trộm thành công!',
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
            
            let desc = `Cậu bị bắt quả tang và phải nộp phạt **${fmt(fine)}** ${config.CURRENCY}.`;
            if (usedIns) {
                desc += `\n🛡️ **Bảo hiểm Đường phố** đã kích hoạt giúp giảm 50% tiền phạt!`;
            }
            if (caoBuff) {
                desc += `\n🦊 Bé cáo **${robberPetName}** ranh mãnh tẩu tán bớt tang vật giúp cậu giảm 15% tiền phạt!`;
            }
            if (dogBuff) {
                desc += `\n🐕 Bé cún **${targetPetName}** của <@${target.id}> sủa vang làm cậu giật mình bị phát hiện!`;
            }
            desc += `\n💵 Số dư của cậu: **${fmt(displayBal)}** ${config.CURRENCY}\nLần sau đừng làm vậy nữa nhé~ 😟`;

            const embedFail = buildWaguriEmbed(interaction, 'error', {
                title: '🚨・Bị tóm rồi!',
                description: desc
            });
            return interaction.editReply({ embeds: [embedFail] });
        }
    },
};
