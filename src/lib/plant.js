// lib/plant.js — Hệ trồng cây. Core thuần trả {type,title,description}; slash & prefix cùng dùng.
const db = require('../database.js');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { getJail } = require('./jail');
const { pvpEnabled } = require('./guildflags');
const { COST, TIMINGS, STEAL, randPlant, produceId } = require('../data/plant');
const { t } = require('./i18n');

const C = config.CURRENCY;
const fmt = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');
const secs = ms => Math.floor(ms / 1000);

const res = (type, description, locale) => ({ type, title: t(locale, 'plant.title'), description });
const ok = (d, locale) => res('success', d, locale),
      warn = (d, locale) => res('warning', d, locale),
      errR = (d, locale) => res('error', d, locale),
      info = (d, locale) => res('info', d, locale);

const matureAgeMs = p => Date.now() - new Date(p.mature_at).getTime();

// Đánh dấu chết nếu bỏ tưới quá 5h
async function ensureAlive(plant, locale) {
    if (plant.stage === 'dead') return errR(t(locale, 'plant.dead_error'), locale);
    if (plant.stage === 'growing' && Date.now() - new Date(plant.last_water_at).getTime() > TIMINGS.DEAD_MS) {
        await db.plantSetDead(plant.user_id);
        return errR(t(locale, 'plant.dead_neglect_error'), locale);
    }
    return null;
}

async function buyPlant(userId, locale) {
    const g = randPlant();
    const r = await db.plantBuy(userId, COST.BUY, g.name, g.tier, g.flower);
    if (r === 'ok') {
        const localizedName = t(locale, `data.plants.${g.name}.name`) || g.name;
        const emoji = g.flower ? '🌸' : '🌱';
        return ok(t(locale, 'plant.buy_success', { name: localizedName, emoji, cost: fmt(COST.BUY, locale), currency: C }), locale);
    }
    if (r === 'has_plant') return warn(t(locale, 'plant.buy_has_plant'), locale);
    if (r === 'insufficient') {
        return warn(t(locale, 'plant.buy_insufficient', { cost: fmt(COST.BUY, locale), currency: C }), locale);
    }
    return errR(t(locale, 'plant.buy_error'), locale);
}

async function waterPlant(userId, locale) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn(t(locale, 'plant.no_plant_error'), locale);
    const dead = await ensureAlive(plant, locale); if (dead) return dead;
    const r = await db.plantWater(userId, secs(TIMINGS.WATER_INTERVAL_MS));
    if (r.result === 'mature') return ok(t(locale, 'plant.water_mature'), locale);
    if (r.result === 'ok') return ok(t(locale, 'plant.water_success', { count: r.water }), locale);
    if (r.result === 'too_soon') return warn(t(locale, 'plant.water_cooldown', { time: Math.ceil(r.wait / 60) }), locale);
    if (r.result === 'dead') return errR(t(locale, 'plant.dead_error'), locale);
    if (r.result === 'done') return info(t(locale, 'plant.water_already_mature'), locale);
    return warn(t(locale, 'plant.water_failed'), locale);
}

async function waterHelp(helperId, target, locale) {
    if (!target) return warn(t(locale, 'plant.water_help_no_target'), locale);
    if (target.bot || target.id === helperId) return warn(t(locale, 'plant.water_help_invalid_target'), locale);
    const r = await db.plantWaterHelp(helperId, target.id);
    if (r.result === 'mature') return ok(t(locale, 'plant.water_help_mature', { user: target.id }), locale);
    if (r.result === 'ok') return ok(t(locale, 'plant.water_help_success', { user: target.id, count: r.water }), locale);
    if (r.result === 'already') return warn(t(locale, 'plant.water_help_already'), locale);
    if (r.result === 'not_growing') return warn(t(locale, 'plant.water_help_not_growing'), locale);
    if (r.result === 'no_plant') return warn(t(locale, 'plant.water_help_no_plant'), locale);
    return warn(t(locale, 'plant.water_help_failed'), locale);
}

