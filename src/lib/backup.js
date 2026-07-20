// lib/backup.js — Dump các bảng dữ liệu người chơi (dùng chung cho CLI + auto-backup).
const { supabase } = require('../database');

// Bảng dữ liệu động (bỏ items/jobs vì đã nằm trong migration seed).
const TABLES = [
    'users', 'inventory', 'cooldowns', 'achievements', 'quest_progress',
    'user_pets', 'pigs', 'plants', 'clans', 'loans', 'market_listings',
    'guild_settings', 'guild_members', 'daily_counters', 'game_event',
];

/** Trả object { table: rows[] } (bảng lỗi -> { __error }). */
async function dumpAll() {
    const dump = {};
    for (const t of TABLES) {
        try {
            let rows = [], from = 0;
            const PAGE = 1000;
            while (true) {
                const { data, error } = await supabase.from(t).select('*').range(from, from + PAGE - 1);
                if (error) throw error;
                rows.push(...data);
                if (data.length < PAGE) break;
                from += PAGE;
            }
            dump[t] = rows;
        } catch (e) {
            dump[t] = { __error: e.message };
        }
    }
    return dump;
}

module.exports = { dumpAll, TABLES };
