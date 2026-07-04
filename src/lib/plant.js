// lib/plant.js — Hệ trồng cây. Core thuần trả {type,title,description}; slash & prefix cùng dùng.
const db = require('../database.js');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { getJail } = require('./jail');
const { pvpEnabled } = require('./guildflags');
const { COST, TIMINGS, STEAL, randPlant, produceId } = require('../data/plant');

const C = config.CURRENCY;
const fmt = n => Number(n).toLocaleString('vi-VN');
const TITLE = '🌱・Trồng cây';
const secs = ms => Math.floor(ms / 1000);

const res = (type, description) => ({ type, title: TITLE, description });
const ok = d => res('success', d), warn = d => res('warning', d), errR = d => res('error', d), info = d => res('info', d);

const matureAgeMs = p => Date.now() - new Date(p.mature_at).getTime();

// Đánh dấu chết nếu bỏ tưới quá 5h
async function ensureAlive(plant) {
    if (plant.stage === 'dead') return errR('Cây đã chết 🥀 — dùng `hoisinh` (1.000) để hồi sinh nhé~');
    if (plant.stage === 'growing' && Date.now() - new Date(plant.last_water_at).getTime() > TIMINGS.DEAD_MS) {
        await db.plantSetDead(plant.user_id);
        return errR('Cây đã chết vì hơn 5 tiếng không được tưới 🥀 — dùng `hoisinh` (1.000) để hồi sinh~');
    }
    return null;
}

async function buyPlant(userId) {
    const g = randPlant();
    const r = await db.plantBuy(userId, COST.BUY, g.name, g.tier, g.flower);
    if (r === 'ok') return ok(`Cậu mua giống và trồng được một cây **${g.name}** ${g.flower ? '🌸' : '🌱'} (**${fmt(COST.BUY)}** ${C})!\nTưới nước bằng \`tuoinuoc\` nhé — cần 3 lần, mỗi lần cách 3 tiếng~`);
    if (r === 'has_plant') return warn('Cậu đang trồng một cây rồi~ Thu hoạch hoặc `phacay` xong hẵng trồng cây mới nhé.');
    if (r === 'insufficient') return warn(`Cậu cần **${fmt(COST.BUY)}** ${C} để mua giống~`);
    return errR('Ơ, có lỗi khi mua giống, thử lại sau nhé~');
}

async function waterPlant(userId) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn('Cậu chưa trồng cây nào. Mua giống bằng `muagiong` (500) nhé~');
    const dead = await ensureAlive(plant); if (dead) return dead;
    const r = await db.plantWater(userId, secs(TIMINGS.WATER_INTERVAL_MS));
    if (r.result === 'mature') return ok('Cậu tưới đủ 3 lần, cây đã **trưởng thành**! 🌳 Đợi 1 tiếng rồi `thuhoach` để thu hoạch nhé~');
    if (r.result === 'ok') return ok(`Tưới nước cho cây 💧 (**${r.water}/3**) — lần tưới sau cách 3 tiếng nhé.`);
    if (r.result === 'too_soon') return warn(`Cây vừa được tưới~ đợi thêm **${Math.ceil(r.wait / 60)} phút** rồi tưới tiếp nhé.`);
    if (r.result === 'dead') return errR('Cây đã chết — dùng `hoisinh` (1.000) nhé~');
    if (r.result === 'done') return info('Cây đã trưởng thành rồi, đi `thuhoach` thôi~ 🌳');
    return warn('Hổng tưới được lúc này~');
}

async function waterHelp(helperId, target) {
    if (!target) return warn('Tưới hộ cây của ai? Gắn @người nhé~');
    if (target.bot || target.id === helperId) return warn('Gắn @người khác để tưới hộ nhé~');
    const r = await db.plantWaterHelp(helperId, target.id);
    if (r.result === 'mature') return ok(`Cậu tưới hộ giọt nước cuối, cây của <@${target.id}> đã trưởng thành! 🌳🌸`);
    if (r.result === 'ok') return ok(`Cậu tưới hộ cây cho <@${target.id}> (**${r.water}/3**) — tử tế ghê~ 💧🌸`);
    if (r.result === 'already') return warn('Cậu đã tưới hộ cây này một lần rồi, để dành lượt cho người khác nhé~');
    if (r.result === 'not_growing') return warn('Cây của họ không ở giai đoạn cần tưới~');
    if (r.result === 'no_plant') return warn('Người đó chưa trồng cây nào~');
    return warn('Hổng tưới hộ được lúc này~');
}

