// lib/pig.js — Hệ nuôi heo. Core thuần trả {type,title,description}; slash & prefix cùng dùng.
const db = require('../database.js');
const config = require('../config');
const { buildWaguriEmbed } = require('./embed');
const { getJail } = require('./jail');
const { MEAT, COST, TIMINGS, STEAL, randType } = require('../data/pig');

const C = config.CURRENCY;
const fmt = n => Number(n).toLocaleString('vi-VN');
const TITLE = '🐷・Nuôi heo';
const COST_PIGBOX = 2400;

const res = (type, description) => ({ type, title: TITLE, description });
const ok = d => res('success', d), warn = d => res('warning', d), errR = d => res('error', d), info = d => res('info', d);

const ageMs = pig => Date.now() - new Date(pig.last_action_at).getTime();
const timeReady = pig => ageMs(pig) >= TIMINGS.STEP_MS;
const waitMins = pig => Math.ceil((TIMINGS.STEP_MS - ageMs(pig)) / 60000);

// Chặn nếu heo đang/đáng bệnh (bỏ bê > 4h khi chưa trưởng thành)
async function blockIfSick(pig) {
    if (pig.sick) return errR('Heo đang bệnh 🤒 — dùng `chuabenh` (1.000) để chữa trước nhé~');
    if (pig.stage !== 'mature' && ageMs(pig) > TIMINGS.SICK_MS) {
        await db.pigSetSick(pig.user_id);
        return errR('Heo bị bệnh vì bỏ bê quá 4 tiếng 🤒 — dùng `chuabenh` (1.000) để chữa nhé~');
    }
    return null;
}

const STAGE_HINT = {
    baby: 'cho heo ăn lần 1 bằng `heoan`',
    fed: 'tắm cho heo bằng `tamheo`',
    bathed: 'cho heo ngủ bằng `heongu`',
    slept: 'cho ăn lần 2 bằng `heoan`',
    mature: 'bán heo bằng `banheo`',
};

async function buyPig(userId) {
    const r = await db.pigBuy(userId, COST.BUY);
    if (r === 'ok') return ok(`Cậu đã mua một chú **heo con** với **${fmt(COST.BUY)}** ${C} (tặng kèm 1 gói cám)! 🐷\nCho ăn ngay bằng \`heoan\` nhé~`);
    if (r === 'has_pig') return warn('Cậu đang nuôi một chú heo rồi mà~ Chăm xong rồi hẵng nuôi con mới nhé.');
    if (r === 'insufficient') return warn(`Cậu cần **${fmt(COST.BUY)}** ${C} để mua heo con~ Làm thêm với \`/work\` nhé!`);
    return errR('Ơ, có lỗi khi mua heo, thử lại sau nhé~');
}

async function feedPig(userId) {
    const pig = await db.getPig(userId);
    if (!pig) return warn('Cậu chưa có heo nào. Mua bằng `muaheo` nhé~');
    const blocked = await blockIfSick(pig); if (blocked) return blocked;

    if (pig.stage === 'baby') {
        if (await db.pigFeed1(userId)) return ok('Cho heo ăn lần 1 bằng cám tặng xong! 🐷 Đợi 15 phút rồi `tamheo` để tắm cho heo nhé~');
        return warn('Hổng cho ăn được (hết cám hoặc sai bước)~');
    }
    if (pig.stage === 'slept') {
        if (!timeReady(pig)) return warn(`Heo vừa ngủ dậy chưa lâu~ đợi thêm **${waitMins(pig)} phút** rồi cho ăn lần 2 nhé.`);
        const usedCam = await db.takeItem(userId, 'cam_heo', 1); // ăn bằng cám (từ thu hoạch cây) -> miễn phí
        const cost = usedCam ? 0 : COST.FEED2;
        const r = await db.pigMature(userId, cost);
        if (r.result === 'ok') {
            const type = randType(r.tier);
            await db.pigSetType(userId, type);
            const costMsg = usedCam ? 'bằng **Cám Heo** 🌽 (miễn phí)' : `(**${fmt(COST.FEED2)}** ${C})`;
            return ok(`Cho ăn lần 2 ${costMsg} xong — heo đã **trưởng thành**! 🎉\nĐó là **${type}** (giá trị **${fmt(r.tier)}** ${C}). Đợi 15 phút rồi \`banheo\` để chế biến & bán nhé~`);
        }
        if (usedCam) await db.giveItemAdmin(userId, 'cam_heo', 1); // hoàn cám nếu không thành
        if (r.result === 'insufficient') return warn(`Cho ăn lần 2 cần **${fmt(COST.FEED2)}** ${C} (hoặc 1 **Cám Heo** từ thu hoạch cây)~`);
        return warn('Chưa tới bước cho ăn lần 2~');
    }
    return warn(`Giờ chưa cho ăn được — hãy ${STAGE_HINT[pig.stage] || 'tiếp tục chu trình'} nhé~`);
}