async function fertilize(userId, locale) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn(t(locale, 'plant.no_plant_error'), locale);
    const dead = await ensureAlive(plant, locale); if (dead) return dead;
    const usedPhan = await db.takeItem(userId, 'phan_bon', 1); // có Phân Bón (từ nuôi heo) thì miễn phí
    const cost = usedPhan ? 0 : COST.FERT;
    const r = await db.plantFertilize(userId, cost);
    const costStr = usedPhan 
        ? t(locale, 'plant.fert_free_msg') 
        : `(**${fmt(COST.FERT, locale)}** ${C})`;
    if (r.result === 'mature') return ok(t(locale, 'plant.fert_mature', { costStr }), locale);
    if (r.result === 'ok') return ok(t(locale, 'plant.fert_success', { costStr, count: r.water }), locale);
    if (usedPhan) await db.giveItemAdmin(userId, 'phan_bon', 1); // hoàn phân nếu không thành
    if (r.result === 'not_growing') return warn(t(locale, 'plant.fert_already_mature'), locale);
    if (r.result === 'insufficient') {
        return warn(t(locale, 'plant.fert_insufficient', { cost: fmt(COST.FERT, locale), currency: C }), locale);
    }
    return warn(t(locale, 'plant.fert_failed'), locale);
}

async function harvest(userId, locale) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn(t(locale, 'plant.no_plant_error'), locale);
    if (plant.stage !== 'mature') {
        const dead = await ensureAlive(plant, locale); if (dead) return dead;
        return warn(t(locale, 'plant.harvest_not_mature'), locale);
    }
    const r = await db.plantClaim(userId, secs(TIMINGS.HARVEST_MIN_MS), secs(TIMINGS.PEST_MAX_MS));
    if (r.result === 'ok') {
        await db.giveItemAdmin(userId, produceId(r.tier, r.is_flower), 1);
        await db.giveItemAdmin(userId, 'cam_heo', 1); // rau/lá thừa làm cám cho heo
        const typeLabel = t(locale, `data.plants.${plant.type}.name`) || plant.type || (r.is_flower ? 'flower' : 'fruit');
        return ok(t(locale, 'plant.harvest_success', { type: typeLabel }), locale);
    }
    if (r.result === 'too_soon') return warn(t(locale, 'plant.harvest_cooldown', { time: Math.ceil(r.wait / 60) }), locale);
    if (r.result === 'pest') return errR(t(locale, 'plant.harvest_pest'), locale);
    return warn(t(locale, 'plant.harvest_failed'), locale);
}

async function revivePlant(userId, locale) {
    const r = await db.plantRevive(userId, COST.REVIVE);
    if (r === 'ok') return ok(t(locale, 'plant.revive_success', { cost: fmt(COST.REVIVE, locale), currency: C }), locale);
    if (r === 'no_plant') return warn(t(locale, 'plant.no_plant_error'), locale);
    if (r === 'not_dead') return info(t(locale, 'plant.revive_not_dead'), locale);
    if (r === 'insufficient') return warn(t(locale, 'plant.revive_insufficient', { cost: fmt(COST.REVIVE, locale), currency: C }), locale);
    return errR(t(locale, 'plant.revive_error'), locale);
}

async function destroyPlant(userId, locale) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn(t(locale, 'plant.destroy_no_plant'), locale);
    await db.deletePlant(userId);
    return ok(t(locale, 'plant.destroy_success'), locale);
}

