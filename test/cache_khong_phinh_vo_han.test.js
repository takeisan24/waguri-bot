// ============================================================
// test/cache_khong_phinh_vo_han.test.js — cache của discord.js phải có giới hạn và có người dọn.
//
// VÌ SAO CÓ. Bot chạy với `--max-old-space-size=384` (Startup Command trên panel) — chỉ
// 384MB heap. Mặc định của discord.js thì rất rộng tay, đã kiểm bằng chính bản đang cài:
//   · `Options.DefaultMakeCacheSettings` giới hạn DUY NHẤT `MessageManager: 200` mỗi kênh.
//     `users`, `guildMembers` và mọi cache khác KHÔNG giới hạn.
//   · `Options.DefaultSweeperSettings` chỉ quét `threads`. Message/user/member KHÔNG BAO GIỜ
//     được dọn.
//
// Bot bật `MessageContent` + `GuildMembers` trên 23 server / 2.295 thành viên. Ngày 27-08 nó
// chết sau ~35 tiếng chạy liên tục, và WATCHDOG KHÔNG CỨU ĐƯỢC: watchdog chỉ bắt gateway
// không Ready quá 5 phút, còn hết bộ nhớ thì tiến trình bị giết thẳng — `process.exit` không
// kịp chạy, panel đánh dấu offline rồi để đó hơn hai tiếng.
//
// ⚠️ LIÊN HỆ VỚI VỤ CHẾT LÀ GIẢ THUYẾT, CHƯA PHẢI KẾT LUẬN. `/stats` nay trả `heapUsedMb`
// và `heapLimitMb` — theo dõi vài ngày mới biết. Nhưng cấu hình này đáng có bất kể nguyên
// nhân là gì: một bot 384MB không nên để cache người dùng lớn mãi.
//
// AN TOÀN ĐÃ KIỂM TRƯỚC KHI SIẾT: chỉ ĐÚNG MỘT chỗ trong repo đọc cache thành viên
// (`lib/antinuke/index.js`), và nó đã tự `fetch` khi cache trượt.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Options } = require('discord.js');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8'));

test('mặc định của discord.js ĐÚNG LÀ rộng tay — nền của cả tệp này', () => {
    // Chốt tiền đề lại. Nếu một bản discord.js sau này tự siết mặc định, cổng đỏ và người
    // đọc biết là lập luận bên dưới cần xem lại, thay vì cứ giữ cấu hình theo quán tính.
    const mc = Options.DefaultMakeCacheSettings;
    const sw = Options.DefaultSweeperSettings;

    assert.strictEqual(Object.keys(mc).length, 1,
        `makeCache mặc định nay giới hạn ${Object.keys(mc).length} manager (trước là 1). Mặc định\n`
        + 'đã đổi — đọc lại xem cấu hình trong index.js còn cần thiết không.');
    assert.ok(!sw.users && !sw.guildMembers && !sw.messages,
        'Sweeper mặc định nay đã quét user/member/message — nền của cấu hình trong index.js\n'
        + 'không còn đúng, xem lại.');
});

test('index.js phải khai báo sweepers cho message, user, member', () => {
    const s = src();
    assert.match(s, /sweepers:\s*\{/, 'thiếu khối `sweepers`.');
    for (const k of ['messages', 'users', 'guildMembers']) {
        assert.match(s, new RegExp(`\\b${k}:\\s*\\{`),
            `thiếu sweeper cho \`${k}\` — đây là cache mặc định KHÔNG BAO GIỜ được dọn.`);
    }
    assert.match(s, /\.\.\.Options\.DefaultSweeperSettings/,
        'Phải trải mặc định vào trước, nếu không sweeper `threads` có sẵn bị mất.');
});

test('sweeper user/member phải CHỪA chính bot ra', () => {
    const s = src();
    const soChua = (s.match(/u\.id !== client\.user\?\.id|m\.id !== client\.user\?\.id/g) || []).length;
    assert.strictEqual(soChua, 2,
        `Chỉ ${soChua}/2 filter chừa bot ra. Quét mất chính bot khỏi cache sẽ làm\n`
        + '`guild.members.me` biến mất — mà nó được dùng khắp nơi để kiểm quyền (mở ticket,\n'
        + 'gửi confession, chống nuke). Hỏng theo kiểu im lặng và rất khó truy.');
});

test('makeCache phải siết các manager bot không đọc bao giờ', () => {
    const s = src();
    assert.match(s, /makeCache:\s*Options\.cacheWithLimits\(/, 'thiếu `makeCache`.');
    assert.match(s, /\.\.\.Options\.DefaultMakeCacheSettings/,
        'Phải trải mặc định vào trước — bỏ nó là vô hiệu hoá luôn giới hạn 200 tin/kênh.');
    for (const k of ['PresenceManager', 'ReactionManager', 'GuildInviteManager']) {
        assert.match(s, new RegExp(`${k}:\\s*0`), `\`${k}\` phải đặt 0 — bot không đọc cache này bao giờ.`);
    }
    assert.match(s, /MessageManager:\s*(\d+)/, 'phải đặt giới hạn `MessageManager`.');
    const n = Number(/MessageManager:\s*(\d+)/.exec(s)[1]);
    assert.ok(n > 0 && n <= 200,
        `MessageManager = ${n}. Phải > 0 (0 sẽ phá collector đọc lịch sử) và <= 200 (mặc định).`);
});

test('cấu hình này DỰNG ĐƯỢC thật, và filter không nổ khi client.user còn null', () => {
    // Quét chữ không chứng minh được nó chạy. Dựng client thật với đúng hình dạng đó.
    const client = new Client({
        intents: [GatewayIntentBits.Guilds],
        sweepers: {
            ...Options.DefaultSweeperSettings,
            messages: { interval: 600, lifetime: 1800 },
            users: { interval: 3600, filter: () => (u) => u.id !== client.user?.id },
            guildMembers: { interval: 3600, filter: () => (m) => m.id !== client.user?.id },
        },
        makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            MessageManager: 50, PresenceManager: 0, ReactionManager: 0, GuildInviteManager: 0,
        }),
    });

    const sw = client.options.sweepers;
    assert.ok(sw.threads, 'sweeper `threads` mặc định bị mất — thiếu trải DefaultSweeperSettings.');
    assert.strictEqual(sw.messages.lifetime, 1800);

    // `client.user` còn null lúc này (chưa login). Filter phải chịu được — nếu viết
    // `client.user.id` thay vì `client.user?.id` thì sweeper đầu tiên sẽ ném và chết im.
    assert.doesNotThrow(() => {
        const f = sw.users.filter();
        f({ id: '123' });
        sw.guildMembers.filter()({ id: '123' });
    }, 'Filter ném lỗi khi `client.user` chưa có — sweeper sẽ chết ngay lượt quét đầu.');
});
