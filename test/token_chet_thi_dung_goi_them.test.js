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
        user: { id: '424242424242424242', username: 'thu', displayAvatarURL: () => 'http://x/a.png' },
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
