// test/token_chet_thi_dung_goi_them.test.js — token đã chết thì ĐỪNG gọi thêm.
//
// VÌ SAO CÓ. Sự cố prod 03–04/11/2026: hàng đợi REST của discord.js dồn tới 15–114 phút
// (đo được bằng cách giải base64 token trong url mà console in ra: phần giữa của
// `interaction:<id>:<secret>` là snowflake, `(BigInt(id) >> 22n) + 1420070400000n` ra đúng
// lúc interaction sinh). Token interaction chỉ sống 15 phút, nên `editReply` tới nơi thì
// Discord trả `50027 Invalid Webhook Token` kèm **HTTP 401**. Tỷ lệ lỗi lệnh: 0% → 39% → 100%.
//
// Nhánh báo lỗi khi đó chỉ dừng ở `10062`/`40060`, nên gặp `50027` nó vẫn chạy tiếp và gọi
// `followUp` — lời gọi CHẮC CHẮN cũng 401. Console prod in đúng cặp đó: một `editReply` hỏng
// rồi một `Không thể gửi thông báo lỗi cho user` ngay sau. Mỗi sự cố sinh **2 request hỏng
// thay vì 1**, đúng lúc hàng đợi đang nghẹt — tự đổ dầu vào lửa.
//
// CỔNG NÀY CHẠY THẬT `interactionCreate.execute`, không đọc mã: phép đọc mã chỉ chứng minh
// đoạn chữ CÓ MẶT, không chứng minh cú gọi thừa đã thực sự biến mất.
//
// Chuỗi `note` đi tới đâu thì `phep_do_phai_den_duoc_mat_nguoi_doc.test.js` đã gác sẵn
// (trường `note` ra tới webhook, và đổi `note` không phá cách gộp trùng). Cổng này chỉ lo
// phần của `interactionCreate`: nó CÓ gửi số đo tuổi đi hay không.
const { test } = require('node:test');
const assert = require('node:assert');

// PHẢI vá TRƯỚC khi require interactionCreate: tệp đó destructure `logError` ngay lúc nạp,
// vá sau thì nó đã giữ tham chiếu cũ và phép đo thành vô nghĩa (đúng cái bẫy đã ghi ở
// locale_khong_chan_duong_ack.test.js).
const logger = require('../src/lib/logger');
let nhatKyLog = [];
logger.logError = async (title, err, meta = {}) => { nhatKyLog.push({ title, err, meta }); };

const handler = require('../src/events/interactionCreate');

const PHUT = 60_000;

// MỖI PHÉP THỬ MỘT USER RIÊNG — và đây là một cái bẫy đã cắn thật, đáng ghi hơn bản vá.
// `interactionCreate` có cổng chống spam `rateLimited()` trần **5 lệnh / 5 giây mỗi user**
// (config.RATE_LIMIT). Bộ test này chạy liên tiếp trong vài chục ms, nên nếu mọi phép thử
// dùng CHUNG một id thì từ lượt chạy thứ 6 trở đi lệnh **bị chặn trước khi kịp chạy**:
// không có lỗi nào được ném, `logError` không bao giờ được gọi, và phép thử đỏ với câu
// "phải có một tin log" — tức nó tố sai vào tính năng, trong khi thủ phạm là chính phép thử.
// Bản đầu của tệp này có đúng 5 phép thử CÓ chạy lệnh nên xanh do TRÙNG HỢP; thêm phép thứ
// sáu là vỡ ngay. Số thứ tự dưới đây giữ cho bộ test không bao giờ chạm trần đó nữa.
let demUser = 0;
const userMoi = () => String(424242424242424242n + BigInt(++demUser));

