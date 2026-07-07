// lib/pig.js — Hệ nuôi heo. Core thuần trả {type,title,description}; slash & prefix cùng dùng.
const db = require('../database.js');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { getJail } = require('./jail');
const { pvpEnabled } = require('./guildflags');
const { MEAT, COST, TIMINGS, STEAL, randType } = require('../data/pig');
const { t } = require('./i18n');

const C = config.CURRENCY;
const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

const res = (type, description, locale) => ({ type, title: t(locale, 'pig.title'), description });
const ok = (d, locale) => res('success', d, locale),
      warn = (d, locale) => res('warning', d, locale),
      errR = (d, locale) => res('error', d, locale),
      info = (d, locale) => res('info', d, locale);

const ageMs = pig => Date.now() - new Date(pig.last_action_at).getTime();
const timeReady = pig => ageMs(pig) >= TIMINGS.STEP_MS;
const waitMins = pig => Math.ceil((TIMINGS.STEP_MS - ageMs(pig)) / 60000);

// Chặn nếu heo đang/đáng bệnh (bỏ bê > 4h khi chưa trưởng thành)
async function blockIfSick(pig, locale) {
    if (pig.sick) return errR(t(locale, 'pig.sick_error'), locale);
    if (pig.stage !== 'mature' && ageMs(pig) > TIMINGS.SICK_MS) {
        await db.pigSetSick(pig.user_id);
        return errR(t(locale, 'pig.sick_neglect_error'), locale);
    }
    return null;
}

async function buyPig(userId, locale) {
    const r = await db.pigBuy(userId, COST.BUY);
    if (r === 'ok') {
        return ok(t(locale, 'pig.buy_success', { cost: fmt(COST.BUY, locale), currency: C }), locale);
    }
    if (r === 'has_pig') return warn(t(locale, 'pig.buy_has_pig'), locale);
    if (r === 'insufficient') {
        return warn(t(locale, 'pig.buy_insufficient', { cost: fmt(COST.BUY, locale), currency: C }), locale);
    }
    return errR(t(locale, 'pig.buy_error'), locale);
}

async function feedPig(userId, locale) {
    const pig = await db.getPig(userId);
    if (!pig) return warn(t(locale, 'pig.no_pig_error'), locale);
    const blocked = await blockIfSick(pig, locale); if (blocked) return blocked;

    if (pig.stage === 'baby') {
        if (await db.pigFeed1(userId)) return ok(t(locale, 'pig.feed1_success'), locale);
        return warn(t(locale, 'pig.feed_failed'), locale);
    }
    if (pig.stage === 'slept') {
        if (!timeReady(pig)) return warn(t(locale, 'pig.feed2_cooldown', { time: waitMins(pig) }), locale);
        const usedCam = await db.takeItem(userId, 'cam_heo', 1); // ăn bằng cám (từ thu hoạch cây) -> miễn phí
        const cost = usedCam ? 0 : COST.FEED2;
        const r = await db.pigMature(userId, cost);
        if (r.result === 'ok') {
            const type = randType(r.tier);
            await db.pigSetType(userId, type);
            // Translate job/pig types if possible, or keep as is.
            const localizedType = t(locale, `data.pigs.${type}.name`) || type;
            const costMsg = usedCam 
                ? t(locale, 'pig.feed2_free_msg') 
                : `(**${fmt(COST.FEED2, locale)}** ${C})`;
            return ok(t(locale, 'pig.feed2_success', { costMsg, type: localizedType, tier: fmt(r.tier, locale), currency: C }), locale);
        }
        if (usedCam) await db.giveItemAdmin(userId, 'cam_heo', 1); // hoàn cám nếu không thành
        if (r.result === 'insufficient') {
            return warn(t(locale, 'pig.feed2_insufficient', { cost: fmt(COST.FEED2, locale), currency: C }), locale);
        }
        return warn(t(locale, 'pig.feed2_wrong_step'), locale);
    }
    const hint = t(locale, `pig.stage_hints.${pig.stage}`) || '...';
    return warn(t(locale, 'pig.feed_wrong_stage', { hint }), locale);
}

