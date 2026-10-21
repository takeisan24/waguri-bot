// Nút Link phải lấy domain web từ MỘT nguồn (`config.WEB_URL`) — test HỒI QUY.
//
// Bối cảnh (feedback 2026-10-21): nút "🎧 Phòng Học Lo-Fi Web" của lời nhắc đồng hành ghi
// cứng `https://waguri.org/study` — domain đó không phải của Waguri, trả 404. Ba nút khác
// ghi cứng `waguri-bot.vercel.app` nên đúng do may, và sẽ sai cùng lúc nếu đổi domain.
// Cùng đợt: link mời dự phòng `discord.gg/waguri` dẫn vào server của NGƯỜI KHÁC.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

test('mọi .setURL() trỏ web Waguri đều đi qua config.WEB_URL', () => {
    const loi = [];
    for (const tep of duyet(SRC)) {
        fs.readFileSync(tep, 'utf8').split(/\r?\n/).forEach((dong, i) => {
            const m = dong.match(/\.setURL\(\s*(['"`])(https?:\/\/[^'"`]+)\1/);
            if (!m) return;
            const url = m[2];
            // Link Discord (mời server, discord.com) không phải web Waguri.
            if (/^https:\/\/(discord\.gg|discord\.com|top\.gg|discordbotlist\.com)\//.test(url)) return;
            loi.push(`${path.relative(SRC, tep)}:${i + 1}  ${url}`);
        });
    }
    assert.deepStrictEqual(loi, [], 'Ghi cứng domain — dùng `${config.WEB_URL}/...`');
});

test('link mời support dự phòng trỏ đúng server Waguri', () => {
    const src = fs.readFileSync(path.join(SRC, 'config', 'index.js'), 'utf8');
    assert.doesNotMatch(src, /discord\.gg\/waguri\b/, 'discord.gg/waguri là server của người khác');
    assert.match(src, /SUPPORT_INVITE: process\.env\.SUPPORT_INVITE \|\| 'https:\/\/discord\.gg\/zbJ4SBaMhE'/);
    assert.match(src, /SUPPORT_GUILD_ID: process\.env\.SUPPORT_GUILD_ID \|\| '1438048705046515798'/,
        'ID cũ 1517931376865710120 là ID KÊNH, không phải server');
});
