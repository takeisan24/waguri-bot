// ============================================================
// test/ai_dauvao.test.js — bốn thứ AI từng nuốt im lặng phải tới được model.
//
// VÌ SAO CÓ: tới 2026-08-23, nhánh AI chỉ lấy `message.content` rồi bỏ hết phần còn lại:
//
//   1. Tin chỉ có ảnh   -> `if (!text) return`, im lặng tuyệt đối
//   2. Link             -> model không mở được nên BỊA nội dung
//   3. Emoji tuỳ chỉnh  -> `<:ten:123>` tới model nguyên si
//   4. Trả lời tin khác -> tin được trích không được đưa vào
//
// Cả bốn đều là loại hỏng KHÔNG BAO GIỜ tự lộ: bot vẫn chạy, log vẫn sạch, chỉ là câu trả
// lời sai hoặc không có. Vì vậy phải gác bằng test chứ không thể trông vào phát hiện lúc dùng.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { dungDauVao, ghep, doiEmoji, boMention, timMien, catGon } = require('../src/lib/ai/dauVao');

/** Dựng tin nhắn giả đủ dùng cho dungDauVao. */
function tinGia({ content = '', anh = [], sticker = [], tacGia = 'Ai Đó' } = {}) {
    return {
        content,
        attachments: new Map(anh.map((a, i) => [String(i), a])),
        stickers: new Map(sticker.map((s, i) => [String(i), { name: s }])),
        author: { displayName: tacGia, username: tacGia },
    };
}
const anhGia = (name = 'a.png', contentType = 'image/png') => ({ name, contentType, url: 'https://cdn.discordapp.com/x/' + name });

// ---------- emoji ----------

test('emoji tuỳ chỉnh giữ lại TÊN, bỏ chuỗi số', () => {
    assert.strictEqual(doiEmoji('chào <:kaoruko_wink:1234567890> nha'), 'chào :kaoruko_wink: nha');
    assert.strictEqual(doiEmoji('<a:nhay:987654321>'), ':nhay:', 'Emoji động <a:...> cũng phải đổi.');
});

test('emoji unicode KHÔNG bị đụng vào', () => {
    // Cái này vốn đã chạy tốt. Test để lỡ ai đó "dọn dẹp" thì biết ngay.
    assert.strictEqual(doiEmoji('vui quá 😊🍰'), 'vui quá 😊🍰');
});

test('mention người, role và kênh đều bị bỏ', () => {
    assert.strictEqual(boMention('<@123> <@!456> <@&789> <#111> chào'), 'chào');
});

// ---------- link ----------

test('trích tên miền, bỏ www, không trùng lặp', () => {
    assert.deepStrictEqual(timMien('xem https://www.youtube.com/watch?v=1 và https://youtube.com/x'), ['youtube.com']);
});

test('nhãn link phải DẶN đừng đoán nội dung', () => {
    const dv = dungDauVao(tinGia({ content: 'cái này hay nè https://example.com/abc' }));
    const nhan = dv.nhan.join(' ');
    assert.match(nhan, /example\.com/);
    assert.match(nhan, /KHÔNG mở được link/,
        'Nhãn phải nói rõ là không mở được, nếu không model vẫn bịa nội dung trang.');
});

// ---------- ảnh ----------

test('tin CHỈ có ảnh vẫn được xử lý, không bị nuốt im lặng', () => {
    const dv = dungDauVao(tinGia({ content: '', anh: [anhGia()] }));
    assert.strictEqual(dv.coGiDo, true, 'Tin chỉ có ảnh phải đi tiếp — đây chính là lỗi gốc.');
    assert.ok(dv.anh, 'Phải chọn được tấm ảnh để gửi model.');
    assert.deepStrictEqual(dv.nhan, ['[Kèm 1 ảnh]']);
});

test('nhiều ảnh thì chỉ lấy tấm đầu, và NÓI RÕ là chỉ xem được một tấm', () => {
    const dv = dungDauVao(tinGia({ anh: [anhGia('1.png'), anhGia('2.png'), anhGia('3.png')] }));
    assert.strictEqual(dv.anh.name, '1.png');
    assert.match(dv.nhan.join(' '), /3 ảnh.*tấm đầu tiên/,
        'Im lặng bỏ 2 tấm là để người dùng tưởng Waguri đã xem hết.');
});