function dungInteraction({ nem = null, ghi = [], tuoiMs = 0 } = {}) {
    const it = {
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        isUserContextMenuCommand: () => false,
        isMessageContextMenuCommand: () => false,
        isButton: () => false,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        commandName: 'thu-nghiem',
        options: { getSubcommand: () => null },
        user: { id: userMoi(), username: 'thu', displayAvatarURL: () => 'http://x/a.png' },
        guildId: '515151515151515151',
        member: null,
        locale: 'vi',
        createdTimestamp: Date.now() - tuoiMs,
        replied: false,
        deferred: false,
        reply: async (p) => { ghi.push({ loai: 'reply', p }); it.replied = true; },
        editReply: async (p) => { ghi.push({ loai: 'editReply', p }); },
        followUp: async (p) => { ghi.push({ loai: 'followUp', p }); },
        deferReply: async () => { it.deferred = true; },
        client: {
            commands: new Map([['thu-nghiem', {
                execute: async (i) => {
                    ghi.push({ loai: 'execute' });
                    await i.deferReply();
                    if (nem) throw nem;
                },
            }]]),
        },
    };
    return it;
}

const loi = (code) => Object.assign(new Error(`giả lập ${code}`), { code });
const soLanGoiDiscord = (ghi) => ghi.filter(x => x.loai === 'reply' || x.loai === 'followUp' || x.loai === 'editReply').length;

test('50027: token đã chết thì KHÔNG tiêu thêm một request nào', async () => {
    nhatKyLog = [];
    const ghi = [];
    await handler.execute(dungInteraction({ ghi, nem: loi(50027) }));

    assert.ok(ghi.some(x => x.loai === 'execute'), 'lệnh phải chạy thật, nếu không phép thử rỗng.');
    assert.strictEqual(soLanGoiDiscord(ghi), 0,
        'Sau khi lệnh vỡ với 50027, bot vẫn gọi thêm Discord. Lời gọi đó CHẮC CHẮN cũng 401 vì\n'
        + 'token đã chết — mỗi sự cố thành 2 request hỏng thay vì 1, đúng lúc hàng đợi REST\n'
        + 'đang nghẹt. Đây chính là vòng xoáy đã thấy trong console prod 04/11/2026.');
});

test('từ chối sớm vì 429 dài (canhRest): KHÔNG gọi thêm Discord dù token còn tươi', async () => {
    // `canhRest` ném RateLimitError khi Discord bắt chờ lâu hơn đời còn lại của token
    // (09-11-2026). Mọi lời gọi tiếp trên cùng token cũng chung số phận, nên followUp báo lỗi
    // chỉ là thêm một request vô ích — đúng lúc đường REST đang bị chặn.
    const { RateLimitError } = require('@discordjs/rest');
    nhatKyLog = [];
    const ghi = [];
    const nem = new RateLimitError({ route: '/webhooks/:id/:token/messages/@original', retryAfter: 3_600_000,
        timeToReset: 3_600_000, method: 'PATCH', url: 'x', limit: 1, hash: 'h', majorParameter: 'm',
        global: false, sublimitTimeout: 0, scope: 'shared' });
    await handler.execute(dungInteraction({ ghi, nem }));
    assert.ok(ghi.some(x => x.loai === 'execute'), 'lệnh phải chạy thật.');
    assert.strictEqual(soLanGoiDiscord(ghi), 0,
        'Sau khi canhRest từ chối sớm, bot vẫn gọi followUp — `hetDuongPhanHoi` chưa nhận ra loại lỗi này.');
    assert.ok(nhatKyLog.some(x => x.title === 'Lỗi thực thi lệnh'), 'vẫn phải có tin log cho lệnh vỡ.');
});

test('lỗi THƯỜNG + token còn tươi: vẫn phải báo được cho người dùng', async () => {
    nhatKyLog = [];
    const ghi = [];
    await handler.execute(dungInteraction({ ghi, nem: loi(50013) }));

    assert.ok(soLanGoiDiscord(ghi) >= 1,
        'Chặn quá tay: lỗi thường mà người dùng không nhận được gì. Cửa chặn chỉ được đóng khi\n'
        + 'token thật sự hết đường, không phải với mọi lỗi.');
});

