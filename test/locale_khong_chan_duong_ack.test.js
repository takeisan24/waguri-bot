// test/locale_khong_chan_duong_ack.test.js — tra ngôn ngữ không được nằm chắn đường ack.
//
// VÌ SAO CÓ. `interactionCreate.js` từng `await getInteractionLanguage(interaction)` ngay
// trước các cổng chặn, tức trên 100% lưu lượng và NẰM TRƯỚC ACK. Nhưng từ đó tới
// `command.execute()`, giá trị ấy chỉ được dùng ở ba nhánh chặn (cấm · giam · giới hạn tốc
// độ) và nhánh `catch`. Đường thường thì nó được tính rồi KHÔNG AI DÙNG — mỗi lệnh tự gọi
// `getInteractionLanguage` sau `deferReply()`, lúc đó đã có 15 phút.
//
// Giá của nó là `ACK_LOOKUP_TIMEOUT` = 800ms, tức 27% ngân sách 3 giây của Discord, tiêu
// cho một giá trị sắp bị vứt. Đo trên 58 tin cảnh báo ack (26-10-2026): trước-mốc p50 chỉ
// 167ms, nhưng p90 là 908ms và 7/58 vượt 800ms — bốn cái bu rất chặt ở 821 · 908 · 911 ·
// 917ms, đúng bằng trần 800ms cộng một nhúm độ trễ gateway. Vân tay của chính lời tra này.
//
// BẪY CỦA BẢN SỬA, và là lý do cổng này phải CHẠY THẬT chứ không đọc mã: khi bỏ biến
// `locale` ở đầu khối, nhánh `catch` phía dưới vẫn tham chiếu nó → `ReferenceError` lúc
// chạy. `node --check` XANH vì đó không phải lỗi cú pháp, và `npm test` cũng sẽ xanh nếu
// không ai chạy đúng nhánh đó. Mà nhánh đó chính là đường báo lỗi cho người dùng — hỏng ở
// đấy thì lệnh lỗi trở thành lệnh im lặng.
const { test } = require('node:test');
const assert = require('node:assert');

// PHẢI vá TRƯỚC khi require interactionCreate: tệp đó destructure
// `const { getInteractionLanguage, t } = require('../lib/i18n')` ngay lúc nạp, nên vá sau
// thì nó đã giữ tham chiếu cũ và phép đo thành vô nghĩa.
const i18n = require('../src/lib/i18n');
const bans = require('../src/lib/bans');

let demTraNgonNgu = 0;
const traThat = i18n.getInteractionLanguage;
i18n.getInteractionLanguage = async (it) => { demTraNgonNgu++; return traThat.call(i18n, it); };

let giaVoBiCam = false;
const camThat = bans.isBanned;
bans.isBanned = (id) => (giaVoBiCam ? true : camThat(id));

const handler = require('../src/events/interactionCreate');

function dungInteraction({ nem = null, ghi = [] } = {}) {
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
        createdTimestamp: Date.now(),
        replied: false,
        deferred: false,
        reply: async (p) => { ghi.push({ loai: 'reply', p }); it.replied = true; },
        editReply: async (p) => { ghi.push({ loai: 'editReply', p }); },
        followUp: async (p) => { ghi.push({ loai: 'followUp', p }); },
        deferReply: async () => { it.deferred = true; },
        client: {
            commands: new Map([['thu-nghiem', {
                execute: async (i) => {
                    // Chụp số lần tra ngôn ngữ NGAY lúc lệnh bắt đầu — đây là mốc cần đo.
                    ghi.push({ loai: 'execute', traTruocKhiChay: demTraNgonNgu });
                    await i.deferReply();
                    if (nem) throw nem;
                },
            }]]),
        },
    };
    return it;
}

test('đường thường: KHÔNG tra ngôn ngữ trước khi lệnh kịp chạy', async () => {
    demTraNgonNgu = 0; giaVoBiCam = false;
    const ghi = [];
    await handler.execute(dungInteraction({ ghi }));

    const chay = ghi.find(x => x.loai === 'execute');
    assert.ok(chay, 'lệnh phải được chạy.');
    assert.strictEqual(chay.traTruocKhiChay, 0,
        'Có lời tra ngôn ngữ chạy TRƯỚC khi lệnh kịp `deferReply()`. Trần của nó là 800ms —\n'
        + '27% ngân sách 3 giây của Discord — tiêu cho một giá trị mà đường thường vứt đi.\n'
        + 'Đo thật: 4/58 tin cảnh báo ack có trước-mốc bu ở 821–917ms, đúng mốc trần đó.');
});

test('nhánh bị CẤM: vẫn tra ngôn ngữ và vẫn trả lời được', async () => {
    demTraNgonNgu = 0; giaVoBiCam = true;
    const ghi = [];
    try {
        await handler.execute(dungInteraction({ ghi }));
    } finally { giaVoBiCam = false; }

    assert.ok(!ghi.some(x => x.loai === 'execute'), 'người bị cấm thì lệnh KHÔNG được chạy.');
    assert.strictEqual(demTraNgonNgu, 1,
        'Nhánh chặn phải tra ngôn ngữ (đúng một lần) — tính lười không được biến lời chặn\n'
        + 'thành lời chặn không dịch được. 800ms ở đây vô hại: người này không chạy lệnh nào.');
    const tl = ghi.find(x => x.loai === 'reply');
    assert.ok(tl && tl.p.embeds && tl.p.embeds.length === 1, 'phải trả lời bằng embed báo bị cấm.');
});

test('nhánh CATCH: lệnh ném lỗi thì vẫn báo được cho người dùng', async () => {
    demTraNgonNgu = 0; giaVoBiCam = false;
    const ghi = [];
    // Lỗi thường (không phải 10062/40060) -> phải đi tới nhánh dựng embed báo lỗi.
    await handler.execute(dungInteraction({ ghi, nem: new Error('vỡ thử') }));

    const baoLoi = ghi.filter(x => x.loai === 'editReply' || x.loai === 'followUp' || x.loai === 'reply');
    assert.ok(baoLoi.length >= 1,
        'Lệnh ném lỗi mà người dùng KHÔNG nhận được gì. Đây đúng là hậu quả của việc bỏ biến\n'
        + '`locale` ở đầu khối mà quên nhánh catch: `ReferenceError` nuốt luôn lời báo lỗi,\n'
        + 'và `node --check` thì vẫn XANH vì nó không phải lỗi cú pháp.');
    assert.ok(demTraNgonNgu >= 1,
        'Nhánh catch phải tra được ngôn ngữ để dựng lời báo lỗi. Ở đây chậm cũng vô hại:\n'
        + 'lệnh đã chạy xong và interaction đã ack, không còn hạn 3 giây nào.');
});