test('ảnh spoiler bị bỏ qua, và có nhãn nói là chưa mở được', () => {
    const dv = dungDauVao(tinGia({ content: 'đoán xem', anh: [anhGia('SPOILER_bimat.png')] }));
    assert.strictEqual(dv.anh, null, 'Người ta cố tình che thì bot không được mô tả toẹt ra.');
    assert.match(dv.nhan.join(' '), /chưa mở được/);
});

test('contentType null vẫn nhận ra ảnh qua đuôi file', () => {
    // Discord CÓ THỂ trả contentType null. Tin mỗi nó là mất ảnh.
    const dv = dungDauVao(tinGia({ anh: [{ name: 'anh.JPG', contentType: null, url: 'https://cdn.discordapp.com/x/anh.JPG' }] }));
    assert.ok(dv.anh, 'contentType null mà đuôi là .JPG thì vẫn phải nhận.');
});

test('tệp không phải ảnh -> không gửi model, nhưng có nhãn nói thật', () => {
    const dv = dungDauVao(tinGia({ content: 'xem hộ', anh: [{ name: 'baocao.pdf', contentType: 'application/pdf' }] }));
    assert.strictEqual(dv.anh, null);
    assert.match(dv.nhan.join(' '), /chưa mở được/);
});

// ---------- trả lời tin khác ----------

test('tin được trả lời đi vào nhãn kèm tên người', () => {
    const goc = tinGia({ content: 'hôm nay mình nướng cháy cái bánh', tacGia: 'Mochi' });
    const dv = dungDauVao(tinGia({ content: 'thảm thế' }), goc);
    assert.match(dv.nhan.join(' '), /Đang trả lời tin của Mochi.*nướng cháy/);
});

test('ẢNH trong tin được trả lời cũng lấy được — ca dùng phổ biến nhất', () => {
    // Người ta hiếm khi vừa gửi ảnh vừa tag bot. Thực tế là ai đó đăng ảnh, người khác
    // reply tin đó rồi hỏi "cái này là gì". Bỏ sót ca này là bỏ sót phần lớn nhu cầu.
    const goc = tinGia({ content: '', anh: [anhGia('mon.png')], tacGia: 'Mochi' });
    const dv = dungDauVao(tinGia({ content: 'cái này là gì thế' }), goc);
    assert.ok(dv.anh, 'Phải lấy được ảnh từ tin được trả lời.');
    assert.strictEqual(dv.anh.name, 'mon.png');
    assert.match(dv.nhan.join(' '), /Ảnh nằm trong tin nhắn được trả lời/);
});

test('ảnh của tin HIỆN TẠI được ưu tiên hơn ảnh của tin được trả lời', () => {
    const goc = tinGia({ anh: [anhGia('cu.png')] });
    const dv = dungDauVao(tinGia({ content: 'so với cái này', anh: [anhGia('moi.png')] }), goc);
    assert.strictEqual(dv.anh.name, 'moi.png');
});

test('nội dung tin được trả lời bị cắt cho gọn, không nuốt cả bài', () => {
    const dai = 'a'.repeat(1200);
    const dv = dungDauVao(tinGia({ content: 'ừ' }), tinGia({ content: dai, tacGia: 'X' }));
    const nhan = dv.nhan.find(n => n.includes('Đang trả lời'));
    assert.ok(nhan.length < 400, `Nhãn dài ${nhan.length} ký tự — một tin dài sẽ đốt token vô ích.`);
});

// ---------- sticker & tin rỗng ----------

test('sticker chỉ lấy tên, không gửi ảnh sticker', () => {
    const dv = dungDauVao(tinGia({ sticker: ['meo_khoc'] }));
    assert.strictEqual(dv.anh, null, 'Gửi ảnh sticker lên model là tốn ~1090 token cho một thứ tên đã đủ tả.');
    assert.match(dv.nhan.join(' '), /sticker "meo_khoc"/);
    assert.strictEqual(dv.coGiDo, true);
});

test('tin rỗng hoàn toàn -> coGiDo false', () => {
    assert.strictEqual(dungDauVao(tinGia({ content: '' })).coGiDo, false);
    assert.strictEqual(dungDauVao(tinGia({ content: '<@123>' })).coGiDo, false,
        'Tag trống rỗng, không kèm gì — gọi AI cũng chẳng có gì để nói.');
});

// ---------- ghép ----------

test('ghép đặt nhãn SAU chữ người dùng', () => {
    const ra = ghep('cái này sao', ['[Kèm 1 ảnh]', '[Có link tới a.com]']);
    assert.ok(ra.indexOf('cái này sao') < ra.indexOf('[Kèm 1 ảnh]'),
        'Chữ người ta nói phải đứng trước; nhãn là ghi chú bổ sung.');
});

