// ============================================================
// lib/masoi/engine.js — Logic THUẦN cho Ma Sói (không đụng Discord -> dễ test).
// ============================================================

const ROLES = {
    werewolf: { id: 'werewolf', name: 'Sói', emoji: '🐺', team: 'wolves', desc: 'Mỗi đêm cùng bầy chọn 1 người để cắn.' },
    villager: { id: 'villager', name: 'Dân làng', emoji: '👤', team: 'village', desc: 'Không có năng lực, dùng suy luận để tìm Sói.' },
    seer: { id: 'seer', name: 'Tiên tri', emoji: '🔮', team: 'village', desc: 'Mỗi đêm soi 1 người để biết có phải Sói không.' },
    guard: { id: 'guard', name: 'Bảo vệ', emoji: '🛡️', team: 'village', desc: 'Mỗi đêm bảo vệ 1 người khỏi bị cắn (không che cùng người 2 đêm liền).' },
    witch: { id: 'witch', name: 'Phù thủy', emoji: '🧙', team: 'village', desc: 'Có 1 bình cứu + 1 bình độc (mỗi loại 1 lần cả ván).' },
    hunter: { id: 'hunter', name: 'Thợ săn', emoji: '🏹', team: 'village', desc: 'Khi chết, được bắn chết 1 người theo.' },
};

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

/** Số sói theo số người chơi. */
function wolfCount(n) { return n >= 12 ? 3 : n >= 8 ? 2 : 1; }

/** Gán vai cho danh sách id. Trả { id: roleId }. */
function assignRoles(ids) {
    const n = ids.length;
    const pool = [];
    for (let i = 0; i < wolfCount(n); i++) pool.push('werewolf');
    pool.push('seer');
    if (n >= 6) pool.push('guard');
    if (n >= 7) pool.push('witch');
    if (n >= 8) pool.push('hunter');
    while (pool.length < n) pool.push('villager');
    const order = shuffle(pool);
    const roles = {};
    ids.forEach((id, i) => { roles[id] = order[i]; });
    return roles;
}

/** Kiểm tra thắng. players: { id: {role, alive} }. Trả 'wolves' | 'village' | null. */
function checkWin(players) {
    const alive = Object.values(players).filter(p => p.alive);
    const wolves = alive.filter(p => ROLES[p.role].team === 'wolves').length;
    const others = alive.length - wolves;
    if (wolves === 0) return 'village';
    if (wolves >= others) return 'wolves';
    return null;
}

/**
 * Giải quyết đêm. actions: { wolfVotes:{wolfId:targetId}, guard:targetId, witchHeal:bool, witchPoison:targetId }
 * Trả { victim, deaths:[ids] } (victim = người bị sói nhắm, deaths = thực sự chết đêm đó).
 */
function resolveNight(actions = {}) {
    const tally = {};
    for (const t of Object.values(actions.wolfVotes || {})) if (t) tally[t] = (tally[t] || 0) + 1;
    let victim = null, max = 0;
    for (const [t, c] of Object.entries(tally)) if (c > max) { max = c; victim = t; }

    const deaths = new Set();
    if (victim) {
        const guarded = actions.guard === victim;
        const healed = !!actions.witchHeal;
        if (!guarded && !healed) deaths.add(victim);
    }
    if (actions.witchPoison) deaths.add(actions.witchPoison);
    return { victim, deaths: [...deaths] };
}

/** Đếm phiếu treo cổ. votes: { voterId: targetId }. Trả id bị treo, hoặc null nếu hòa/không ai. */
function tallyVotes(votes = {}) {
    const t = {};
    for (const tg of Object.values(votes)) if (tg) t[tg] = (t[tg] || 0) + 1;
    let best = null, max = 0, tie = false;
    for (const [id, c] of Object.entries(t)) {
        if (c > max) { max = c; best = id; tie = false; }
        else if (c === max) tie = true;
    }
    return tie ? null : best;
}

module.exports = { ROLES, wolfCount, assignRoles, checkWin, resolveNight, tallyVotes, shuffle };
