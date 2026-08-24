// test/ack_path.test.js — Gác ĐƯỜNG TRƯỚC ACK của interactionCreate.
//
// VÌ SAO CÓ: Discord huỷ một interaction nếu bot không ack trong 3 GIÂY. `deferReply()` nằm
// BÊN TRONG `command.execute()`, nên mọi thứ chạy trước lời gọi đó đều ăn vào ngân sách 3
// giây — trong khi `database.js` đặt `SUPABASE_TIMEOUT_MS = 10_000`, tức MỘT lời gọi DB
// không bọc trần đã đủ giết interaction.
//
// Chuyện đã xảy ra đúng như vậy: `getInteractionLanguage` được bọc `withTimeout(800)` kèm
// chú thích "để không kẹt đường ack", nhưng `getJail` và `db.getUser` nằm trên CÙNG đường
// thì bị bỏ sót — vì hàm `withTimeout` khi đó là biến riêng tư trong `i18n.js`, không ai
// với tới được. Ba `await` nối tiếp, worst case 10 + 0,8 + 10 = 20,8 giây cho hạn 3 giây.
//
// Test này đọc mã nguồn (không chạy bot) và bắt: mọi `await f(...)` nằm giữa đầu nhánh
// slash-command và `await command.execute(` phải là hàm ĐÃ CÓ TRẦN THỜI GIAN.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const NGUON = path.join(__dirname, '..', 'src', 'events', 'interactionCreate.js');

// Hàm được phép `await` trên đường trước ack, kèm LÝ DO đã chặn trần bằng cách nào.
// Thêm tên vào đây = khẳng định hàm đó không thể chạy quá ~1 giây. Đừng thêm bừa.
const CO_TRAN = {
    getInteractionLanguage: 'lib/i18n.js — cache 60s + withTimeout(ACK_LOOKUP_TIMEOUT) quanh mỗi lần đọc DB',
};

// Hàm KHÔNG chạm DB, được phép xuất hiện trong biểu thức khởi tạo một promise chờ sẵn.
// Danh sách này KHÔNG nới cho `await` — nó chỉ nói "gọi cái này không tốn vòng mạng nào".
const THUAN_BO_NHO = {
    isBlocked: 'lib/jail.js — tra một Set trong bộ nhớ',
    catch: 'method của Promise, không phải lời gọi mới',
    startsWith: 'String.prototype',
};

