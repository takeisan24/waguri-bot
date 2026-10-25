// test/nut_phai_co_nguoi_nhan.test.js — Mọi nút vẽ ra phải có người nhận.
//
// VÌ SAO CÓ: ngày 25-10-2026 phát hiện cả 5 nút `pass:*` của Sổ Sứ Mệnh chết im TỪ NGÀY
// PHÁT HÀNH. `pass.js` có sẵn `handleButton` từ commit gốc `79b5e15`, nhưng dây nối thì
// chưa ai đấu: không router trong `interactionCreate.js`, cũng không collector trong
// `pass.js`. Bấm là "The application did not respond".
//
// ĐIỀU ĐÁNG HỌC NHẤT: `test/battlepass.test.js` ĐÃ xanh suốt, vì nó gọi `bpLib.claimAll`
// thẳng vào DB. Phần lõi chưa bao giờ sai — chỉ thiếu đoạn dây từ cú bấm tới nó. Test lõi
// không bao giờ thấy được loại lỗi này, nên phải có một phép đo ở TẦNG KHÁC: đi từ thứ
// người chơi NHÌN THẤY (nút) ngược về xem có ai nhận không.
//
// Hệ quả thật, đo trên prod 25-10: `battle_pass_users` 130 dòng, XP cao nhất 20.000, mà số
// quà đã nhận là 0 và `is_premium` là 0 — không một ai từng nhận được gì, suốt đời tính
// năng. Log: 21 lần `Chưa ack sau 2501ms: nút pass:claim_all` trong 2 ngày.
//
// GIỚI HẠN ĐÃ BIẾT CỦA CỔNG — đừng tin rộng hơn thực tế:
// Cổng này chỉ hỏi "có ĐƯỜNG nào nhận nút này không", không hỏi "đường đó còn sống lúc
// người ta bấm không". Một tệp có collector thì MỌI nút nó vẽ đều được coi là có người
// nhận, kể cả nút còn sáng sau khi collector đã dừng (đúng ca `bk_btn_orders` của
// `bakery.js`, vá riêng + gác riêng ở `test/bakery_nut_het_han_phai_mo.test.js`). Nới cổng
// này để bắt luôn ca đó thì nó phải suy ra vòng đời collector từ mã tĩnh — đúng cái bẫy
// `lib/canhAck.js` đã ghi: máy quét tĩnh cho 15 báo mà quá nửa SAI thì tệ hơn không có.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..', 'src');
const ROUTER = path.join(GOC, 'events', 'interactionCreate.js');

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (p.endsWith('.js')) out.push(p);
    }
    return out;
}

