const db = require('../database');
const { buildWaguriEmbed } = require('./embed');
const { getInteractionLanguage, t } = require('./i18n');

const NEWBIE_STEPS = [
    null,
    { name: 'Bước 1: Điểm danh đầu tiên 📅', reward: 1000 },
    { name: 'Bước 2: Chăm chỉ làm việc ⚡', reward: 1500 },
    { name: 'Bước 3: Mua sắm trải nghiệm 🛒', reward: 2000 },
    { name: 'Bước 4: Xin việc chính thức 🧑‍💼', reward: 2500 },
    { name: 'Bước 5: Trải nghiệm may rủi 🪙', reward: 3000 }
];

const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

const getNewbieStepName = (stepIndex, locale) => {
    return t(locale, `lib.newbie.step_${stepIndex}`) || NEWBIE_STEPS[stepIndex]?.name;
};

async function handleNewbieQuest(interaction, key, amount = 1) {
    if (!interaction || !interaction.user) return;
    const userId = interaction.user.id;
    try {
        const locale = await getInteractionLanguage(interaction);
        const res = await db.newbieQuestIncr(userId, key, amount);
        if (res && res.claimed) {
            const completedStep = res.step - 1;
            const ns = NEWBIE_STEPS[completedStep];
            if (!ns) return;

            const stepName = getNewbieStepName(completedStep, locale);
            let desc = t(locale, 'lib.newbie.desc_step_complete', {
                name: stepName,
                reward: fmt(ns.reward, locale)
            });

            if (res.completed) {
                const titleStr = t(locale, 'titles.Tân Thủ Ngọt Ngào') || 'Tân Thủ Ngọt Ngào';
                desc += t(locale, 'lib.newbie.desc_all_complete', {
                    bonus: fmt(res.bonus, locale),
                    title: titleStr
                });
            } else {
                const nextNs = NEWBIE_STEPS[res.step];
                if (nextNs) {
                    const nextStepName = getNewbieStepName(res.step, locale);
                    desc += t(locale, 'lib.newbie.desc_next_step', {
                        name: nextStepName
                    });
                }
            }

            const embed = buildWaguriEmbed(interaction, 'success', {
                locale,
                title: t(locale, 'lib.newbie.embed_title'),
                description: desc
            });

            await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
        }
    } catch (err) {
        console.error('[NEWBIE ERROR] handleNewbieQuest:', err);
    }
}

module.exports = { handleNewbieQuest };