const boComment = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('ack: mọi await trước command.execute() đều có trần thời gian', () => {
    const nguyen = fs.readFileSync(NGUON, 'utf8');

    const batDau = nguyen.indexOf('interaction.isChatInputCommand()');
    const ketThuc = nguyen.indexOf('await command.execute(');
    assert.ok(batDau !== -1, 'Không tìm thấy nhánh slash-command — test cần cập nhật theo cấu trúc file mới.');
    assert.ok(ketThuc !== -1, 'Không tìm thấy `await command.execute(` — test cần cập nhật theo cấu trúc file mới.');
    assert.ok(batDau < ketThuc, 'Thứ tự bất ngờ: nhánh slash-command phải nằm trước command.execute().');

    const doan = boComment(nguyen.slice(batDau, ketThuc));

    // Bắt cả `await f(` lẫn `await a.b(` — lời gọi DB hay được viết dạng `await db.getUser(`.
    const goi = [...doan.matchAll(/\bawait\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\(/g)]
        .map(m => m[1]);

    const viPham = [...new Set(goi)].filter(ten => !CO_TRAN[ten]);

    // ---- LỖ HỔNG ĐÃ TỪNG MỞ RA, NAY BỊT LẠI ----------------------------------------
    // Ngày 24-08, hai lời tra DB trên đường này từng được cho chạy SONG SONG để hạ trần từ
    // 1,6s xuống 800ms. Cách viết khi đó đổi từ `await getJailForAck(id)` thành:
    //     const jailPromise = ... ? getJailForAck(id).catch(...) : null;
    //     ...
    //     const jail = await jailPromise;
    // (Sau đó vòng DB "giam" bị gỡ hẳn — xem test dưới — nhưng cái bẫy thì vẫn còn nguyên
    // cho lần tới ai đó muốn bắn trước await sau, nên phần soi này ở lại.)
    // Regex ở trên chỉ bắt `await <tên>(`, nên `await jailPromise;` LỌT QUA — cổng vẫn xanh
    // trong khi nó đã thôi nhìn thấy lời gọi DB đó. Đúng kiểu mù mà chính file này sinh ra
    // để chặn. Nên soi thêm: mọi `await <biến>` trần thì biến ấy phải khởi tạo từ hàm CÓ TRẦN.
    const awaitBien = [...doan.matchAll(/\bawait\s+([A-Za-z_$][\w$]*)\s*(?![\w$.(])/g)].map(m => m[1]);

    const bienXau = [];
    for (const ten of new Set(awaitBien)) {
        // String.raw: trong chuỗi nháy đơn thường, '\s' bị JS nuốt còn 's' -> regex khớp bừa.
        const khai = doan.match(new RegExp(String.raw`(?:const|let|var)\s+${ten}\s*=([\s\S]*?);`));
        if (!khai) { bienXau.push(ten + ' (không tìm thấy nơi khai báo trong đoạn này)'); continue; }
        const hamGoi = [...khai[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
        const la = [...new Set(hamGoi.filter(h => !CO_TRAN[h] && !THUAN_BO_NHO[h]))];
        if (la.length) bienXau.push(ten + ' (khởi tạo từ: ' + la.join(', ') + ')');
    }

    assert.deepStrictEqual(
        bienXau, [],
        '\n❌ Có `await <biến>` trên đường trước ack mà biến đó khởi tạo từ hàm KHÔNG CÓ TRẦN:\n' +
        bienXau.map(v => '   • ' + v).join('\n') +
        '\n\nBắn promise trước rồi await sau VẪN LÀ chờ DB — chỉ khác là regex `await f(` không\n' +
        'nhìn thấy. Bọc withTimeout(..., ACK_LOOKUP_TIMEOUT) rồi khai tên hàm vào CO_TRAN\n' +
        '(hoặc THUAN_BO_NHO nếu nó không chạm DB) trong test này.\n'
    );

    assert.deepStrictEqual(
        viPham, [],
        '\n❌ Có await KHÔNG CÓ TRẦN trên đường trước ack của interactionCreate:\n' +
        viPham.map(v => `   • await ${v}(…)`).join('\n') +
        '\n\nDiscord huỷ interaction sau 3 giây, mà SUPABASE_TIMEOUT_MS là 10 giây — một lời\n' +
        'gọi DB trần trụi ở đây đủ làm lệnh chết với "This interaction failed".\n' +
        'Cách xử lý, chọn một:\n' +
        '   1. Bỏ await (nếu là việc phụ best-effort) — nhớ .catch() để khỏi unhandledRejection.\n' +
        '   2. Bọc withTimeout(..., ACK_LOOKUP_TIMEOUT) từ src/lib/timeout.js, rồi thêm tên\n' +
        '      hàm vào CO_TRAN trong test này kèm lý do.\n'
    );
});

test('ack: khối đồng bộ role ở server support không được await', () => {
    const nguyen = fs.readFileSync(NGUON, 'utf8');

    // Chỉ soi ĐÚNG khối đồng bộ role, không soi cả file: sau khi defer thì `await db.getUser()`
    // là hợp lệ (handler nút `profile:toggle` chẳng hạn), cấm toàn cục sẽ báo nhầm.
    const tu = nguyen.indexOf('SUPPORT_GUILD_ID');
    const den = nguyen.indexOf('const locale = await getInteractionLanguage');
    assert.ok(tu !== -1 && den !== -1 && tu < den,
        'Không khoanh được khối đồng bộ role — test cần cập nhật theo cấu trúc file mới.');

    const khoi = boComment(nguyen.slice(tu, den));
    const coAwait = [...khoi.matchAll(/\bawait\s+([A-Za-z_$][\w$.]*)\s*\(/g)].map(m => m[1]);

    assert.deepStrictEqual(
        coAwait, [],
        '\n❌ Khối đồng bộ role ở server support đã có await trở lại: ' + coAwait.join(', ') + '\n' +
        '   Đây là việc phụ best-effort, người dùng không chờ kết quả. Trước đây\n' +
        '   `await db.getUser()` ở đây bắt MỌI tương tác tại server support phải đợi một vòng\n' +
        '   DB trước khi lệnh kịp deferReply. Dùng .then()/.catch() thay vì await.\n'
    );
});

test('ack: withTimeout là helper DÙNG CHUNG, không phải hàm riêng tư', () => {
    // Gốc của lỗi: withTimeout từng nằm riêng trong i18n.js nên hai lời gọi DB khác trên cùng
    // đường không dùng được. Nếu ai gộp ngược lại, lỗi cũ có đất tái diễn.
    const { withTimeout, ACK_LOOKUP_TIMEOUT } = require('../src/lib/timeout');
    assert.strictEqual(typeof withTimeout, 'function', 'src/lib/timeout.js phải export withTimeout');
    assert.ok(Number.isInteger(ACK_LOOKUP_TIMEOUT) && ACK_LOOKUP_TIMEOUT > 0 && ACK_LOOKUP_TIMEOUT <= 1500,
        `ACK_LOOKUP_TIMEOUT phải là số ms hợp lý cho ngân sách 3 giây (đang là ${ACK_LOOKUP_TIMEOUT})`);
});

test('ack: chặn giam KHÔNG còn tra DB trên đường trước ack', () => {
    // Đổi ngày 24-08. Trước đây chỗ này `await getJailForAck(id)` — một vòng DB nằm chắn
    // trước ack của 18 lệnh đông nhất, và chính nó đẻ ra dòng `[JAIL] Tra cứu quá 800ms`.
    // Đo lại thì nó canh một tính năng chưa từng chạy: `/rob` không giam ai (chỉ phạt tiền),
    // chỉ trộm heo/cây mới giam, và tại thời điểm đo 0/391 người từng bị giam.
    // Nay danh sách giam nằm trong RAM như `lib/bans.js`, kiểm tra ĐỒNG BỘ.
    const jail = require('../src/lib/jail');
    assert.strictEqual(typeof jail.isJailed, 'function', 'lib/jail.js phải export isJailed');
    assert.strictEqual(jail.isJailed.constructor.name, 'Function',
        'isJailed phải ĐỒNG BỘ — async ở đây là quay lại đúng vấn đề vừa gỡ');
    assert.strictEqual(jail.getJailForAck, undefined,
        'getJailForAck đã bị gỡ; còn sót nghĩa là vẫn có đường tra DB trước ack');

    const nguyen = fs.readFileSync(NGUON, 'utf8');
    const doanTruocAck = boComment(
        nguyen.slice(nguyen.indexOf('interaction.isChatInputCommand()'), nguyen.indexOf('await command.execute(')));
    assert.ok(doanTruocAck.includes('isJailed('), 'Đường trước ack phải dùng isJailed()');
    assert.ok(!/await\s+\w*[Jj]ail/.test(doanTruocAck),
        'Không được await bất kỳ hàm giam nào trên đường trước ack');
});

test('ack: withTimeout trả undefined khi quá hạn, không ném lỗi', async () => {
    const { withTimeout } = require('../src/lib/timeout');

    const cham = new Promise(resolve => setTimeout(() => resolve('xong'), 300));
    assert.strictEqual(await withTimeout(cham, 30), undefined, 'Quá hạn phải trả undefined');

    const nhanh = Promise.resolve('kịp');
    assert.strictEqual(await withTimeout(nhanh, 300), 'kịp', 'Kịp hạn phải trả đúng giá trị');

    const nem = Promise.reject(new Error('DB sập'));
    assert.strictEqual(await withTimeout(nem, 300), undefined, 'Promise lỗi phải trả undefined chứ không ném ra');
});