test('token quá 15 phút: im kể cả khi lỗi KHÔNG phải 50027', async () => {
    nhatKyLog = [];
    const ghi = [];
    await handler.execute(dungInteraction({ ghi, nem: loi(50013), tuoiMs: 16 * PHUT }));

    assert.strictEqual(soLanGoiDiscord(ghi), 0,
        'Cửa tuổi token không chạy. Mã lỗi chỉ biết được SAU một lời gọi hỏng, còn tuổi token\n'
        + 'thì tính tại chỗ, miễn phí — token quá 15 phút thì mọi lời gọi đều vô ích, bất kể\n'
        + 'lời gọi đầu vỡ vì lý do gì.');
});

test('log lỗi luôn kèm số đo TUỔI interaction', async () => {
    nhatKyLog = [];
    await handler.execute(dungInteraction({ nem: loi(50027) }));

    const tin = nhatKyLog.find(x => x.title === 'Lỗi thực thi lệnh');
    assert.ok(tin, 'phải có một tin log cho lệnh vỡ.');
    assert.match(String(tin.meta.note || ''), /tuổi/,
        'Tin log thiếu tuổi interaction. Thiếu con số này thì lần sau phải đi giải base64 token\n'
        + 'trong console để biết hàng đợi REST dồn bao lâu — đúng việc đã tốn cả buổi hôm 04/11.');
});

test('token quá hạn thì tin log phải NÓI THẲNG là quá hạn', async () => {
    nhatKyLog = [];
    await handler.execute(dungInteraction({ nem: loi(50013), tuoiMs: 77 * PHUT }));

    const tin = nhatKyLog.find(x => x.title === 'Lỗi thực thi lệnh');
    assert.ok(tin, 'phải có một tin log cho lệnh vỡ.');
    assert.match(String(tin.meta.note || ''), /QUÁ HẠN/,
        'Tuổi 77 phút mà tin log không nói là quá hạn. Con số trần đo được ở prod đúng bằng\n'
        + '15 phút; người đọc log cần biết ngay mình đang ở phía nào của vạch đó.');
});

