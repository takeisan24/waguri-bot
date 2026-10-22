// ============================================================
// test/canh_ack_moc_that.test.js — đồng hồ cảnh báo ack phải đo từ MỐC THẬT.
//
// CHUYỆN ĐÃ XẢY RA (log prod 2026-10-22, 318 tin trong #log_waguri):
// 149/318 tin thuộc nhóm "Chưa ack sau 2500ms" + `10062 Unknown interaction` — nhóm lỗi
// LỚN NHẤT. Nhưng không tin nào cho biết thời gian THẬT, nên không truy được chậm ở đâu.
//
// Gốc rễ của việc không truy được: `theoDoiAck` bấm `setTimeout(..., 2500)` kể từ LỜI GỌI,
// mà lời gọi nằm ở `interactionCreate.js` SAU `await getInteractionLanguage` (trần 800ms).
// Nên khi nó nổ, thời gian thật đã trôi là 2500 + phần trước đó ≈ 3,3s — ĐÃ quá hạn 3 giây
// của Discord. Nó không bao giờ cảnh báo kịp, và con số in ra thấp hơn thực tế.
//
// Nay đo từ `interaction.createdTimestamp` (lúc Discord tạo interaction) và tính ngược
// `còn lại = NGƯỠNG − đã_trôi`. Hệ quả phụ đáng giá: vị trí bấm đồng hồ gần như không còn
// quan trọng, nên nhánh NÚT cũng canh được bằng một dòng.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');

// Chặn logger TRƯỚC khi nạp canhAck, để quan sát được nó có báo hay không.
const duongLogger = require.resolve('../src/lib/logger');
const loggerGoc = require(duongLogger);
const daBao = [];
require.cache[duongLogger].exports = {
    ...loggerGoc,
    logError: (tieuDe, err, meta) => daBao.push({ tieuDe, loi: String((err && err.message) || err), meta }),
};

const { theoDoiAck, NGUONG_ACK_MS } = require('../src/lib/canhAck');

const gia = (o = {}) => ({ replied: false, deferred: false, user: { id: 'u1' }, guildId: 'g1', ...o });
const reset = () => { daBao.length = 0; };
const cho = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

test('interaction đã GẦN hết hạn -> báo SỚM, không đợi thêm trọn ngưỡng', async () => {
    reset();
    // Tạo từ 2,4 giây trước: chỉ còn ~100ms ngân sách.
    theoDoiAck(gia({ createdTimestamp: Date.now() - (NGUONG_ACK_MS - 100) }), '/daily');

    await cho(350);
    assert.strictEqual(daBao.length, 1,
        `Phải báo trong ~100ms vì interaction gần hết hạn; bản cũ đợi trọn ${NGUONG_ACK_MS}ms `
        + 'kể từ lời gọi nên báo muộn hơn hạn Discord.');
});

test('interaction đã QUÁ hạn từ trước -> báo gần như tức thì', async () => {
    reset();
    theoDoiAck(gia({ createdTimestamp: Date.now() - 5000 }), '/pet');
    await cho(120);
    assert.strictEqual(daBao.length, 1, 'đã quá hạn thì phải báo ngay, đừng đợi thêm');
});

test('tiêu đề báo THỜI GIAN THẬT, không phải hằng số ngưỡng', async () => {
    reset();
    theoDoiAck(gia({ createdTimestamp: Date.now() - 4000 }), '/work');
    await cho(120);

    const m = /Chưa ack sau (\d+)ms/.exec(daBao[0]?.tieuDe || '');
    assert.ok(m, `tiêu đề không có số ms: ${daBao[0]?.tieuDe}`);
    const soBaoCao = Number(m[1]);
    assert.ok(soBaoCao >= 4000,
        `Báo ${soBaoCao}ms cho một interaction đã 4000ms tuổi — con số phải là thời gian THẬT `
        + `kể từ createdTimestamp, không phải hằng số ${NGUONG_ACK_MS}.`);
});

test('nội dung nói rõ bao nhiêu đã trôi TRƯỚC khi bấm đồng hồ', async () => {
    reset();
    theoDoiAck(gia({ createdTimestamp: Date.now() - 4000 }), '/ask');
    await cho(120);

    const noi = daBao[0]?.loi || '';
    assert.match(noi, /Đã trôi \d+ms TRƯỚC khi đồng hồ được bấm/,
        'thiếu con số "đã trôi trước khi bấm" — đó chính là thứ cần để biết chậm nằm ở TRƯỚC '
        + 'hay SAU mốc bấm, tức thứ mà 149 tin log cũ không nói được');
    assert.match(noi, /(TRƯỚC|SAU) mốc đó/, 'thiếu phán đoán chậm ở phía nào');
});

test('ack kịp -> IM LẶNG, dù interaction đã cũ', async () => {
    reset();
    const it = gia({ createdTimestamp: Date.now() - 4000, deferred: true });
    theoDoiAck(it, '/daily');
    await cho(120);
    assert.strictEqual(daBao.length, 0, 'đã defer thì không được báo gì');
});

test('thiếu createdTimestamp -> vẫn chạy như cũ (tương thích ngược)', async () => {
    reset();
    // prefixShim dựng interaction GIẢ, không có createdTimestamp — không được vỡ.
    theoDoiAck(gia(), '/w!work');
    await cho(120);
    assert.strictEqual(daBao.length, 0,
        'không có createdTimestamp thì lấy mốc là now(), nên trong 120ms chưa được báo');
});

test('nhánh NÚT cũng được canh trong interactionCreate', () => {
    const fs = require('fs');
    const path = require('path');
    const js = fs.readFileSync(
        path.join(__dirname, '..', 'src', 'events', 'interactionCreate.js'), 'utf8');
    const i = js.indexOf('if (interaction.isButton())');
    assert.ok(i >= 0, 'không thấy nhánh isButton');
    const khoi = js.slice(i, i + 1600);
    assert.match(khoi, /theoDoiAck\(interaction,/,
        'Nhánh NÚT chưa được canh ack. Log prod cho thấy nút ĐỨNG ĐẦU bảng lỗi ack/10062 '
        + '(`work:again` 21 lần, `start:claim` 6 lần) mà không có một cảnh báo nào.');
});
