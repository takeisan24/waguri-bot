// Trò chơi nối từ tiếng Việt (state trong RAM theo kênh). Quy tắc: cụm 2 tiếng,
// tiếng đầu của cụm mới = tiếng cuối của cụm trước; không lặp; không đi 2 lượt liên tiếp.
// Không kiểm tra từ điển (giữ nhẹ) — chỉ kiểm tra quy tắc nối.

const db = require('../database.js');
const config = require('../config');

const games = new Map(); // channelId -> { lastWord, used:Set, lastPlayer, count }
const START = ['con cá', 'hoa hồng', 'bầu trời', 'mặt trời', 'học sinh', 'cà phê', 'nụ cười', 'dòng sông', 'mây trắng', 'bông lúa'];

// Chống farm xu/EXP: cooldown + cap ngày cho phần THƯỞNG (nước đi vẫn tính bình thường).
const rewardCD = new Map();    // userId -> hết cooldown (ms)
const rewardDaily = new Map(); // userId -> { date, count }
setInterval(() => {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    for (const [uid, exp] of rewardCD) if (exp < now) rewardCD.delete(uid);
    for (const [uid, d] of rewardDaily) if (d.date !== today) rewardDaily.delete(uid);
    // Dọn ván nối từ bị bỏ dở > 1h (chống rò bộ nhớ: Map games không tự xóa nếu không /noitu stop).
    for (const [cid, g] of games) if (now - (g.lastAt || 0) > 60 * 60 * 1000) games.delete(cid);
}, 30 * 60 * 1000).unref();

/** Trả true nếu được phép thưởng lần này (đồng thời ghi nhận cooldown + cap ngày). */
function canRewardNoitu(userId) {
    const now = Date.now();
    if (now < (rewardCD.get(userId) || 0)) return false;
    const today = new Date().toISOString().slice(0, 10);
    const d = rewardDaily.get(userId);
    if (d && d.date === today) {
        if (d.count >= config.NOITU.DAILY_CAP) return false;
        d.count++;
    } else {
        rewardDaily.set(userId, { date: today, count: 1 });
    }
    rewardCD.set(userId, now + config.NOITU.COOLDOWN_MS);
    return true;
}

function startGame(channelId) {
    const phrase = START[Math.floor(Math.random() * START.length)];
    const lastWord = phrase.split(' ')[1];
    games.set(channelId, { lastWord, used: new Set([phrase]), lastPlayer: null, count: 0, lastAt: Date.now() });
    return { phrase, lastWord };
}
function stopGame(channelId) {
    const g = games.get(channelId);
    games.delete(channelId);
    return g;
}
function getGame(channelId) {
    return games.get(channelId);
}

// Xử lý 1 tin nhắn cho ván đang chạy (gọi từ messageCreate). React theo kết quả.
async function handleMessage(message) {
    const g = games.get(message.channelId);
    if (!g) return;

    const content = message.content.trim().toLowerCase();
    const tokens = content.split(/\s+/);
    if (tokens.length !== 2) return;                 // chỉ xử lý cụm đúng 2 tiếng
    if (!/^\p{L}+$/u.test(tokens[0]) || !/^\p{L}+$/u.test(tokens[1])) return; // chỉ chữ cái

    if (tokens[0] !== g.lastWord) return message.react('❌').catch(() => {});  // sai tiếng nối
    if (g.used.has(content)) return message.react('♻️').catch(() => {});        // đã dùng
    if (g.lastPlayer === message.author.id) return message.react('⏳').catch(() => {}); // 2 lượt liên tiếp

    g.lastWord = tokens[1];
    g.used.add(content);
    g.lastPlayer = message.author.id;
    g.count++;
    g.lastAt = Date.now();
    message.react('✅').catch(() => {});
    // Thưởng nối đúng — chỉ khi qua cooldown + chưa chạm cap ngày (chống 2 acc luân phiên farm).
    if (canRewardNoitu(message.author.id)) {
        db.addMoney(message.author.id, config.NOITU.COINS, 'wallet');
        db.updateExp(message.author.id, config.NOITU.EXP);
    }
}

module.exports = { startGame, stopGame, getGame, handleMessage };