test('đường NÚT cũng hỏi cửa đó trước khi gọi', () => {
    // Neo nằm TRONG chính hàm đang soi, và có chốt chặn độ dài: `indexOf` trượt neo thì im
    // lặng chứ không kêu, nên lát cắt phình to là dấu hiệu neo đã trôi (bài học 26-10-2026).
    const src = require('fs').readFileSync(require.resolve('../src/events/interactionCreate.js'), 'utf8');
    const i = src.indexOf('async function ackButtonError');
    assert.notStrictEqual(i, -1, 'không tìm thấy `ackButtonError` — neo đã trôi, sửa cổng này.');
    const lat = src.slice(i, i + 400);
    assert.ok(lat.length === 400, 'lát cắt ngắn bất thường — tệp đã đổi hình, xem lại neo.');
    assert.match(lat, /^async function ackButtonError\([^)]*\)\s*\{\s*(\/\/[^\n]*\n\s*)*if \(hetDuongPhanHoi\(/,
        'Câu LỆNH ĐẦU TIÊN của `ackButtonError` phải là cửa `hetDuongPhanHoi`. Bảy nơi gọi nó\n'
        + 'đều nằm trong nhánh catch, nên nếu cửa không ở đây thì đường nút vẫn tiêu một request\n'
        + 'chắc chắn hỏng — đúng lỗi vừa vá cho đường slash, chỉ khác chỗ.');
});

// ---------------------------------------------------------------------------
// ẢNH CHỤP REST phải đi kèm tin báo lỗi (bổ sung 04/11/2026, chiều).
//
// VÌ SAO THÊM. Sau lần restart 08:34 sự cố TÁI PHÁT lúc ~12:20–14:04 (trễ 77,9 và 104,5
// phút) ⇒ "chữa = restart" là sai, nó chỉ xả hàng đợi đang có. Thứ còn thiếu để chốt
// nguyên nhân là: discord.js có TỰ THẤY mình bị hạn mức hay không. `canhRest` đo được điều
// đó, nhưng trước đây CHỈ `canhAck` tiêu thụ — tức chỉ hiện trên nhánh 10062, mà 10062 đã
// biến mất và bị 50027 thay thế. Phép đo còn sống mà gắn vào cửa sổ không còn ai đi qua.
//
// CỔNG NÀY CHẠY THẬT, không đọc mã, vì bẫy đã mắc đúng lúc viết bản vá này: lời gọi
// `dongTomTat()` được thêm vào mà QUÊN require — `node --check` vẫn XANH (không phải lỗi cú
// pháp) và cả khối báo lỗi sẽ nổ `ReferenceError` lúc chạy, biến lệnh lỗi thành lệnh im
// lặng. Chỉ phép chạy thật mới thấy.
test('tin báo lỗi phải kèm ảnh chụp REST (phân biệt hạn mức vs mạng host)', async () => {
    nhatKyLog = [];
    await handler.execute(dungInteraction({ nem: loi(50027), tuoiMs: 104 * PHUT }));

    const tin = nhatKyLog.find(x => x.title === 'Lỗi thực thi lệnh');
    assert.ok(tin, 'phải có một tin log cho lệnh vỡ.');
    assert.match(String(tin.meta.note || ''), /REST:/,
        'Tin báo lỗi KHÔNG kèm ảnh chụp REST. Thiếu nó thì lần vỡ tới vẫn không nói được là\n'
        + 'cửa hạn mức TOÀN CỤC hay tầng mạng host treo — đúng câu hỏi còn treo của sự cố\n'
        + '03–04/11/2026, và là lý do bản vá này tồn tại.');
    // Tuổi PHẢI còn nguyên: ảnh chụp REST là thứ thêm vào, không được đẩy số cũ ra ngoài.
    assert.match(String(tin.meta.note), /tuổi/,
        'Thêm ảnh chụp REST mà làm mất số đo TUỔI thì đổi một phép đo lấy một phép đo.');
});

test('canhRest: ảnh chụp nói được lần chạm GẦN NHẤT, không chỉ cửa sổ 60 giây', () => {
    // `gan60s` mù với nhóm 50027: lệnh vỡ 78–104 phút SAU lúc hàng đợi nghẹt, nên cú chạm
    // hạn mức đã trôi khỏi cửa sổ 60 giây và `gan60s` trả 0 — tin cảnh báo sẽ nói "không
    // chạm hạn mức" trong đúng ca mà hạn mức là nghi phạm số một.
    const { tomTat, dongTomTat, theoDoiRest } = require('../src/lib/canhRest');

    let batSuKien = null;
    theoDoiRest({ rest: { on: (ten, fn) => { if (ten === 'rateLimited') batSuKien = fn; } } });
    assert.ok(batSuKien, 'theoDoiRest phải đăng ký được bộ bắt sự kiện `rateLimited`.');

    batSuKien({ global: true, timeToReset: 6_000_000, method: 'PATCH', route: '/webhooks/:id/:token' });

    const t = tomTat();
    assert.strictEqual(typeof t.lanCuoiMs, 'number',
        '`lanCuoiMs` phải là số sau khi có sự kiện — đây là số dùng để ĐỐI CHIẾU với tuổi\n'
        + 'interaction in cùng tin: hai số xấp xỉ nhau nghĩa là CÙNG một sự kiện.');
    assert.strictEqual(t.choLauNhatMs, 6_000_000,
        '`choLauNhatMs` không giữ được `timeToReset` lớn nhất. Một `retry_after` khổng lồ là\n'
        + 'bằng chứng trực tiếp nhất của cửa hạn mức toàn cục — mất nó là mất nhân chứng.');
    assert.match(dongTomTat(), /chạm gần nhất/,
        'Dòng tóm tắt không in lần chạm gần nhất, nên người đọc log vẫn chỉ thấy `gan60s` = 0\n'
        + 'và vẫn kết luận sai là "không chạm hạn mức".');
});