async function bathePig(userId, locale) {
    const pig = await db.getPig(userId);
    if (!pig) return warn(t(locale, 'pig.no_pig_error'), locale);
    const blocked = await blockIfSick(pig, locale); if (blocked) return blocked;
    if (pig.stage !== 'fed') {
        const hint = t(locale, `pig.stage_hints.${pig.stage}`) || '...';
        return warn(t(locale, 'pig.bathe_wrong_stage', { hint }), locale);
    }
    if (!timeReady(pig)) return warn(t(locale, 'pig.bathe_cooldown', { time: waitMins(pig) }), locale);
    if (await db.pigSetStage(userId, 'fed', 'bathed')) return ok(t(locale, 'pig.bathe_success'), locale);
    return warn(t(locale, 'pig.bathe_failed'), locale);
}

async function sleepPig(userId, locale) {
    const pig = await db.getPig(userId);
    if (!pig) return warn(t(locale, 'pig.no_pig_error'), locale);
    const blocked = await blockIfSick(pig, locale); if (blocked) return blocked;
    if (pig.stage !== 'bathed') {
        const hint = t(locale, `pig.stage_hints.${pig.stage}`) || '...';
        return warn(t(locale, 'pig.sleep_wrong_stage', { hint }), locale);
    }
    if (!timeReady(pig)) return warn(t(locale, 'pig.sleep_cooldown', { time: waitMins(pig) }), locale);
    if (await db.pigSetStage(userId, 'bathed', 'slept')) {
        await db.giveItemAdmin(userId, 'phan_bon', 1); // phụ phẩm: nhặt được phân để bón cây
        return ok(t(locale, 'pig.sleep_success'), locale);
    }
    return warn(t(locale, 'pig.sleep_failed'), locale);
}

async function healPig(userId, locale) {
    const r = await db.pigHeal(userId, COST.HEAL);
    if (r === 'ok') return ok(t(locale, 'pig.heal_success', { cost: fmt(COST.HEAL, locale), currency: C }), locale);
    if (r === 'no_pig') return warn(t(locale, 'pig.no_pig_error'), locale);
    if (r === 'not_sick') return info(t(locale, 'pig.heal_not_sick'), locale);
    if (r === 'insufficient') return warn(t(locale, 'pig.heal_insufficient', { cost: fmt(COST.HEAL, locale), currency: C }), locale);
    return errR(t(locale, 'pig.heal_error'), locale);
}

async function sellPig(userId, locale) {
    const pig = await db.getPig(userId);
    if (!pig) return warn(t(locale, 'pig.no_pig_error'), locale);
    if (pig.stage !== 'mature') {
        const hint = t(locale, `pig.stage_hints.${pig.stage}`) || '...';
        return warn(t(locale, 'pig.sell_wrong_stage', { hint }), locale);
    }
    if (ageMs(pig) < TIMINGS.STEAL_AGE_MS) {
        const wait = Math.ceil((TIMINGS.STEAL_AGE_MS - ageMs(pig)) / 60000);
        return warn(t(locale, 'pig.sell_cooldown', { time: wait }), locale);
    }
    const claim = await db.pigClaimSale(userId, Math.floor(TIMINGS.STEAL_AGE_MS / 1000));
    if (claim.result !== 'ok') return warn(t(locale, 'pig.sell_failed'), locale);
    const meatId = MEAT[claim.tier];
    await db.giveItemAdmin(userId, meatId, 1);
    const localizedType = t(locale, `data.pigs.${pig.type}.name`) || pig.type || 'pig';
    return ok(t(locale, 'pig.sell_success', { type: localizedType }), locale);
}

async function bathHelp(helperId, target, locale) {
    if (!target) return warn(t(locale, 'pig.bath_help_no_target'), locale);
    if (target.bot || target.id === helperId) return warn(t(locale, 'pig.bath_help_invalid_target'), locale);
    const pig = await db.getPig(target.id);
    if (!pig) return warn(t(locale, 'pig.bath_help_no_pig'), locale);
    if (pig.sick) return warn(t(locale, 'pig.bath_help_sick'), locale);
    if (pig.stage !== 'fed') return warn(t(locale, 'pig.bath_help_wrong_stage'), locale);
    if (!timeReady(pig)) return warn(t(locale, 'pig.bath_help_cooldown'), locale);
    if (await db.pigSetStage(target.id, 'fed', 'bathed')) {
        return ok(t(locale, 'pig.bath_help_success', { user: target.id }), locale);
    }
    return warn(t(locale, 'pig.bath_help_failed'), locale);
}

