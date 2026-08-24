// ============================================================
// test/helpers/sqlCatalog.js — Dựng lại trạng thái catalog `items` + `market_prices`
// bằng cách replay các migration theo thứ tự (migration sau đè migration trước).
//
// LÝ DO: giá MUA sống trong SQL (`items.price`), giá BÁN chợ sống trong JS
// (`src/lib/market.js`) và trong SQL seed (`market_prices`). BA nguồn cho MỘT con số.
// Chính khoảng hở đó sinh ra máy in tiền (mua 60 -> bán 400). Helper này cho phép
// test/economy.invariants.test.js đối chiếu cả ba mà KHÔNG cần kết nối DB.
//
// Giới hạn đã biết: parser thô, chỉ hiểu INSERT/UPDATE/DELETE dạng migration repo này
// đang dùng. Nó KHÔNG thay thế truy vấn DB thật — nó là lưới bắt DRIFT lúc commit.
//
// 2026-08-24: parser từng ĐỨNG YÊN Ở TRẠNG THÁI TRƯỚC 0068 suốt nhiều tháng, lệch prod 7/90
// món, vì nó không đọc khối `DO $$`. Cả hai bên vẫn đếm ra 90 món nên không cổng nào thấy —
// drift kiểu ĐỔI TÊN thì đếm số lượng là mù. Nay có hai lớp:
//   1. `applyRenames()` dưới đây đọc khối đổi tên (nhận diện qua alias `AS m(oldid, newid)`).
//   2. `test/sqlcatalog_khop_prod.test.js` đối chiếu TẬP ID với `scripts/db-catalog-ids.json`
//      (tệp do `scripts/db-catalog.js` sinh từ prod, có cổng `--check` neo lại mỗi lần push).
// Lớp 2 mới là thứ đáng tin: migration sau viết theo lối khác thì lớp 1 hụt, lớp 2 báo đỏ
// và nói thẳng cần thêm gì. ĐỪNG bỏ lớp 2 để đi làm parser SQL cho tổng quát.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const MIG_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

/** Bỏ comment để không parse nhầm ví dụ trong ghi chú. */
function stripComments(sql) {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Tách chuỗi theo dấu phẩy cấp cao nhất, tôn trọng chuỗi 'có, dấu phẩy'. */
function splitTopLevel(s) {
    const out = [];
    let cur = '', inStr = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            cur += c;
            if (c === "'") {
                if (s[i + 1] === "'") { cur += "'"; i++; }
                else inStr = false;
            }
            continue;
        }
        if (c === "'") { inStr = true; cur += c; continue; }
        if (c === ',') { out.push(cur.trim()); cur = ''; continue; }
        cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

/**
 * Đọc danh sách tuple `(...), (...)` ngay sau VALUES.
 * Dừng khi hết chuỗi tuple (gặp ON CONFLICT / ; / từ khoá khác) — nếu không,
 * dấu ngoặc của `ON CONFLICT (id) DO UPDATE` sẽ bị hiểu nhầm là một tuple.
 */
function readTuples(s) {
    const tuples = [];
    let i = 0;
    for (;;) {
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] !== '(') break;
        i++;
        let depth = 1, cur = '', inStr = false;
        for (; i < s.length && depth > 0; i++) {
            const c = s[i];
            if (inStr) {
                cur += c;
                if (c === "'") {
                    if (s[i + 1] === "'") { cur += "'"; i++; }
                    else inStr = false;
                }
                continue;
            }
            if (c === "'") { inStr = true; cur += c; continue; }
            if (c === '(') depth++;
            if (c === ')') { depth--; if (depth === 0) break; }
            cur += c;
        }
        i++; // qua dấu ')'
        tuples.push(cur);
        while (i < s.length && /\s/.test(s[i])) i++;
        if (s[i] !== ',') break;
        i++;
    }
    return tuples;
}

/** '60' -> 60 · NULL -> null · 'f' -> false · giữ chuỗi thô cho tên. */
function unquote(v) {
    const t = v.trim();
    if (/^null$/i.test(t)) return null;
    if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    return t;
}
function toBool(v) {
    const t = String(unquote(v)).toLowerCase();
    return t === 't' || t === 'true';
}

/**
 * Áp các cặp đổi tên id trong một migration.
 *
 * Repo dùng một lối viết duy nhất cho việc này (xem `0068_rename_item_ids.sql`):
 *     FOR r IN SELECT * FROM (VALUES ('cu','moi'), ... ) AS m(oldid, newid) LOOP
 * Neo vào alias `(oldid, newid)` cho hẹp — bám `VALUES` trơn sẽ nuốt nhầm mọi VALUES khác.
 *
 * Migration copy TOÀN BỘ cột sang id mới rồi mới xoá id cũ, nên ở đây chuyển nguyên bản ghi
 * thay vì dựng mới: giá và cờ ẩn phải đi theo. (Đã đối chiếu prod 24-08: cả 7 cặp giữ nguyên giá.)
 */
