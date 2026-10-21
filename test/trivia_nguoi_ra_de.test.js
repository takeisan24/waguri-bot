// Người ra đề `/trivia` — test HỒI QUY cho feedback 2026-10.
//
// Bối cảnh: luật chống farm loại người ra đề khỏi việc trả lời, nhưng loại IM LẶNG ngay ở
// filter của collector. Người chơi gõ đúng "Nguyễn Du" ba lần, bot không nói gì, hết giờ lại
// báo "lần sau nhanh tay hơn" — họ tưởng bot hỏng. Test khoá cả hai nửa:
//   · người ra đề vẫn KHÔNG được thưởng (luật chống farm còn nguyên)
//   · nhưng được báo đúng MỘT lần, và lời báo không phụ thuộc đáp án đúng/sai
//     (nếu chỉ báo khi đúng thì chính lời báo lộ đáp án cho người khác chép).

const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const { makeInteraction, stubDb } = require('./helpers/mockInteraction');
const db = require('../src/database.js');
const trivia = require('../src/commands/fun/trivia.js');
const QUIZ = require('../src/data/quiz');
const { t } = require('../src/lib/i18n');

const NGUOI_RA_DE = '300000000000000003';
const NGUOI_KHAC = '300000000000000004';

let kenh = 0;
function dungVan() {
    const { interaction } = makeInteraction({ userId: NGUOI_RA_DE });
    const collector = new EventEmitter();
    collector.stop = () => collector.emit('end');
    // Áp `filter` như discord.js thật: lỗi cũ nằm CHÍNH Ở filter, mock bỏ qua filter thì
    // test xanh cả khi lỗi còn nguyên (đã thử bẻ ngược và thấy đúng như vậy).
    collector.nhan = msg => { if (collector.filter(msg)) collector.emit('collect', msg); };
    const daGui = [];
    interaction.channelId = `kenh_trivia_${++kenh}`;
    interaction.channel = {
        createMessageCollector: opts => { collector.filter = opts.filter; return collector; },
        send: async payload => { daGui.push(payload); },
    };
    return { interaction, collector, daGui };
}

function tinNhan(authorId, content) {
    const daTraLoi = [];
    return {
        msg: { author: { id: authorId, bot: false }, content, reply: async p => { daTraLoi.push(p); } },
        daTraLoi,
    };
}

// Cho handler async của collector chạy xong.
const doi = () => new Promise(r => setImmediate(r));

test('trivia — người ra đề không được thưởng nhưng được báo', async t2 => {
    const thuong = [];
    const khoiPhuc = stubDb(db, {
        claimCooldown: async () => false,
        getGuildSettings: async () => ({ language: 'vi' }),
        getUser: async () => ({ locale: 'vi' }),
        addMoney: async (id, n) => { thuong.push(id); return true; },
        updateExp: async () => true,
    });
    const randomGoc = Math.random;
    Math.random = () => 0; // luôn rút câu đầu tiên
    const dapAn = QUIZ[0].a[0];

    try {
        await t2.test('người ra đề gõ ĐÚNG -> không thưởng, được báo một lần', async () => {
            const { interaction, collector } = dungVan();
            await trivia.execute(interaction);
            thuong.length = 0;

            const lan1 = tinNhan(NGUOI_RA_DE, dapAn);
            collector.nhan(lan1.msg); await doi();
            const lan2 = tinNhan(NGUOI_RA_DE, dapAn);
            collector.nhan(lan2.msg); await doi();

            assert.deepStrictEqual(thuong, [], 'người ra đề KHÔNG được thưởng');
            assert.strictEqual(lan1.daTraLoi.length, 1, 'tin đầu tiên phải được báo');
            assert.strictEqual(lan1.daTraLoi[0].content, t('vi', 'commands.dovui.creator_excluded'));
            assert.strictEqual(lan2.daTraLoi.length, 0, 'chỉ báo MỘT lần, không spam');
            collector.stop();
        });

        await t2.test('lời báo không lộ đáp án: tin SAI đầu tiên cũng được báo y hệt', async () => {
            const { interaction, collector } = dungVan();
            await trivia.execute(interaction);

            const sai = tinNhan(NGUOI_RA_DE, 'đoán bừa');
            collector.nhan(sai.msg); await doi();
            const dung = tinNhan(NGUOI_RA_DE, dapAn);
            collector.nhan(dung.msg); await doi();

            assert.strictEqual(sai.daTraLoi.length, 1, 'tin sai đầu tiên vẫn được báo');
            assert.strictEqual(dung.daTraLoi.length, 0, 'tin đúng sau đó không được phản hồi riêng');
            collector.stop();
        });

        await t2.test('người khác gõ đúng sau người ra đề -> người khác thắng', async () => {
            const { interaction, collector, daGui } = dungVan();
            await trivia.execute(interaction);
            thuong.length = 0;

            collector.nhan(tinNhan(NGUOI_RA_DE, dapAn).msg); await doi();
            collector.nhan(tinNhan(NGUOI_KHAC, dapAn).msg); await doi();

            assert.deepStrictEqual(thuong, [NGUOI_KHAC]);
            assert.strictEqual(daGui.length, 1, 'chỉ một embed thắng, không kèm embed hết giờ');
        });
    } finally {
        Math.random = randomGoc;
        khoiPhuc();
    }
});