async function stealPlant(thiefId, target, guildId, locale) {
    if (!await pvpEnabled(guildId)) return warn(t(locale, 'plant.steal_pvp_disabled'), locale);
    if (!target) return warn(t(locale, 'plant.steal_no_target'), locale);
    if (target.bot) return warn(t(locale, 'plant.steal_bot_target'), locale);
    if (target.id === thiefId) return warn(t(locale, 'plant.steal_self_target'), locale);
    const jail = await getJail(thiefId);
    if (jail) return warn(t(locale, 'plant.steal_jailed', { time: Math.floor(jail.until / 1000) }), locale);

    const victim = await db.getPlant(target.id);
    if (!victim || victim.stage !== 'mature') return warn(t(locale, 'plant.steal_not_mature'), locale);
    if (matureAgeMs(victim) < TIMINGS.STEAL_MIN_MS) return warn(t(locale, 'plant.steal_cooldown'), locale);

    const e = await db.spendEnergy(thiefId, STEAL.ENERGY);
    if (e < 0) return warn(t(locale, 'plant.steal_no_energy', { cost: STEAL.ENERGY }), locale);
    const usedTool = await db.takeItem(thiefId, 'do_trom', 1); // có Đồ Nghề Trộm thì khỏi tốn tiền
    if (!usedTool && !await db.addMoney(thiefId, -COST.STEAL_FEE, 'wallet')) {
        return warn(t(locale, 'plant.steal_insufficient_funds', { cost: fmt(COST.STEAL_FEE, locale), currency: C }), locale);
    }

    if (Math.random() < STEAL.SUCCESS) {
        const claim = await db.plantClaim(target.id, secs(TIMINGS.STEAL_MIN_MS), secs(TIMINGS.PEST_MAX_MS));
        if (claim.result === 'ok') {
            await db.giveItemAdmin(thiefId, produceId(claim.tier, claim.is_flower), 1);
            return ok(t(locale, 'plant.steal_success', { user: target.id }), locale);
        }
        if (claim.result === 'pest') return warn(t(locale, 'plant.steal_failed_pest'), locale);
        return warn(t(locale, 'plant.steal_failed_already_harvested'), locale);
    }

    const failN = await db.plantStealFail(thiefId);
    let pen = '';
    if (failN >= STEAL.MAX_FAILS) {
        const r = await db.jailOrFine(thiefId, STEAL.FINE, STEAL.JAIL_HOURS, 'trộm cây bị bắt');
        if (r.result === 'jailed') {
            if (await db.useInsurance(thiefId, 'bh_hoc_duong')) { 
                await db.halveJail(thiefId); 
                pen = t(locale, 'plant.steal_fail_jail_half');
            } else {
                pen = t(locale, 'plant.steal_fail_jail_full', { time: STEAL.JAIL_HOURS });
            }
        } else if (r.result === 'fined') {
            pen = t(locale, 'plant.steal_fail_fined', { cost: fmt(STEAL.FINE, locale), currency: C });
        }
    }
    return errR(t(locale, 'plant.steal_fail_caught', { pen }), locale);
}

async function plantBox(userId, target, locale) {
    const jail = await getJail(userId);
    if (jail) return warn(t(locale, 'plant.box_jailed', { time: Math.floor(jail.until / 1000) }), locale);
    const receiver = target && !target.bot ? target : null;
    const cd = await db.claimCooldown(userId, 'plantbox', 10);
    if (cd) return warn(t(locale, 'plant.box_cooldown', { time: Math.floor(cd / 1000) }), locale);
    // Kiểm tiền TRƯỚC khi đốt lượt/ngày: tránh người thiếu tiền vẫn bị trừ 1 lượt box.
    const u = await db.getUser(userId);
    if (!u || Number(u.wallet) < COST.BOX) {
        return warn(t(locale, 'plant.box_insufficient', { cost: fmt(COST.BOX, locale), currency: C }), locale);
    }
    if (await db.claimDailyCounter(userId, 'plantbox', 10) === -1) {
        return warn(t(locale, 'plant.box_daily_limit'), locale);
    }
    if (!await db.addMoney(userId, -COST.BOX, 'wallet')) {
        return warn(t(locale, 'plant.box_insufficient', { cost: fmt(COST.BOX, locale), currency: C }), locale);
    }

    const x = Math.random();
    let reward;
    if (x < 0.40) reward = 0;
    else if (x < 0.75) reward = 100 + Math.floor(Math.random() * 300);   // 100-400
    else if (x < 0.88) reward = 600 + Math.floor(Math.random() * 400);   // 600-1000
    else if (x < 0.98) reward = 1500 + Math.floor(Math.random() * 700);  // 1500-2200
    else reward = 5000;                                                  // nổ hũ
    if (reward > 0) await db.addMoney(receiver ? receiver.id : userId, reward, 'wallet');

    const who = receiver ? t(locale, 'plant.box_gift_msg', { user: receiver.id }) : '';
    if (reward === 0) return info(t(locale, 'plant.box_empty', { who }), locale);
    const big = reward >= 5000 ? t(locale, 'plant.box_jackpot_msg') : '';
    return res(
        reward >= 5000 ? 'jackpot' : 'success',
        t(locale, 'plant.box_success', { who, reward: fmt(reward, locale), currency: C, big }),
        locale
    );
}