const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Mọi `setCustomId('x')` trong repo -> [{ tep, dong, raw }]. */
function layNutVeRa(tep) {
    const ra = [];
    const lines = fs.readFileSync(tep, 'utf8').split(/\r?\n/);
    lines.forEach((ln, i) => {
        if (ln.trim().startsWith('//')) return;
        // Chỉ bắt chuỗi HẰNG (không có `${`): id dựng động thì cổng không kết luận được.
        // Phần hằng ở ĐẦU id vẫn đủ để đối chiếu, vì mọi đường nhận đều so khớp từ đầu:
        // `setCustomId(`pass:claim_all:${id}`)` -> raw = "pass:claim_all:".
        for (const m of ln.matchAll(/setCustomId\(\s*[`'"]([^`'"$]+)/g)) {
            if (m[1]) ra.push({ tep, dong: i + 1, raw: m[1] });
        }
    });
    return ra;
}

test('cổng: mọi nút vẽ ra đều có ít nhất một đường nhận', () => {
    const tepJs = duyet(GOC);
    const router = boCmt(fs.readFileSync(ROUTER, 'utf8'));

    // Đường 1 — ROUTER TOÀN CỤC: `interactionCreate.js` so khớp customId với chuỗi hằng.
    // `=== 'x'` là khớp ĐÚNG BẰNG; `.startsWith('x')` là khớp TIỀN TỐ. Phân biệt hai loại
    // chứ không rút cả về "phần trước dấu `:`": router thật dùng cả `'pass:'` (có hai chấm)
    // lẫn `'ann_btn_'`/`'study_'` (gạch dưới), nên quy ước một kiểu là báo đỏ oan hàng loạt.
    const khopBang = new Set();
    const khopTienTo = [];
    for (const m of router.matchAll(/customId\s*===\s*[`'"]([^`'"]+)/g)) khopBang.add(m[1]);
    for (const m of router.matchAll(/customId\.startsWith\(\s*[`'"]([^`'"]+)/g)) khopTienTo.push(m[1]);

    // Đường 3 — Ô MODAL: id của `TextInputBuilder` đọc bằng `getTextInputValue('x')`, không
    // bao giờ đi qua so sánh customId.
    const laOModal = new Set();
    for (const tep of tepJs) {
        const s = boCmt(fs.readFileSync(tep, 'utf8'));
        for (const m of s.matchAll(/getTextInputValue\(\s*[`'"]([^`'"]+)/g)) laOModal.add(m[1]);
    }

    const duocNhan = (raw) => khopBang.has(raw) || khopTienTo.some(p => raw.startsWith(p));

    const chet = [];
    for (const tep of tepJs) {
        const s = boCmt(fs.readFileSync(tep, 'utf8'));
        // Đường 2 — COLLECTOR CỤC BỘ: collector gắn vào ĐÚNG tin nhắn vừa gửi và lọc theo
        // `componentType`, nên nó nhận mọi nút của tin đó mà không cần nhắc tên id.
        const coCollector = /createMessageComponentCollector|awaitMessageComponent/.test(s);
        // Đường 4 — CHỜ CỤC BỘ: chính tệp đó so sánh id (vd `awaitModalSubmit` lọc theo
        // `i.customId === 'announcement_modal'`). Không qua router, nhưng vẫn có người nhận.
        const tuSoKhop = new Set();
        for (const m of s.matchAll(/customId\s*===\s*[`'"]([^`'"]+)/g)) tuSoKhop.add(m[1]);

        for (const nut of layNutVeRa(tep)) {
            if (duocNhan(nut.raw)) continue;
            if (coCollector) continue;
            if (laOModal.has(nut.raw)) continue;
            if (tuSoKhop.has(nut.raw)) continue;
            chet.push(nut);
        }
    }

    assert.deepStrictEqual(chet, [], 'Nút được vẽ ra mà KHÔNG đường nào nhận '
        + '(người chơi bấm sẽ thấy "The application did not respond"):\n'
        + chet.map(n => `  · ${path.relative(GOC, n.tep)}:${n.dong} -> "${n.raw}"`).join('\n')
        + '\n  Sửa bằng MỘT trong ba: thêm nhánh vào `src/events/interactionCreate.js`, '
        + 'gắn collector trong cùng tệp, hoặc (nếu là ô modal) đọc bằng `getTextInputValue`.');
});

test('cổng: nút `pass:*` phải được router nhận, và handleButton phải có người gọi', () => {
    const router = boCmt(fs.readFileSync(ROUTER, 'utf8'));

    // Phép kiểm hẹp và cụ thể cho đúng lỗi đã xảy ra. Cổng tổng ở trên có thể bị nới nếu
    // sau này ai thêm collector vào `pass.js`; phép này thì không nới được.
    assert.match(router, /customId\.startsWith\(\s*['"]pass:['"]\s*\)/,
        '`interactionCreate.js` phải có nhánh nhận `pass:` — thiếu nó thì cả 5 nút Sổ Sứ '
        + 'Mệnh chết im như trước 25-10-2026 (130 người tích XP, 0 người nhận được quà).');

    assert.match(router, /\.handleButton\(/,
        '`pass.handleButton` phải được GỌI từ router. Nó đã tồn tại từ commit gốc `79b5e15` '
        + 'mà không ai gọi — hàm viết xong không có người gọi thì bằng không có hàm.');

    // `handleButton` nhận (interaction, args) với args = phần sau `pass:`. Cắt sai thì
    // `action` thành `'pass'` và mọi nhánh trong handleButton đều trượt, lặng lẽ.
    assert.match(router, /customId\.split\(\s*['"]:['"]\s*\)\.slice\(\s*1\s*\)/,
        'args phải là phần SAU `pass:` (`split(\':\').slice(1)`), nếu không `action` sẽ là '
        + '"pass" và mọi nhánh trong `handleButton` trượt hết mà không báo gì.');
});

// Hai cổng trên đọc MÃ. Cổng dưới đây BẤM THẬT.
//
// Vì sao cần cả hai: phép đọc mã chỉ chứng minh đoạn chữ có mặt, KHÔNG chứng minh cú bấm
// tới được nó. Khối nút trong `interactionCreate.js` là một chuỗi `if ... return` dài; một
// nhánh đứng trước mà khớp rộng hơn (vd ai đó đổi `'pay:'` thành `'pa'`) sẽ nuốt `pass:`
// trước khi tới lượt, và cổng đọc-mã vẫn xanh vì chữ vẫn nguyên ở dưới.
test('bấm thật: nút `pass:claim_all:<id>` phải tới được handleButton với args đã cắt đúng', async () => {
    const handler = require(path.join(GOC, 'events', 'interactionCreate.js'));

    const goiVoi = [];
    const nguoi = { id: '123456789012345678' };
    const interaction = {
        isAutocomplete: () => false,
        isChatInputCommand: () => false,
        isButton: () => true,
        isStringSelectMenu: () => false,
        isModalSubmit: () => false,
        isUserContextMenuCommand: () => false,
        isMessageContextMenuCommand: () => false,
        customId: `pass:claim_all:${nguoi.id}`,
        user: nguoi,
        guildId: '987654321098765432',
        locale: 'vi',
        createdTimestamp: Date.now(),
        replied: false,
        deferred: false,
        client: {
            commands: new Map([['pass', {
                handleButton: async (it, args) => { goiVoi.push(args); it.deferred = true; },
            }]]),
        },
        reply: async () => { throw new Error('không được rơi vào nhánh chặn/lỗi'); },
    };

    await handler.execute(interaction);

    assert.strictEqual(goiVoi.length, 1,
        '`pass.handleButton` KHÔNG được gọi — cú bấm không tới được nó. Đây đúng là trạng '
        + 'thái của bot từ commit `79b5e15` tới 25-10-2026.');
    assert.deepStrictEqual(goiVoi[0], ['claim_all', nguoi.id],
        'args phải là [action, targetUserId]. `handleButton` đọc args[0] làm action và args[1] '
        + 'làm chủ nút; cắt lệch một ô là mọi nhánh trượt, hoặc ai cũng bấm được nút người khác.');
});
