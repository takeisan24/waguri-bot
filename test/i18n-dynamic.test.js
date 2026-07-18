// CI guard #2 cho i18n — bổ sung cho test/i18n-coverage.test.js (vốn phủ key TĨNH + tồn
// tại NAMESPACE của key động). File này phủ 2 thứ mà guard kia không phủ:
//
//  (A) TẦNG GIÁ TRỊ của key động: với các enum lấy TRỰC TIẾP từ code (import, tự cập nhật
//      khi thêm value mới), assert MỌI value có key locale ở cả vi + en. Nhờ import, thêm 1
//      loài pet / vai masoi / gói premium mới mà quên key locale -> test đỏ ngay.
//      (Các prefix động khác không export được enum thì đã có guard tồn-tại-namespace + việc
//       thêm key locale đi kèm; đây bọc các domain "hay lớn lên" nhất.)
//
//  (B) LOCALIZATION mô tả slash: load thật mọi command, chạy localizeCommandJSON, assert MỌI
//      command/subcommand/option đều có 'en-US' trong description_localizations. Lệnh/sub/option
//      mới không thêm vào commandLocalizer -> EN client thấy tiếng Việt -> test đỏ.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { viKeys, enKeys } = require('./helpers/i18nScan');
const { SPECIES } = require('../src/data/pets');
const { ROLES } = require('../src/lib/masoi/engine');
const config = require('../src/config');
const { localizeCommandJSON } = require('../src/lib/commandLocalizer');

// ---- (A) Value-level coverage cho các enum import được ----
test('i18n: mọi value enum (pet species / masoi roles / premium plans) có key locale (vi+en)', () => {
    const required = [];
    for (const s of SPECIES) required.push(`species.${s.id}`);
    for (const id of Object.keys(ROLES)) { required.push(`commands.masoi.roles.${id}.name`); required.push(`commands.masoi.roles.${id}.desc`); }
    for (const k of Object.keys(config.PREMIUM.PLANS)) required.push(`commands.premium.plans.${k}`);

    const missing = required.filter(k => !viKeys.has(k) || !enKeys.has(k));
    assert.ok(
        missing.length === 0,
        `\n❌ ${missing.length} value động thiếu key locale (thêm vào src/locales/{vi,en}.json):\n` +
        missing.map(k => '   + ' + (viKeys.has(k) ? '' : 'vi ') + (enKeys.has(k) ? '' : 'en ') + k).join('\n') + '\n'
    );
});

// ---- (B) Slash command/subcommand/option đều được localize (có en-US) ----
function walk(dir, acc) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p, acc);
        else if (f.endsWith('.js')) acc.push(p);
    }
    return acc;
}

test('i18n: mọi mô tả slash command/subcommand/option có bản EN (không lẫn VN cho client EN)', () => {
    const offenders = [];
    const hasEn = (node) => !!(node.description_localizations && node.description_localizations['en-US']);
    const scan = (parent, opts) => {
        for (const o of (opts || [])) {
            if (o.type === 1 || o.type === 2) {
                if (!hasEn(o)) offenders.push(`${parent}.${o.name} (subcommand)`);
                scan(`${parent}.${o.name}`, o.options);
            } else {
                if (!hasEn(o)) offenders.push(`${parent}.${o.name} (option)`);
            }
        }
    };

    for (const file of walk(path.join(__dirname, '..', 'src', 'commands'), [])) {
        const mod = require(file);
        if (!mod || !mod.data || typeof mod.data.toJSON !== 'function') continue;
        const json = localizeCommandJSON(mod.data.toJSON());
        // Context-menu command (type 2=USER, 3=MESSAGE) KHÔNG có description theo Discord -> bỏ qua.
        const isContextMenu = json.type === 2 || json.type === 3;
        if (!isContextMenu && !hasEn(json)) offenders.push(`${json.name} (command)`);
        scan(json.name, json.options);
    }

    assert.ok(
        offenders.length === 0,
        `\n❌ ${offenders.length} mô tả slash thiếu bản 'en-US' — thêm vào COMMAND_/SUBCOMMAND_/OPTION_DESCRIPTIONS trong src/lib/commandLocalizer.js:\n` +
        offenders.map(o => '   + ' + o).join('\n') + '\n'
    );
});
