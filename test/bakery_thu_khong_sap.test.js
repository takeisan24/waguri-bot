// ============================================================
// test/bakery_thu_khong_sap.test.js — `/bakery thu` phải trả lời được, không ném TypeError.
//
// CHUYỆN ĐÃ XẢY RA (log prod 2026-10-22, chủ repo dán từ kênh #logs):
//   TypeError: [buildWaguriEmbed(...)].setTimestamp is not a function
//       at subThu (src/commands/economy/bakery.js:240)
//       at async InteractionCollector.<anonymous> (src/commands/economy/bakery.js:123)
//
// Dấu `]` đóng mảng TRƯỚC `.setTimestamp()`, nên hàm được gọi trên MẢNG chứ không trên
// embed: `embeds: [buildWaguriEmbed(...)].setTimestamp()`. Mảng không có `setTimestamp`.
//
// VÌ SAO KHÔNG CÓ CỔNG NÀO BẮT ĐƯỢC: đoạn đó **đúng cú pháp**, nên `node --check` xanh;
// ESLint không biết mảng thiếu method nào nếu không có thông tin kiểu, nên lint cũng xanh;
// và 614 test không có cái nào CHẠY đường `thu`. Ba lớp bảo vệ cùng mù một chỗ.
//
// `/bakery thu` là vòng lặp chính của tiệm bánh (7 người đang có tiệm trên prod), và lỗi
// chạm CẢ HAI đường vào: subcommand và nút trong collector (dòng 123).
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { makeInteraction, textOf, stubDb } = require('./helpers/mockInteraction');
const db = require('../src/database.js');

/** Chạy `/bakery thu` tới ĐƯỜNG THÀNH CÔNG — đúng đường đã ném TypeError. */
function chayThu({ cakes = 0, capped = false } = {}) {
    const lenh = require('../src/commands/economy/bakery.js');
    const userId = '800000000000000001';
    const { interaction, calls } = makeInteraction({ sub: 'collect', userId, locale: 'vi' });
    const hoan = stubDb(db, {
        getBakery: async () => ({
            user_id: userId, level: 1, stock: 500, staff: [], decor: [],
            reputation: 0, last_collect: new Date(Date.now() - 3600_000).toISOString(),
        }),
        getPet: async () => null,
        bakeryCollectV2: async () => ({
            result: 'ok', revenue: 1234, wage_deducted: 0,
            cakes, stock_left: 400, capped,
        }),
        questIncr: async () => true,
        getUser: async () => ({ user_id: userId, locale: 'vi' }),
        getGuildSettings: async () => ({}),
    });
    return lenh.execute(interaction).then(() => { hoan(); return calls; },
        (e) => { hoan(); throw e; });
}

test('/bakery thu không ném TypeError và trả lời được', async () => {
    let calls;
    try {
        calls = await chayThu();
    } catch (e) {
        assert.fail(
            `/bakery thu ném lỗi: ${e?.name}: ${e?.message}\n`
            + 'Đây đúng lỗi prod 2026-10-22 — `.setTimestamp()` gọi trên mảng embeds.'
        );
    }
    const traLoi = calls.filter((c) => c.kind === 'editReply');
    assert.ok(traLoi.length >= 1, 'không gọi editReply lần nào — người chơi thấy "application did not respond"');
    assert.ok(textOf(calls).length > 0, 'trả lời rỗng');
});

test('timestamp phải nằm trên EMBED, không phải trên mảng', () => {
    // Chốt ngữ nghĩa, không chỉ chốt "không sập": nếu ai đó "sửa" bằng cách XOÁ
    // `.setTimestamp()` thì test trên vẫn xanh mà ý định ban đầu đã mất.
    const js = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'bakery.js'), 'utf8');
    assert.ok(/\}\)\.setTimestamp\(\)\]/.test(js),
        '`.setTimestamp()` phải gắn vào embed rồi mới đóng mảng: `}).setTimestamp()]`');
    assert.ok(!/\}\)\]\.setTimestamp\(\)/.test(js),
        'Lại gọi `.setTimestamp()` trên MẢNG — mảng không có hàm đó, sẽ ném TypeError.');
});

test('embed trả về thật sự CÓ timestamp', async () => {
    const calls = await chayThu();
    const payload = calls.filter((c) => c.kind === 'editReply').at(-1)?.payload;
    const em = payload?.embeds?.[0];
    const data = em?.data || em;
    assert.ok(data, 'không có embed nào trong payload');
    assert.ok(data.timestamp, 'embed thiếu timestamp — `.setTimestamp()` đã không được áp vào embed');
});

test('không lệnh nào khác gọi method của builder trên mảng embeds', () => {
    // Lỗi này đúng cú pháp nên node --check và lint đều mù. Quét cả repo để lớp lỗi này
    // không mọc lại ở tệp khác.
    const tep = [];
    (function duyet(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) duyet(p);
            else if (e.name.endsWith('.js')) tep.push(p);
        }
    })(path.join(ROOT, 'src'));

    const xau = [];
    for (const f of tep) {
        const s = fs.readFileSync(f, 'utf8');
        s.split(/\r?\n/).forEach((d, i) => {
            if (d.trim().startsWith('//')) return;
            if (/\]\s*\.set[A-Z]\w*\s*\(/.test(d)) {
                xau.push(`${path.relative(ROOT, f).replace(/\\/g, '/')}:${i + 1}  ${d.trim().slice(0, 80)}`);
            }
        });
    }
    assert.deepStrictEqual(xau, [],
        `Gọi method dạng setX() ngay sau \`]\` — mảng không có method của builder:\n${xau.join('\n')}`);
});