async function bathePig(userId) {
    const pig = await db.getPig(userId);
    if (!pig) return warn('Cậu chưa có heo nào. Mua bằng `muaheo` nhé~');
    const blocked = await blockIfSick(pig); if (blocked) return blocked;
    if (pig.stage !== 'fed') return warn(`Chưa tắm được — hãy ${STAGE_HINT[pig.stage] || 'tiếp tục chu trình'} nhé~`);
    if (!timeReady(pig)) return warn(`Heo vừa ăn xong~ đợi thêm **${waitMins(pig)} phút** rồi tắm nhé.`);
    if (await db.pigSetStage(userId, 'fed', 'bathed')) return ok('Tắm cho heo sạch sẽ thơm tho rồi~ 🛁🐷 Đợi 15 phút rồi `heongu` cho heo ngủ nhé.');
    return warn('Hổng tắm được lúc này~');
}

async function sleepPig(userId) {
    const pig = await db.getPig(userId);
    if (!pig) return warn('Cậu chưa có heo nào. Mua bằng `muaheo` nhé~');
    const blocked = await blockIfSick(pig); if (blocked) return blocked;
    if (pig.stage !== 'bathed') return warn(`Chưa cho ngủ được — hãy ${STAGE_HINT[pig.stage] || 'tiếp tục chu trình'} nhé~`);
    if (!timeReady(pig)) return warn(`Heo vừa tắm xong~ đợi thêm **${waitMins(pig)} phút** rồi cho ngủ nhé.`);
    if (await db.pigSetStage(userId, 'bathed', 'slept')) {
        await db.giveItemAdmin(userId, 'phan_bon', 1); // phụ phẩm: nhặt được phân để bón cây
        return ok('Heo ngủ ngon lành 😴🐷 Cậu dọn chuồng nhặt được **1 Phân Bón** 💩 (bón cây miễn phí)!\nĐợi 15 phút rồi `heoan` cho ăn lần 2 để heo trưởng thành nhé~');
    }
    return warn('Hổng cho ngủ được lúc này~');
}

async function healPig(userId) {
    const r = await db.pigHeal(userId, COST.HEAL);
    if (r === 'ok') return ok(`Đã chữa bệnh cho heo (**${fmt(COST.HEAL)}** ${C}). Heo khỏe lại rồi, chăm tiếp nhé~ 🐷💕`);
    if (r === 'no_pig') return warn('Cậu chưa có heo nào~');
    if (r === 'not_sick') return info('Heo của cậu vẫn khỏe mạnh, chưa cần chữa đâu~ 🌸');
    if (r === 'insufficient') return warn(`Chữa bệnh cần **${fmt(COST.HEAL)}** ${C}~`);
    return errR('Ơ, có lỗi khi chữa bệnh, thử lại sau nhé~');
}

async function sellPig(userId) {
    const pig = await db.getPig(userId);
    if (!pig) return warn('Cậu chưa có heo nào để bán~');
    if (pig.stage !== 'mature') return warn(`Heo chưa trưởng thành — hãy ${STAGE_HINT[pig.stage] || 'tiếp tục chu trình'} trước nhé~`);
    if (ageMs(pig) < TIMINGS.STEAL_AGE_MS) {
        const wait = Math.ceil((TIMINGS.STEAL_AGE_MS - ageMs(pig)) / 60000);
        return warn(`Heo vừa trưởng thành~ đợi thêm **${wait} phút** rồi chế biến & bán nhé.`);
    }
    const claim = await db.pigClaimSale(userId, Math.floor(TIMINGS.STEAL_AGE_MS / 1000));
    if (claim.result !== 'ok') return warn('Hổng bán được lúc này, thử lại sau nhé~');
    const meatId = MEAT[claim.tier];
    await db.giveItemAdmin(userId, meatId, 1);
    return ok(`Cậu chế biến **${pig.type || 'chú heo'}** thành phần thịt và nhận về món để dùng/bán! 🍖\nVào kho xem rồi \`/eat\` ăn hồi sức **hoặc** \`/sell\` bán lấy tiền nhé~`);
}

