const { SlashCommandBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { buildWaguriEmbed } = require('../../lib/embed');
const { computeVoteReward } = require('../../lib/voteReward');
const { getInteractionLanguage, t } = require('../../lib/i18n');

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

// Hỏi Top.gg xem user đã vote trong 12h gần nhất chưa. Trả true/false/null(không check được).
async function hasVoted(botId, userId) {
    const token = process.env.TOPGG_TOKEN;
    if (!token) return null;
    try {
        const r = await fetch(`https://top.gg/api/bots/${botId}/check?userId=${userId}`, {
            headers: { Authorization: token },
        });
        if (!r.ok) return null;
        const data = await r.json();
        return Number(data.voted) === 1;
    } catch {
        return null;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote cho Waguri trên Top.gg để nhận thưởng 💝'),
    async execute(interaction) {
        await interaction.deferReply();
        const locale = await getInteractionLanguage(interaction);
        const botId = interaction.client.user.id;
        const voteUrl = `https://top.gg/bot/${botId}/vote`;
        const C = config.CURRENCY;

        // Vote bên DiscordBotList có khoá cooldown RIÊNG nên nhận được cả hai phần thưởng.
        // Không nói ra thì chẳng ai biết là có nền tảng thứ hai — mà đó mới là mục đích của
        // việc mở thêm list. Thưởng ở đó phát qua webhook `/dbl/vote`, không qua lệnh này.
        const dblLine = t(locale, 'commands.vote.dbl_line', {
            url: `https://discordbotlist.com/bots/${botId}/upvote`,
            reward: fmt(config.VOTE.DBL.REWARD, locale),
            currency: C,
            exp: config.VOTE.DBL.EXP,
        });

        const voted = await hasVoted(botId, interaction.user.id);

        // Chưa cấu hình token, hoặc không gọi được API -> chỉ hiện link mời vote.
        if (voted === null) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.vote.title_main'),
                description: t(locale, 'commands.vote.desc_no_api', { url: voteUrl, reward: fmt(config.VOTE.REWARD, locale), currency: C, exp: config.VOTE.EXP }) + dblLine
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Đã có thể check vote:
        if (!voted) {
            const embed = buildWaguriEmbed(interaction, 'warning', {
                locale,
                title: t(locale, 'commands.vote.title_not_voted'),
                description: t(locale, 'commands.vote.desc_not_voted', { url: voteUrl, reward: fmt(config.VOTE.REWARD, locale), currency: C, exp: config.VOTE.EXP }) + dblLine
            });
            return interaction.editReply({ embeds: [embed] });
        }

        // Đã vote -> phát thưởng 1 lần / chu kỳ 12h (chống nhận trùng bằng cooldown nguyên tử).
        // Tạo dòng users trước khi claim cooldown — `cooldowns.user_id` có khoá ngoại tới
        // `users`, mà `claimCooldown` fail-open khi DB lỗi. Xem chú thích dài ở
        // `src/lib/voteServer.js` (grantVoteReward). An toàn về ack: đã deferReply ở trên.
        await db.getUser(interaction.user.id);

        const cd = await db.claimCooldown(interaction.user.id, 'vote_reward', config.VOTE.COOLDOWN_HOURS * 3600);
        if (cd) {
            const embed = buildWaguriEmbed(interaction, 'info', {
                locale,
                title: t(locale, 'commands.vote.title_claimed'),
                description: t(locale, 'commands.vote.desc_claimed', { time: Math.floor(cd / 1000) }) + dblLine
            });
            return interaction.editReply({ embeds: [embed] });
        }

        db.questIncr(interaction.user.id, 'vote', 1); // nhiệm vụ: vote Top.gg (đếm 1 lần/chu kỳ nhờ guard cooldown ở trên)
        const streak = await db.bumpVoteStreak(interaction.user.id, config.VOTE.STREAK_GRACE_HOURS * 3600);
        const { coins, exp, bonus } = computeVoteReward(streak, false);
        // Cooldown đã set trước (chống nhận trùng). Nếu addMoney lỗi -> log [PAYOUT FAIL] để cứu thủ công
        // (không grant-first vì sẽ mở lại race nhận đúp; cooldown-first là cổng dedup).
        // `addMoney` với số DƯƠNG chỉ hỏng theo kiểu `null` (DB lỗi) — guard trong RPC là
        // `wallet + amount >= 0`, luôn đúng khi cộng. Bản cũ chỉ ghi console.error rồi vẫn
        // in "cậu nhận được N xu", nên lúc Supabase chập chờn người vote đọc một câu khẳng
        // định sai về tiền của chính họ. Cùng lớp lỗi đã vá ở 4 trò cờ bạc (`26b7974`).
        //
        // KHÔNG thử lại: cooldown đã đặt TRƯỚC (đó là cổng chống nhận đúp — xem chú thích
        // ngay trên), nên trả lần nữa là mở lại đúng cái race mà thứ tự này sinh ra để chặn.
        const daTra = await db.addMoney(interaction.user.id, coins, 'wallet');
        if (daTra !== true) {
            console.error(`[PAYOUT FAIL] vote user=${interaction.user.id} coins=${coins}`);
        }
        await db.updateExp(interaction.user.id, exp);
        const bonusText = bonus > 0 ? t(locale, 'commands.vote.bonus_streak', { amount: fmt(bonus, locale), currency: C }) : '';
        const embed = buildWaguriEmbed(interaction, 'success', {
            locale,
            title: t(locale, 'commands.vote.title_success'),
            description: t(locale, 'commands.vote.desc_success', { coins: fmt(coins, locale), currency: C, exp, streak, bonus: bonusText })
                // Khác 4 trò cờ bạc: embed này KHÔNG có dòng số dư để làm trọng tài, nên
                // chuỗi ở đây phải tự chỉ người đọc sang `/bank balance`.
                + (daTra !== true ? t(locale, 'commands.vote.payout_unconfirmed') : '')
        });
        await interaction.editReply({ embeds: [embed] });
    },
};
