// test/phep_do_phai_den_duoc_mat_nguoi_doc.test.js
//
// VÌ SAO CÓ. Ngày 25-10-2026, khi dựng phép đo cho nhóm lỗi ack/10062, tôi gắn `ping` và
// `rest` làm hai khoá meta của `logError(...)`. Chúng **bị nuốt im lặng**: `logger.js` chỉ
// render `command`, `user`, `guild`. Nếu không bắt kịp thì tôi đã deploy một phép đo KHÔNG
// ĐO GÌ, mà vẫn trông như đã làm — và lần vỡ sau vẫn mù đúng như trước, chỉ thêm cảm giác
// đã xử lý.
//
// Đó chính là lớp lỗi "làm rồi không kiểm kết quả rồi báo thành công" mà repo đã vá 5 đợt,
// lần này ở một tầng mới: **không phải lời GHI bị bỏ trôi, mà là phép ĐO bị bỏ trôi.** Nên
// cổng này không đọc mã — nó **chạy thật** chuỗi đo và bắt đúng payload gửi lên webhook.
// Khoá bằng hành vi thì không ai "sửa cho xanh" được bằng cách đổi tên biến.
const { test } = require('node:test');
const assert = require('node:assert');

/** Chạy `fn` với `global.fetch` bị thay, trả về mọi payload đã gửi. */
async function batWebhook(fn) {
    const thatSu = global.fetch;
    const cu = process.env.LOG_WEBHOOK_URL;
    process.env.LOG_WEBHOOK_URL = 'https://discord.com/api/webhooks/0/test';
    const daGui = [];
    global.fetch = async (_url, opt) => {
        daGui.push(JSON.parse(opt.body));
        return { ok: true };
    };
    try { await fn(); } finally {
        global.fetch = thatSu;
        if (cu === undefined) delete process.env.LOG_WEBHOOK_URL; else process.env.LOG_WEBHOOK_URL = cu;
    }
    return daGui;
}

test('logger: trường `note` PHẢI ra tới tin nhắn, không bị nuốt', async () => {
    const { logError } = require('../src/lib/logger');
    const dau = `ping-thu-${Date.now()}`;
    const gui = await batWebhook(() => logError(`tiêu đề ${Date.now()}`, new Error('loi thu'), {
        command: '/thu', note: dau,
    }));

    assert.strictEqual(gui.length, 1, 'logError phải gửi đúng một tin.');
    const desc = gui[0].embeds[0].description;
    assert.ok(desc.includes(dau),
        'Nội dung `note` KHÔNG có trong tin gửi đi — khoá meta đang bị nuốt im lặng.\n'
        + 'Đây đúng là lỗi tôi suýt deploy ngày 25-10-2026: phép đo trông như đã làm mà\n'
        + `không đo gì. Nội dung thật gửi đi:\n${desc}`);
});

test('logger: gộp trùng vẫn theo DÒNG ĐẦU của lỗi, `note` đổi không phá cách gộp', async () => {
    const { logError } = require('../src/lib/logger');
    const tieuDe = `trùng-${Date.now()}`;
    // Hai lần cùng (tiêu đề + dòng đầu), chỉ khác `note`. Lần hai phải bị gộp -> không gửi.
    const gui = await batWebhook(async () => {
        await logError(tieuDe, new Error('cùng một dòng đầu'), { note: 'ping 50ms' });
        await logError(tieuDe, new Error('cùng một dòng đầu'), { note: 'ping 9999ms' });
    });
    assert.strictEqual(gui.length, 1,
        'Số đo biến thiên không được làm mỗi tin thành một khoá riêng — nếu không, kênh log\n'
        + 'bị spam và chính phép đo làm hỏng thứ nó đang đo. Đó là lý do `note` là trường\n'
        + 'riêng chứ không nhồi vào `err.message`.');
});

test('canhAck: cảnh báo ack mang theo ping VÀ trạng thái hạn mức REST', async () => {
    const { theoDoiAck } = require('../src/lib/canhAck');

    // Interaction đã "già" 2.4 giây và chưa ack -> đồng hồ còn ~100ms rồi nổ.
    const interaction = {
        createdTimestamp: Date.now() - 2400,
        replied: false,
        deferred: false,
        user: { id: '1' },
        guildId: '2',
        client: { ws: { ping: 123 } },
    };

    const gui = await batWebhook(async () => {
        theoDoiAck(interaction, '/thu-nghiem');
        await new Promise(r => setTimeout(r, 400));
    });

    assert.strictEqual(gui.length, 1, 'canhAck phải báo đúng một lần khi quá hạn mà chưa ack.');
    const desc = gui[0].embeds[0].description;
    assert.match(desc, /\*\*Đo được:\*\*/,
        'Tin cảnh báo ack thiếu dòng "Đo được" — phép đo không tới được mắt người đọc.');
    assert.match(desc, /ping 123ms/,
        'Thiếu ping. Không có nó thì không phân biệt được chậm do mạng với chậm do xếp hàng.');
    assert.match(desc, /REST:/,
        'Thiếu trạng thái hạn mức REST. Đó là phép đo DUY NHẤT phân biệt được hai nghi phạm\n'
        + 'còn lại của nhóm ack/10062 (xếp hàng vs jitter mạng) — xem đầu `lib/canhRest.js`.');
});