async function stealPig(thiefId, target, guildId, locale) {
    if (!await pvpEnabled(guildId)) return warn(t(locale, 'pig.steal_pvp_disabled'), locale);
    if (!target) return warn(t(locale, 'pig.steal_no_target'), locale);
    if (target.bot) return warn(t(locale, 'pig.steal_bot_target'), locale);
    if (target.id === thiefId) return warn(t(locale, 'pig.steal_self_target'), locale);
    const jail = await getJail(thiefId);
    if (jail) return warn(t(locale, 'pig.steal_jailed', { time: Math.floor(jail.until / 1000) }), locale);

    const victim = await db.getPig(target.id);
    if (!victim || victim.stage !== 'mature') return warn(t(locale, 'pig.steal_not_mature'), locale);
    if (ageMs(victim) < TIMINGS.STEAL_AGE_MS) return warn(t(locale, 'pig.steal_cooldown'), locale);

    const e = await db.spendEnergy(thiefId, STEAL.ENERGY);
    if (e < 0) return warn(t(locale, 'pig.steal_no_energy', { cost: STEAL.ENERGY }), locale);
    const usedTool = await db.takeItem(thiefId, 'do_trom', 1); // có Đồ Nghề Trộm thì khỏi tốn tiền
    if (!usedTool && !await db.addMoney(thiefId, -COST.STEAL, 'wallet')) {
        return warn(t(locale, 'pig.steal_insufficient_funds', { cost: fmt(COST.STEAL, locale), currency: C }), locale);
    }

    if (Math.random() < STEAL.SUCCESS) {
        const claim = await db.pigClaimSale(target.id, Math.floor(TIMINGS.STEAL_AGE_MS / 1000));
        if (claim.result === 'ok') {
            await db.giveItemAdmin(thiefId, MEAT[claim.tier], 1);
            return ok(t(locale, 'pig.steal_success', { user: target.id }), locale);
        }
        return warn(t(locale, 'pig.steal_failed_already_sold'), locale);
    }

    // Thất bại
    const failN = await db.pigStealFail(thiefId);
    let pen = '';
    if (failN >= STEAL.MAX_FAILS) {
        const r = await db.jailOrFine(thiefId, STEAL.FINE, STEAL.JAIL_HOURS, 'trộm heo bị bắt');
        if (r.result === 'jailed') {
            if (await db.useInsurance(thiefId, 'bh_hoc_duong')) { 
                await db.halveJail(thiefId); 
                pen = t(locale, 'pig.steal_fail_jail_half');
            } else {
                pen = t(locale, 'pig.steal_fail_jail_full', { time: STEAL.JAIL_HOURS });
            }
        } else if (r.result === 'fined') {
            pen = t(locale, 'pig.steal_fail_fined', { cost: fmt(STEAL.FINE, locale), currency: C });
        }
    }
    return errR(t(locale, 'pig.steal_fail_caught', { pen }), locale);
}