test('không có chữ thì chỉ còn nhãn, không để lại dòng trống thừa', () => {
    assert.strictEqual(ghep('', ['[Kèm 1 ảnh]']), '[Kèm 1 ảnh]');
});

test('catGon không chặt ngang từ', () => {
    const ra = catGon('con mèo nhỏ đang ngủ trên mái nhà', 20);
    assert.ok(ra.endsWith('…'));
    assert.ok(!/\s…$/.test(ra), 'Không để lại khoảng trắng lửng trước dấu ba chấm.');
});

// ---------- persona ----------

test('hướng dẫn đọc nhãn có dặn nói thật và đừng đọc to nhãn', () => {
    const { HUONG_DAN_NHAN } = require('../src/lib/ai/dauVao');
    assert.match(HUONG_DAN_NHAN, /KHÔNG mở được link/);
    assert.match(HUONG_DAN_NHAN, /không đoán nội dung bên trong|đoán bừa/,
        'Không dặn thì model vẫn bịa — đó là triệu chứng số 2 mà đợt này sinh ra để chữa.');
    assert.match(HUONG_DAN_NHAN, /Đừng nhắc lại nhãn/,
        'Không dặn thì Waguri sẽ đọc to "[Kèm 1 ảnh]" ra như một câu thoại.');
});

// Khối hướng dẫn nặng 222 token. Nhét vào persona là MỌI lượt chat phải trả, kể cả lượt chỉ
// có chữ thuần — mà persona vốn đã chiếm 96% chi phí một lượt (đo 2026-08-23). Với 300
// lượt/ngày là +66.600 token/ngày cho một khối chỉ có ích khi tin có nhãn.
test('hướng dẫn đọc nhãn KHÔNG nằm trong persona — phải gắn theo nhu cầu', () => {
    const { WAGURI_SYSTEM_PROMPT } = require('../src/lib/ai/persona');
    assert.ok(!/Cách đọc các nhãn vuông/.test(WAGURI_SYSTEM_PROMPT),
        'Khối hướng dẫn nhãn bị nhét lại vào persona. Nó nặng 222 token và mọi lượt chat chữ '
        + 'thuần sẽ phải trả cho thứ chúng không dùng.');
});

test('coNhan phân biệt được nhãn hệ thống với ngoặc vuông người dùng tự gõ', () => {
    const { coNhan } = require('../src/lib/ai/dauVao');
    assert.strictEqual(coNhan('cái này sao\n[Kèm 1 ảnh]'), true);
    assert.strictEqual(coNhan('ừ\n[Có link tới a.com — Waguri KHÔNG mở được link]'), true);
    assert.strictEqual(coNhan('[Đang trả lời tin của X: "hi"]'), true);

    assert.strictEqual(coNhan('mình thích [nhạc lofi] lắm'), false,
        'Ngoặc vuông giữa câu là chữ người ta gõ, không phải nhãn — gắn hướng dẫn vào đây là tốn 222 token vô ích.');
    assert.strictEqual(coNhan('chào cậu'), false);
});

test('mọi nhãn dungDauVao sinh ra đều được coNhan nhận ra', () => {
    // Nếu ai đó thêm nhãn mới mà quên cập nhật coNhan, hướng dẫn sẽ không được gắn và
    // Waguri lại đọc to nhãn ra như câu thoại.
    const { coNhan } = require('../src/lib/ai/dauVao');
    const truongHop = [
        dungDauVao(tinGia({ anh: [anhGia()] })),
        dungDauVao(tinGia({ anh: [anhGia('1.png'), anhGia('2.png')] })),
        dungDauVao(tinGia({ content: 'xem https://a.com' })),
        dungDauVao(tinGia({ sticker: ['meo'] })),
        dungDauVao(tinGia({ anh: [{ name: 'x.pdf', contentType: 'application/pdf' }] })),
        dungDauVao(tinGia({ content: 'ừ' }), tinGia({ content: 'hi', tacGia: 'M' })),
        dungDauVao(tinGia({ content: 'gì đây' }), tinGia({ anh: [anhGia('z.png')], tacGia: 'M' })),
    ];
    for (const dv of truongHop) {
        assert.ok(dv.nhan.length, 'Trường hợp này lẽ ra phải sinh nhãn.');
        assert.strictEqual(coNhan(ghep(dv.text, dv.nhan)), true,
            `coNhan không nhận ra nhãn: ${dv.nhan.join(' | ')}`);
    }
});