async function bathHelp(helperId, target) {
    if (!target) return warn('Tắm hộ heo của ai? Gắn @người nhé~');
    if (target.bot || target.id === helperId) return warn('Gắn @người khác để tắm hộ nhé~');
    const pig = await db.getPig(target.id);
    if (!pig) return warn('Người đó chưa nuôi heo nào~');
    if (pig.sick) return warn('Heo của họ đang bệnh, chủ phải tự chữa trước~');
    if (pig.stage !== 'fed') return warn('Heo của họ chưa tới lúc cần tắm~');
    if (!timeReady(pig)) return warn('Heo của họ vừa ăn xong, chưa tắm được~');
    if (await db.pigSetStage(target.id, 'fed', 'bathed')) return ok(`Cậu đã tắm hộ heo cho <@${target.id}> rồi, tử tế ghê~ 🛁🌸`);
    return warn('Hổng tắm hộ được lúc này~');
}

async function stealPig(thiefId, target) {
    if (!target) return warn('Trộm heo của ai? Gắn @người nhé~ (mà Waguri không khuyến khích đâu 😟)');
    if (target.bot) return warn('Bot không nuôi heo đâu~');
    if (target.id === thiefId) return warn('Tự trộm heo mình làm chi~ 😆');
    const jail = await getJail(thiefId);
    if (jail) return warn(`Cậu đang bị giam, không đi trộm được đâu~ Được thả <t:${Math.floor(jail.until / 1000)}:R>.`);

    const victim = await db.getPig(target.id);
    if (!victim || victim.stage !== 'mature') return warn('Heo của họ chưa trưởng thành để trộm~');
    if (ageMs(victim) < TIMINGS.STEAL_AGE_MS) return warn('Heo của họ mới trưởng thành, phải đợi 15 phút mới trộm được~');

    const e = await db.spendEnergy(thiefId, STEAL.ENERGY);
    if (e < 0) return warn(`Cậu hết năng lượng để đi trộm rồi (cần ${STEAL.ENERGY} ⚡)~`);
    const usedTool = await db.takeItem(thiefId, 'do_trom', 1); // có Đồ Nghề Trộm thì khỏi tốn tiền
    if (!usedTool && !await db.addMoney(thiefId, -COST.STEAL, 'wallet')) return warn(`Cần **${fmt(COST.STEAL)}** ${C} (hoặc 1 **Đồ Nghề Trộm** chế từ gỗ+quặng) để đi trộm~`);

    if (Math.random() < STEAL.SUCCESS) {
        const claim = await db.pigClaimSale(target.id, Math.floor(TIMINGS.STEAL_AGE_MS / 1000));
        if (claim.result === 'ok') {
            await db.giveItemAdmin(thiefId, MEAT[claim.tier], 1);
            return ok(`Cậu lẻn vào trộm trót lọt heo của <@${target.id}> và mang phần thịt về kho! 🙈🍖\n*(Waguri giả vờ không thấy gì~)*`);
        }
        return warn('Heo của họ vừa được bán/trộm mất rồi, cậu hụt ăn~');
    }

    // Thất bại
    const failN = await db.pigStealFail(thiefId);
    let pen = '';
    if (failN >= STEAL.MAX_FAILS) {
        const r = await db.jailOrFine(thiefId, STEAL.FINE, STEAL.JAIL_HOURS, 'trộm heo bị bắt');
        if (r.result === 'jailed') {
            if (await db.useInsurance(thiefId, 'bh_duong_pho')) { await db.halveJail(thiefId); pen = ` Cậu bị **giam** (đã giảm nửa nhờ Bảo Hiểm Học Đường)!`; }
            else pen = ` Trộm hụt 3 lần, cậu bị **giam ${STEAL.JAIL_HOURS}h**! 🚓`;
        } else if (r.result === 'fined') pen = ` Trộm hụt 3 lần, bị phạt **${fmt(STEAL.FINE)}** ${C}!`;
    }
    return errR(`Cậu bị phát hiện khi đang trộm heo, ù té chạy mất dép!${pen} 😣`);
}