async function fertilize(userId) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn('Cậu chưa trồng cây nào~');
    const dead = await ensureAlive(plant); if (dead) return dead;
    const usedPhan = await db.takeItem(userId, 'phan_bon', 1); // có Phân Bón (từ nuôi heo) thì miễn phí
    const cost = usedPhan ? 0 : COST.FERT;
    const r = await db.plantFertilize(userId, cost);
    const costStr = usedPhan ? 'bằng **Phân Bón** 💩 (miễn phí)' : `(**${fmt(COST.FERT)}** ${C})`;
    if (r.result === 'mature') return ok(`Bón phân ${costStr} — cây vọt lên **trưởng thành** luôn! 🌳`);
    if (r.result === 'ok') return ok(`Bón phân ${costStr} giúp cây thêm 1 nước ngay 💧 (**${r.water}/3**).`);
    if (usedPhan) await db.giveItemAdmin(userId, 'phan_bon', 1); // hoàn phân nếu không thành
    if (r.result === 'not_growing') return warn('Cây đã trưởng thành rồi, khỏi bón nữa~');
    if (r.result === 'insufficient') return warn(`Bón phân cần **${fmt(COST.FERT)}** ${C} (hoặc 1 **Phân Bón** từ nuôi heo)~`);
    return warn('Hổng bón được lúc này~');
}

async function harvest(userId) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn('Cậu chưa trồng cây nào~');
    if (plant.stage !== 'mature') {
        const dead = await ensureAlive(plant); if (dead) return dead;
        return warn('Cây chưa trưởng thành — tưới đủ 3 lần (mỗi lần cách 3 tiếng) đã nhé~');
    }
    const r = await db.plantClaim(userId, secs(TIMINGS.HARVEST_MIN_MS), secs(TIMINGS.PEST_MAX_MS));
    if (r.result === 'ok') {
        await db.giveItemAdmin(userId, produceId(r.tier, r.is_flower), 1);
        await db.giveItemAdmin(userId, 'cam_heo', 1); // rau/lá thừa làm cám cho heo
        return ok(`Cậu thu hoạch được **${plant.type || (r.is_flower ? 'đoá hoa' : 'trái cây')}** và ít rau thừa làm **Cám Heo** 🌽! 🧺\nVào kho \`/eat\` (nếu là trái) hoặc \`/sell\` để bán lấy tiền nhé~`);
    }
    if (r.result === 'too_soon') return warn(`Cây vừa trưởng thành~ đợi thêm **${Math.ceil(r.wait / 60)} phút** rồi thu hoạch.`);
    if (r.result === 'pest') return errR('Cây để quá lâu (hơn 4 tiếng) bị sâu bọ phá mất trắng rồi 🐛 — trồng cây mới với `muagiong` nhé~');
    return warn('Hổng thu hoạch được lúc này~');
}

async function revivePlant(userId) {
    const r = await db.plantRevive(userId, COST.REVIVE);
    if (r === 'ok') return ok(`Cậu hồi sinh cây (**${fmt(COST.REVIVE)}** ${C}) — cây xanh tươi trở lại! 🌱✨ Nhớ tưới đều nhé.`);
    if (r === 'no_plant') return warn('Cậu chưa trồng cây nào~');
    if (r === 'not_dead') return info('Cây của cậu vẫn còn sống mà~ 🌿');
    if (r === 'insufficient') return warn(`Hồi sinh cần **${fmt(COST.REVIVE)}** ${C}~`);
    return errR('Ơ, có lỗi khi hồi sinh, thử lại sau nhé~');
}

async function destroyPlant(userId) {
    const plant = await db.getPlant(userId);
    if (!plant) return warn('Cậu chưa trồng cây nào để phá~');
    await db.deletePlant(userId);
    return ok('Đã phá cây hiện tại. Cậu có thể `muagiong` trồng cây mới rồi~ 🌱');
}

