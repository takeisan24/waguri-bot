// Quét mọi key i18n dùng qua t() trong src/ và đối chiếu với vi.json/en.json.
// Nguyên tắc: key có root 'data'/'items' được PHÉP thiếu (t() trả undefined -> call-site
// dùng `|| tênDB` làm fallback, không leak). Mọi root khác mà thiếu -> leak raw key.
// Trả về DANH SÁCH "thiếu" đã chuẩn hoá & sắp xếp để test so với baseline (ratchet).
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src');
const vi = require(path.join(SRC, 'locales', 'vi.json'));
const en = require(path.join(SRC, 'locales', 'en.json'));

function flatten(obj, prefix, out) {
    for (const k of Object.keys(obj)) {
        const key = prefix ? prefix + '.' + k : k;
        const v = obj[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
        else out.add(key);
    }
    return out;
}
const viKeys = flatten(vi, '', new Set());
const enKeys = flatten(en, '', new Set());
const hasChildren = (prefix, set) => {
    for (const k of set) if (k === prefix || k.startsWith(prefix + '.')) return true;
    return false;
};
const SAFE_ROOT = (root) => root === 'data' || root === 'items' || root === 'titles'; // trả undefined -> fallback id/DB

function walk(dir, acc) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p, acc);
        else if (f.endsWith('.js')) acc.push(p);
    }
    return acc;
}

// Regex neo vào lời gọi t( … , <key> ) — tránh bắt nhầm literal không phải key
//  - static/template:  t(<arg>, 'KEY')  |  t(<arg>, `KEY${x}`)
const RE_KEY = /\bt\(\s*[^,]+?,\s*([`'"])([^`'"]*(?:\$\{[^}]*\}[^`'"]*)*)\1/g;
//  - concat:           t(<arg>, 'PREFIX.' + var)
const RE_CONCAT = /\bt\(\s*[^,]+?,\s*(['"])([a-zA-Z0-9_.]*\.)\1\s*\+/g;

/** @returns {string[]} danh sách "thiếu" đã sort & dedup (mỗi phần tử là key tĩnh hoặc "prefix.*") */
function scanMissing() {
    const files = walk(SRC, []);
    const missing = new Set();

    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');

        let m;
        RE_KEY.lastIndex = 0;
        while ((m = RE_KEY.exec(src)) !== null) {
            const raw = m[2];
            const root = raw.split('.')[0].split('${')[0];
            if (!root || root.includes('${') || SAFE_ROOT(root)) continue;

            if (raw.includes('${') || raw.endsWith('.')) {
                // key động -> lấy NAMESPACE cha = phần tới dấu '.' cuối TRƯỚC ${.
                //   'commands.masoi.roles.${id}.name' -> 'commands.masoi.roles'
                //   'lib.newbie.step_${i}'           -> 'lib.newbie'   (step_ dính liền, không phải namespace)
                //   'commands.image.title_${cat}'    -> 'commands.image'
                const before = raw.split('${')[0];
                const lastDot = before.lastIndexOf('.');
                const prefix = lastDot >= 0 ? before.slice(0, lastDot) : before;
                if (!prefix) continue;
                if (!hasChildren(prefix, viKeys) || !hasChildren(prefix, enKeys)) missing.add(prefix + '.*');
            } else {
                // key tĩnh -> phải có ở cả vi và en
                if (!/^[a-zA-Z0-9_.]+$/.test(raw)) continue;
                if (!viKeys.has(raw) || !enKeys.has(raw)) missing.add(raw);
            }
        }

        RE_CONCAT.lastIndex = 0;
        while ((m = RE_CONCAT.exec(src)) !== null) {
            const prefix = m[2].replace(/\.$/, '');
            const root = prefix.split('.')[0];
            if (SAFE_ROOT(root)) continue;
            if (!hasChildren(prefix, viKeys) || !hasChildren(prefix, enKeys)) missing.add(prefix + '.*');
        }
    }

    return [...missing].sort();
}

module.exports = { scanMissing, viKeys, enKeys };