async function pigBox(userId, target) {
    const jail = await getJail(userId);
    if (jail) return warn(`Cậu đang bị giam, chưa mở Pigbox được~ Được thả <t:${Math.floor(jail.until / 1000)}:R>.`);
    const receiver = target && !target.bot ? target : null;
    const cd = await db.claimCooldown(userId, 'pigbox', 10);
    if (cd) return warn(`Mở Pigbox liên tục quá~ chờ một chút rồi mở tiếp <t:${Math.floor(cd / 1000)}:R> nhé.`);
    if (await db.claimDailyCounter(userId, 'pigbox', 10) === -1) return warn('Cậu đã mở Pigbox đủ **10 lần hôm nay** rồi, mai quay lại nhé~ 🌸');
    if (!await db.addMoney(userId, -COST_PIGBOX, 'wallet')) return warn(`Cần **${fmt(COST_PIGBOX)}** ${C} để mở Pigbox~`);

    const x = Math.random();
    let reward;
    if (x < 0.50) reward = 800 + Math.floor(Math.random() * 1000);     // 800-1800
    else if (x < 0.80) reward = 1800 + Math.floor(Math.random() * 1000); // 1800-2800
    else if (x < 0.95) reward = 2800 + Math.floor(Math.random() * 1700); // 2800-4500
    else reward = 7000;                                                  // nổ hũ
    await db.addMoney(receiver ? receiver.id : userId, reward, 'wallet');

    const who = receiver ? ` tặng <@${receiver.id}>` : '';
    const big = reward >= 7000 ? ' 💥 **NỔ HŨ!**' : '';
    return res(reward >= 7000 ? 'jackpot' : 'success',
        `Cậu mở Pigbox${who} và nhận được **${fmt(reward)}** ${C}!${big} 🎁🐷`);
}

async function pigStatus(userId) {
    const pig = await db.getPig(userId);
    if (!pig) return info('Cậu chưa nuôi heo. Bắt đầu bằng `muaheo` (1.000) nhé~ 🐷');
    if (pig.sick) return warn('🤒 Heo của cậu đang **bệnh** — dùng `chuabenh` (1.000) để chữa nhé~');
    if (pig.stage === 'mature') {
        const ready = ageMs(pig) >= TIMINGS.STEAL_AGE_MS;
        return info(`🐷 **${pig.type || 'Heo'}** (giá trị **${fmt(pig.tier)}** ${C}) đã trưởng thành.\n${ready ? 'Có thể `banheo` để chế biến & bán rồi!' : `Đợi thêm **${Math.ceil((TIMINGS.STEAL_AGE_MS - ageMs(pig)) / 60000)} phút** rồi \`banheo\` nhé.`}`);
    }
    const ready = timeReady(pig);
    return info(`🐷 Heo đang ở bước **${pig.stage}**.\nViệc tiếp theo: ${STAGE_HINT[pig.stage] || '...'}${ready ? ' (sẵn sàng!)' : ` — đợi **${waitMins(pig)} phút** nữa.`}`);
}

// ---- Prefix dispatcher (w!muaheo, w!heoan, ...) ----
const PIG_CMDS = new Set(['heo', 'muaheo', 'heoan', 'tamheo', 'heongu', 'banheo', 'chuabenh', 'tromheo', 'pigbox']);

async function handlePigPrefix(message, cmd, tokens) {
    const userId = message.author.id;
    const targetUser = message.mentions.users.first() || null;
    let r;
    switch (cmd) {
        case 'heo': r = await pigStatus(userId); break;
        case 'muaheo': r = await buyPig(userId); break;
        case 'heoan': r = await feedPig(userId); break;
        case 'tamheo': r = targetUser ? await bathHelp(userId, targetUser) : await bathePig(userId); break;
        case 'heongu': r = await sleepPig(userId); break;
        case 'banheo': r = await sellPig(userId); break;
        case 'chuabenh': r = await healPig(userId); break;
        case 'tromheo': r = await stealPig(userId, targetUser); break;
        case 'pigbox': r = await pigBox(userId, targetUser); break;
        default: return;
    }
    const embed = buildWaguriEmbed(message, r.type, { title: r.title, description: r.description });
    await message.reply({ embeds: [embed] }).catch(() => {});
}

module.exports = {
    PIG_CMDS, handlePigPrefix,
    buyPig, feedPig, bathePig, sleepPig, healPig, sellPig, bathHelp, stealPig, pigBox, pigStatus,
};