test('canhAck: ack kịp thì KHÔNG báo gì (phép đo không được tự sinh nhiễu)', async () => {
    const { theoDoiAck } = require('../src/lib/canhAck');
    const interaction = {
        createdTimestamp: Date.now() - 2400,
        replied: false, deferred: false,
        user: { id: '1' }, guildId: '2',
        client: { ws: { ping: 10 } },
    };
    const gui = await batWebhook(async () => {
        const canh = theoDoiAck(interaction, '/kip');
        interaction.deferred = true;   // lệnh đã ack
        canh.xong(false);
        await new Promise(r => setTimeout(r, 300));
    });
    assert.strictEqual(gui.length, 0,
        `Đã ack kịp mà vẫn báo lỗi — cổng này chặn việc thêm nhiễu vào kênh log đang có 42%\n`
        + `là cảnh báo ANTI-NUKE. Gửi đi: ${JSON.stringify(gui)}`);
});

// ĐƯỜNG NÚT — phép thử này bù một lỗ trong chính bộ test này.
//
// Phép thử "ack kịp thì không báo gì" ở trên gọi `canh.xong()`, mà `xong()` làm
// `clearTimeout`. Nên nó kiểm cái đồng hồ ĐÃ BỊ HUỶ, không kiểm cửa `daAck`. Phá cửa
// `daAck` trong mã mà cổng vẫn xanh — phép bẻ ngược 25-10 bắt được đúng chỗ đó.
//
// Cửa `daAck` mới là thứ DUY NHẤT che đường nút: `interactionCreate.js` cố ý KHÔNG giữ
// `xong()` cho nhánh nút (hàng chục đường return sớm, tái cấu trúc rủi ro hơn lợi ích).
// Vỡ cửa đó thì mọi nút ack bình thường mà tổng thời gian vượt 2,5s đều bị báo oan — tức
// phép đo tự bơm nhiễu vào đúng cái kênh nó đang cố làm sạch.
test('canhAck đường NÚT: đã ack mà không ai gọi xong() thì vẫn phải im', async () => {
    const { theoDoiAck } = require('../src/lib/canhAck');
    const interaction = {
        createdTimestamp: Date.now() - 2400,
        replied: false, deferred: false,
        user: { id: '1' }, guildId: '2',
        client: { ws: { ping: 10 } },
    };
    const gui = await batWebhook(async () => {
        theoDoiAck(interaction, `nút thu-${Date.now()}`);   // KHÔNG giữ `xong()`, như nhánh nút thật
        interaction.deferred = true;                         // handler đã deferUpdate()
        await new Promise(r => setTimeout(r, 400));          // để đồng hồ nổ
    });
    assert.strictEqual(gui.length, 0,
        'Nút đã ack rồi mà vẫn báo "Chưa ack" — cửa `daAck(interaction)` trong setTimeout đã\n'
        + `vỡ. Đường nút không có \`xong()\` nên đó là lớp che duy nhất. Gửi đi: ${JSON.stringify(gui)}`);
});

test('canhRest: `ws.ping` là NaN lúc chưa kết nối thì không được in "NaNms"', async () => {
    const { theoDoiAck } = require('../src/lib/canhAck');
    const interaction = {
        createdTimestamp: Date.now() - 2400,
        replied: false, deferred: false,
        user: { id: '1' }, guildId: '2',
        client: { ws: { ping: NaN } },   // discord.js trả NaN khi shard chưa sẵn sàng
    };
    const gui = await batWebhook(async () => {
        theoDoiAck(interaction, `/nan-${Date.now()}`);
        await new Promise(r => setTimeout(r, 400));
    });
    assert.strictEqual(gui.length, 1);
    const desc = gui[0].embeds[0].description;
    assert.doesNotMatch(desc, /NaN/, `Phải rơi về "chưa có" thay vì in NaN. Gửi đi:\n${desc}`);
    assert.match(desc, /ping chưa có/);
});

test('canhRest: tomTat() nói thật khi chưa chạm hạn mức lần nào', () => {
    const { tomTat, dongTomTat, theoDoiRest } = require('../src/lib/canhRest');
    const t = tomTat();
    assert.strictEqual(typeof t.tong, 'number');
    assert.strictEqual(typeof t.gan60s, 'number');
    assert.match(dongTomTat(), /REST:/);

    // Gắn vào client giả phải không ném, và phải đăng ký đúng sự kiện 'rateLimited'.
    const daDangKy = [];
    theoDoiRest({ rest: { on: (ev) => daDangKy.push(ev) } });
    assert.deepStrictEqual(daDangKy, ['rateLimited'],
        "Phải lắng nghe đúng sự kiện 'rateLimited' của `client.rest` (đã kiểm trên discord.js 14.27).");

    // Gọi lại không được đăng ký lần hai (tránh đếm đôi mỗi lần restart mềm).
    const lan2 = [];
    theoDoiRest({ rest: { on: (ev) => lan2.push(ev) } });
    assert.deepStrictEqual(lan2, [], 'theoDoiRest phải tự chống gắn trùng.');
});

test('index.js: phép đo REST được gắn, nếu không thì mọi số đều là 0 vĩnh viễn', () => {
    const fs = require('fs');
    const path = require('path');
    const s = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.match(s, /theoDoiRest\(\s*client\s*\)/,
        'Không ai gọi `theoDoiRest(client)` -> `client.rest` không bị lắng nghe -> `tomTat()`\n'
        + 'luôn trả 0 và tin cảnh báo sẽ nói "chưa chạm hạn mức lần nào" dù thực tế có.\n'
        + 'Đúng kiểu hàm viết xong mà không ai gọi, như `pass.handleButton` trước 25-10.');
});