async function stealPlant(thiefId, target, guildId) {
    if (!await pvpEnabled(guildId)) return warn('Server này đã **tắt PvP** (trộm/cướp) rồi nha~ 🌸');
    if (!target) return warn('Trộm cây của ai? Gắn @người nhé~ (Waguri không khuyến khích đâu 😟)');
    if (target.bot) return warn('Bot không trồng cây đâu~');
    if (target.id === thiefId) return warn('Tự trộm cây mình làm chi~ 😆');
    const jail = await getJail(thiefId);
    if (jail) return warn(`Cậu đang bị giam, không đi trộm được đâu~ Được thả <t:${Math.floor(jail.until / 1000)}:R>.`);

    const victim = await db.getPlant(target.id);
    if (!victim || victim.stage !== 'mature') return warn('Cây của họ chưa trưởng thành để trộm~');
    if (matureAgeMs(victim) < TIMINGS.STEAL_MIN_MS) return warn('Cây của họ mới trưởng thành — phải đợi sau chủ 1h30 mới trộm được~');

    const e = await db.spendEnergy(thiefId, STEAL.ENERGY);
    if (e < 0) return warn(`Cậu hết năng lượng để đi trộm rồi (cần ${STEAL.ENERGY} ⚡)~`);
    const usedTool = await db.takeItem(thiefId, 'do_trom', 1); // có Đồ Nghề Trộm thì khỏi tốn tiền
    if (!usedTool && !await db.addMoney(thiefId, -COST.STEAL_FEE, 'wallet')) return warn(`Cần **${fmt(COST.STEAL_FEE)}** ${C} (hoặc 1 **Đồ Nghề Trộm**) để đi trộm~`);

    if (Math.random() < STEAL.SUCCESS) {
        const claim = await db.plantClaim(target.id, secs(TIMINGS.STEAL_MIN_MS), secs(TIMINGS.PEST_MAX_MS));
        if (claim.result === 'ok') {
            await db.giveItemAdmin(thiefId, produceId(claim.tier, claim.is_flower), 1);
            return ok(`Cậu nhanh tay hái trộm thành quả của <@${target.id}> rồi chuồn! 🙈🧺\n*(Waguri giả vờ không thấy gì~)*`);
        }
        if (claim.result === 'pest') return warn('Cây của họ vừa bị sâu bọ phá, chả còn gì để trộm~');
        return warn('Cây của họ vừa được thu hoạch/trộm mất rồi, cậu hụt ăn~');
    }

    const failN = await db.plantStealFail(thiefId);
    let pen = '';
    if (failN >= STEAL.MAX_FAILS) {
        const r = await db.jailOrFine(thiefId, STEAL.FINE, STEAL.JAIL_HOURS, 'trộm cây bị bắt');
        if (r.result === 'jailed') {
            if (await db.useInsurance(thiefId, 'bh_hoc_duong')) { await db.halveJail(thiefId); pen = ' Cậu bị **giam** (đã giảm nửa nhờ Bảo Hiểm Học Đường)!'; }
            else pen = ` Trộm hụt 3 lần, cậu bị **giam ${STEAL.JAIL_HOURS}h**! 🚓`;
        } else if (r.result === 'fined') pen = ` Trộm hụt 3 lần, bị phạt **${fmt(STEAL.FINE)}** ${C}!`;
    }
    return errR(`Cậu bị chủ vườn phát hiện khi đang hái trộm, ù té chạy!${pen} 😣`);
}