function applyRenames(sql, items, marketSeed, file) {
    const re = /\(\s*values\s*([\s\S]*?)\)\s*as\s+\w+\s*\(\s*oldid\s*,\s*newid\s*\)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
        for (const tup of readTuples(m[1])) {
            const [cu, moi] = splitTopLevel(tup).map(unquote);
            if (!cu || !moi) continue;
            const ban = items.get(cu);
            if (ban) { items.set(moi, { ...ban, source: file }); items.delete(cu); }
            if (marketSeed.delete(cu)) marketSeed.add(moi);
        }
    }
}

/**
 * Replay migration -> trạng thái catalog.
 * @returns {{items: Map<string,{price:number, shopHidden:boolean, source:string}>,
 *            marketSeed: Set<string>}}
 */
function buildCatalog() {
    const items = new Map();
    const marketSeed = new Set();
    const files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        const sql = stripComments(fs.readFileSync(path.join(MIG_DIR, file), 'utf8'));

        // ---- INSERT INTO items (cols) VALUES (...), (...) ----
        const insRe = /insert\s+into\s+(?:public\.)?items\s*\(([^)]*)\)\s*values/gi;
        let m;
        while ((m = insRe.exec(sql)) !== null) {
            const cols = m[1].split(',').map(c => c.trim().toLowerCase());
            const iId = cols.indexOf('id');
            const iPrice = cols.indexOf('price');
            const iHidden = cols.indexOf('shop_hidden');
            if (iId === -1) continue;
            for (const tup of readTuples(sql.slice(insRe.lastIndex))) {
                const vals = splitTopLevel(tup);
                const id = unquote(vals[iId] ?? '');
                if (!id || typeof id !== 'string') continue;
                const prev = items.get(id) || { price: 0, shopHidden: false, source: file };
                const next = { ...prev, source: file };
                if (iPrice !== -1 && vals[iPrice] != null) next.price = Number(unquote(vals[iPrice]));
                if (iHidden !== -1 && vals[iHidden] != null) next.shopHidden = toBool(vals[iHidden]);
                items.set(id, next);
            }
        }

        // ---- UPDATE items SET ... price = N ... WHERE id IN (...) | id = 'x' ----
        const updRe = /update\s+(?:public\.)?items\s+set\s+([\s\S]*?)\s+where\s+([\s\S]*?);/gi;
        while ((m = updRe.exec(sql)) !== null) {
            const setClause = m[1];
            const whereClause = m[2];
            const priceM = setClause.match(/\bprice\s*=\s*'?(\d+)'?/i);
            const hiddenM = setClause.match(/\bshop_hidden\s*=\s*'?(t|f|true|false)'?/i);
            if (!priceM && !hiddenM) continue;
            const inM = whereClause.match(/\bid\s+in\s*\(([^)]*)\)/i);
            const eqM = whereClause.match(/\bid\s*=\s*'([^']+)'/i);
            const targets = inM
                ? splitTopLevel(inM[1]).map(unquote)
                : (eqM ? [eqM[1]] : []);
            for (const id of targets) {
                const prev = items.get(id);
                if (!prev) continue;
                if (priceM) prev.price = Number(priceM[1]);
                if (hiddenM) prev.shopHidden = /^(t|true)$/i.test(hiddenM[1]);
                prev.source = file;
            }
        }

        // ---- market_prices: INSERT rồi DELETE (0096 dọn id sai của 0095) ----
        const mpRe = /insert\s+into\s+(?:public\.)?market_prices\s*\(([^)]*)\)\s*values/gi;
        while ((m = mpRe.exec(sql)) !== null) {
            const cols = m[1].split(',').map(c => c.trim().toLowerCase());
            const iId = cols.indexOf('item_id');
            if (iId === -1) continue;
            for (const tup of readTuples(sql.slice(mpRe.lastIndex))) {
                const id = unquote(splitTopLevel(tup)[iId] ?? '');
                if (id) marketSeed.add(id);
            }
        }
        const delRe = /delete\s+from\s+(?:public\.)?market_prices\s+where\s+item_id\s+in\s*\(([^)]*)\)/gi;
        while ((m = delRe.exec(sql)) !== null) {
            for (const id of splitTopLevel(m[1]).map(unquote)) marketSeed.delete(id);
        }

        // Đổi tên áp CUỐI CÙNG trong mỗi tệp: id mới phải kế thừa trạng thái mà chính tệp
        // này vừa ghi cho id cũ, không phải trạng thái từ tệp trước.
        applyRenames(sql, items, marketSeed, file);
    }

    return { items, marketSeed };
}

module.exports = { buildCatalog };