async function plantStatus(userId, locale) {
    const plant = await db.getPlant(userId);
    if (!plant) return info(t(locale, 'plant.status_no_plant'), locale);
    if (plant.stage === 'dead') return warn(t(locale, 'plant.dead_error'), locale);
    if (plant.stage === 'mature') {
        const age = matureAgeMs(plant);
        const localizedName = t(locale, `data.plants.${plant.type}.name`) || plant.type || 'plant';
        if (age < TIMINGS.HARVEST_MIN_MS) {
            return info(t(locale, 'plant.status_mature_wait', { name: localizedName, tier: fmt(plant.tier, locale), currency: C, time: Math.ceil((TIMINGS.HARVEST_MIN_MS - age) / 60000) }), locale);
        }
        if (age > TIMINGS.PEST_MAX_MS) return warn(t(locale, 'plant.status_mature_pest_warning'), locale);
        const warningSteal = age > TIMINGS.STEAL_MIN_MS ? t(locale, 'plant.status_mature_steal_warning') : '';
        return info(t(locale, 'plant.status_mature_ready', { name: localizedName, tier: fmt(plant.tier, locale), currency: C, warning: warningSteal }), locale);
    }
    const localizedName = t(locale, `data.plants.${plant.type}.name`) || plant.type || 'plant';
    return info(t(locale, 'plant.status_growing', { name: localizedName, count: plant.water }), locale);
}

// ---- Prefix dispatcher (w!muagiong, w!tuoinuoc, ...) ----
const PLANT_CMDS = new Set(['cay', 'muagiong', 'tuoinuoc', 'bonphan', 'thuhoach', 'hoisinh', 'phacay', 'trom', 'plantbox']);

async function handlePlantPrefix(message, cmd, tokens) {
    const userId = message.author.id;
    const targetUser = message.mentions.users.first() || null;
    const locale = message.locale || 'vi';
    let r;
    switch (cmd) {
        case 'cay': r = await plantStatus(userId, locale); break;
        case 'muagiong': r = await buyPlant(userId, locale); break;
        case 'tuoinuoc': r = targetUser ? await waterHelp(userId, targetUser, locale) : await waterPlant(userId, locale); break;
        case 'bonphan': r = await fertilize(userId, locale); break;
        case 'thuhoach': r = await harvest(userId, locale); break;
        case 'hoisinh': r = await revivePlant(userId, locale); break;
        case 'phacay': r = await destroyPlant(userId, locale); break;
        case 'trom': r = await stealPlant(userId, targetUser, message.guild?.id, locale); break;
        case 'plantbox': r = await plantBox(userId, targetUser, locale); break;
        default: return;
    }
    const embed = buildWaguriEmbed(message, r.type, { locale, title: r.title, description: r.description });
    await message.reply({ embeds: [embed] }).catch(() => {});
}

module.exports = {
    PLANT_CMDS, handlePlantPrefix,
    buyPlant, waterPlant, waterHelp, fertilize, harvest, revivePlant, destroyPlant, stealPlant, plantBox, plantStatus,
};