async function pigBox(userId, target, locale) {
    const jail = await getJail(userId);
    if (jail) return warn(t(locale, 'pig.box_jailed', { time: Math.floor(jail.until / 1000) }), locale);
    const receiver = target && !target.bot ? target : null;
    const cd = await db.claimCooldown(userId, 'pigbox', 10);
    if (cd) return warn(t(locale, 'pig.box_cooldown', { time: Math.floor(cd / 1000) }), locale);
    // Kiểm tiền TRƯỚC khi đốt lượt/ngày: tránh người thiếu tiền vẫn bị trừ 1 lượt box.
    const u = await db.getUser(userId);
    if (!u || Number(u.wallet) < COST_PIGBOX) {
        return warn(t(locale, 'pig.box_insufficient', { cost: fmt(COST_PIGBOX, locale), currency: C }), locale);
    }
    if (await db.claimDailyCounter(userId, 'pigbox', 10) === -1) {
        return warn(t(locale, 'pig.box_daily_limit'), locale);
    }
    if (!await db.addMoney(userId, -COST_PIGBOX, 'wallet')) {
        return warn(t(locale, 'pig.box_insufficient', { cost: fmt(COST_PIGBOX, locale), currency: C }), locale);
    }

    const x = Math.random();
    let reward;
    if (x < 0.50) reward = 800 + Math.floor(Math.random() * 1000);     // 800-1800
    else if (x < 0.80) reward = 1800 + Math.floor(Math.random() * 1000); // 1800-2800
    else if (x < 0.95) reward = 2800 + Math.floor(Math.random() * 1700); // 2800-4500
    else reward = 7000;                                                  // nổ hũ
    await db.addMoney(receiver ? receiver.id : userId, reward, 'wallet');

    const who = receiver ? t(locale, 'pig.box_gift_msg', { user: receiver.id }) : '';
    const big = reward >= 7000 ? t(locale, 'pig.box_jackpot_msg') : '';
    return res(
        reward >= 7000 ? 'jackpot' : 'success',
        t(locale, 'pig.box_success', { who, reward: fmt(reward, locale), currency: C, big }),
        locale
    );
}

async function pigStatus(userId, locale) {
    const pig = await db.getPig(userId);
    if (!pig) return info(t(locale, 'pig.status_no_pig'), locale);
    if (pig.sick) return warn(t(locale, 'pig.sick_error'), locale);
    if (pig.stage === 'mature') {
        const ready = ageMs(pig) >= TIMINGS.STEAL_AGE_MS;
        const localizedType = t(locale, `data.pigs.${pig.type}.name`) || pig.type || 'pig';
        return ready 
            ? info(t(locale, 'pig.status_mature_ready', { type: localizedType, tier: fmt(pig.tier, locale), currency: C }), locale)
            : info(t(locale, 'pig.status_mature_wait', { type: localizedType, tier: fmt(pig.tier, locale), currency: C, time: Math.ceil((TIMINGS.STEAL_AGE_MS - ageMs(pig)) / 60000) }), locale);
    }
    const ready = timeReady(pig);
    const hint = t(locale, `pig.stage_hints.${pig.stage}`) || '...';
    return ready
        ? info(t(locale, 'pig.status_progress_ready', { stage: pig.stage, hint }), locale)
        : info(t(locale, 'pig.status_progress_wait', { stage: pig.stage, hint, time: waitMins(pig) }), locale);
}

// ---- Prefix dispatcher (w!muaheo, w!heoan, ...) ----
const PIG_CMDS = new Set(['heo', 'muaheo', 'heoan', 'tamheo', 'heongu', 'banheo', 'chuabenh', 'tromheo', 'pigbox']);

async function handlePigPrefix(message, cmd, tokens) {
    const userId = message.author.id;
    const targetUser = message.mentions.users.first() || null;
    const locale = message.locale || 'vi';
    let r;
    switch (cmd) {
        case 'heo': r = await pigStatus(userId, locale); break;
        case 'muaheo': r = await buyPig(userId, locale); break;
        case 'heoan': r = await feedPig(userId, locale); break;
        case 'tamheo': r = targetUser ? await bathHelp(userId, targetUser, locale) : await bathePig(userId, locale); break;
        case 'heongu': r = await sleepPig(userId, locale); break;
        case 'banheo': r = await sellPig(userId, locale); break;
        case 'chuabenh': r = await healPig(userId, locale); break;
        case 'tromheo': r = await stealPig(userId, targetUser, message.guild?.id, locale); break;
        case 'pigbox': r = await pigBox(userId, targetUser, locale); break;
        default: return;
    }
    const embed = buildWaguriEmbed(message, r.type, { locale, title: r.title, description: r.description });
    await message.reply({ embeds: [embed] }).catch(() => {});
}

module.exports = {
    PIG_CMDS, handlePigPrefix,
    buyPig, feedPig, bathePig, sleepPig, healPig, sellPig, bathHelp, stealPig, pigBox, pigStatus,
};