async function plantBox(userId, target) {
    const jail = await getJail(userId);
    if (jail) return warn(`Cậu đang bị giam, chưa mở Plantbox được~ Được thả <t:${Math.floor(jail.until / 1000)}:R>.`);
    const receiver = target && !target.bot ? target : null;
    const cd = await db.claimCooldown(userId, 'plantbox', 10);
    if (cd) return warn(`Mở Plantbox liên tục quá~ chờ một chút rồi mở tiếp <t:${Math.floor(cd / 1000)}:R> nhé.`);
    // Kiểm tiền TRƯỚC khi đốt lượt/ngày: tránh người thiếu tiền vẫn bị trừ 1 lượt box.
    const u = await db.getUser(userId);
    if (!u || Number(u.wallet) < COST.BOX) return warn(`Cần **${fmt(COST.BOX)}** ${C} để mở Plantbox~`);
    if (await db.claimDailyCounter(userId, 'plantbox', 10) === -1) return warn('Cậu đã mở Plantbox đủ **10 lần hôm nay** rồi, mai quay lại nhé~ 🌸');
    if (!await db.addMoney(userId, -COST.BOX, 'wallet')) return warn(`Cần **${fmt(COST.BOX)}** ${C} để mở Plantbox~`);

    const x = Math.random();
    let reward;
    if (x < 0.40) reward = 0;
    else if (x < 0.75) reward = 100 + Math.floor(Math.random() * 300);   // 100-400
    else if (x < 0.88) reward = 600 + Math.floor(Math.random() * 400);   // 600-1000
    else if (x < 0.98) reward = 1500 + Math.floor(Math.random() * 700);  // 1500-2200
    else reward = 5000;                                                  // nổ hũ
    if (reward > 0) await db.addMoney(receiver ? receiver.id : userId, reward, 'wallet');

    const who = receiver ? ` tặng <@${receiver.id}>` : '';
    if (reward === 0) return info(`Cậu mở Plantbox${who}... tiếc quá, hộp rỗng rồi~ 🌱 Thử lại lần sau nhé!`);
    const big = reward >= 5000 ? ' 💥 **NỔ HŨ!**' : '';
    return res(reward >= 5000 ? 'jackpot' : 'success', `Cậu mở Plantbox${who} và nhận **${fmt(reward)}** ${C}!${big} 🎁🌸`);
}

async function plantStatus(userId) {
    const plant = await db.getPlant(userId);
    if (!plant) return info('Cậu chưa trồng cây. Bắt đầu bằng `muagiong` (500) nhé~ 🌱');
    if (plant.stage === 'dead') return warn('🥀 Cây của cậu đã **chết** — dùng `hoisinh` (1.000) để hồi sinh nhé~');
    if (plant.stage === 'mature') {
        const age = matureAgeMs(plant);
        if (age < TIMINGS.HARVEST_MIN_MS) return info(`🌳 **${plant.type || 'Cây'}** (giá trị **${fmt(plant.tier)}** ${C}) đã trưởng thành.\nĐợi **${Math.ceil((TIMINGS.HARVEST_MIN_MS - age) / 60000)} phút** nữa rồi \`thuhoach\` nhé.`);
        if (age > TIMINGS.PEST_MAX_MS) return warn('🐛 Cây để quá lâu, coi chừng sâu bọ! Thử `thuhoach` xem còn kịp không~');
        return info(`🌳 **${plant.type || 'Cây'}** (giá trị **${fmt(plant.tier)}** ${C}) — \`thuhoach\` được rồi!${age > TIMINGS.STEAL_MIN_MS ? ' ⚠️ (đã quá 1h30, người khác có thể trộm)' : ''}`);
    }
    return info(`🌱 **${plant.type || 'Cây'}** đang lớn — đã tưới **${plant.water}/3**. Tiếp tục \`tuoinuoc\` (mỗi 3 tiếng) hoặc \`bonphan\` (200) cho nhanh nhé.`);
}

// ---- Prefix dispatcher (w!muagiong, w!tuoinuoc, ...) ----
const PLANT_CMDS = new Set(['cay', 'muagiong', 'tuoinuoc', 'bonphan', 'thuhoach', 'hoisinh', 'phacay', 'trom', 'plantbox']);

async function handlePlantPrefix(message, cmd, tokens) {
    const userId = message.author.id;
    const targetUser = message.mentions.users.first() || null;
    let r;
    switch (cmd) {
        case 'cay': r = await plantStatus(userId); break;
        case 'muagiong': r = await buyPlant(userId); break;
        case 'tuoinuoc': r = targetUser ? await waterHelp(userId, targetUser) : await waterPlant(userId); break;
        case 'bonphan': r = await fertilize(userId); break;
        case 'thuhoach': r = await harvest(userId); break;
        case 'hoisinh': r = await revivePlant(userId); break;
        case 'phacay': r = await destroyPlant(userId); break;
        case 'trom': r = await stealPlant(userId, targetUser, message.guild?.id); break;
        case 'plantbox': r = await plantBox(userId, targetUser); break;
        default: return;
    }
    const embed = buildWaguriEmbed(message, r.type, { title: r.title, description: r.description });
    await message.reply({ embeds: [embed] }).catch(() => {});
}

module.exports = {
    PLANT_CMDS, handlePlantPrefix,
    buyPlant, waterPlant, waterHelp, fertilize, harvest, revivePlant, destroyPlant, stealPlant, plantBox, plantStatus,
};
