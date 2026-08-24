// ============================================================
// test/cau_ca_khong_khoe_hao.test.js — `/fish` không được khoe món chưa vào giỏ.
//
// VÌ SAO CÓ: `fishDrops` cấp vật phẩm bằng `db.giveItemAdmin(...)` rồi cộng thẳng dòng khoe
// vào mô tả, KHÔNG kiểm giá trị trả về. Mà `giveItemAdmin` trả `false`/`null` khi DB lỗi.
// Lúc Supabase chập chờn, người chơi đọc được:
//
//     "🏮 Giỏ cá có thêm 1× Cá Rồng Kim Long 👑 (vật phẩm Sử Thi siêu hiếm!)"
//
// mà giỏ trống. Tám chỗ như vậy trong một hàm.
//
// NẶNG HƠN lớp "thông báo lỗi sai" đã xếp Backlog: ở đó người dùng chỉ bối rối rồi thử lại,
// không mất gì. Ở đây LƯỢT CÂU ĐÃ BỊ TIÊU (năng lượng + độ bền cần câu), nên cú may hiếm
// mất luôn. `/fish` cũng là tính năng CÓ NGƯỜI DÙNG THẬT: 37 lượt / 7 người trong 30 ngày
// (đo prod 2026-08-24), khác hẳn `/clan` hay huy hiệu vốn 0 lượt.
//
// Cổng này chốt: mọi lời cấp vật phẩm phải đi qua `traoCa()`, và mọi dòng khoe phải nằm sau
// `if (daTrao)`.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const src = () => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'fish.js'), 'utf8'));

test('cấp vật phẩm chỉ đi qua MỘT cửa, và cửa đó kiểm kết quả', () => {
    const s = src();

    const goiTrucTiep = (s.match(/await\s+db\.giveItemAdmin\(/g) || []).length;
    assert.strictEqual(goiTrucTiep, 1,
        `Có ${goiTrucTiep} lời gọi db.giveItemAdmin. Chỉ được đúng MỘT — nằm trong traoCa().\n`
        + 'Gọi thẳng ở nhánh drop nghĩa là chỗ đó lại bỏ qua kết quả.');

    assert.match(s, /async function traoCa\([\s\S]{0,220}?const ok = await db\.giveItemAdmin\([\s\S]{0,120}?if \(!ok\) return false;/,
        'traoCa() phải kiểm kết quả giveItemAdmin và trả false khi cấp hỏng.');
});

test('không dòng khoe nào chạy khi cấp vật phẩm thất bại', () => {
    const s = src();
    const dong = s.split('\n');

    const khoe = dong.filter(l => /desc \+=/.test(l));
    assert.ok(khoe.length >= 8, `Chỉ thấy ${khoe.length} dòng khoe — file đã đổi hình, xem lại cổng.`);

    const hoLung = khoe.filter(l => !/if \(daTrao\)/.test(l));
    assert.deepStrictEqual(hoLung.map(l => l.trim().slice(0, 60)), [],
        'Còn dòng cộng mô tả KHÔNG nằm sau `if (daTrao)`. Người chơi sẽ được báo đã bắt được\n'
        + 'món mà giỏ trống — và lượt câu thì đã tiêu.');
});

test('mỗi nhánh drop phải ĐẶT LẠI cờ trước khi khoe', () => {
    const s = src();
    // Cờ dùng chung cho nhiều nhánh: nếu một nhánh quên gán, nó sẽ ăn theo kết quả của
    // nhánh chạy trước đó trong cùng lượt — khoe món chưa hề được cấp.
    const soGan = (s.match(/daTrao = await traoCa\(/g) || []).length;
    const soKhoe = (s.match(/if \(daTrao\) desc \+=/g) || []).length;
    assert.strictEqual(soGan, soKhoe,
        `${soGan} chỗ gán cờ nhưng ${soKhoe} chỗ khoe — lệch nghĩa là có nhánh khoe mà không\n`
        + 'gán lại cờ, hoặc gán rồi mà quên khoe.');
});

test('discoverItem hỏng KHÔNG được chặn phần khoe', () => {
    const s = src();
    // `discoverItem` chỉ đánh dấu bộ sưu tập — hỏng thì không mất gì. Nếu ai đó siết luôn
    // cả nó thì người chơi mất dòng khoe dù vật phẩm ĐÃ vào giỏ: sai theo chiều ngược lại.
    assert.match(s, /const ok = await db\.giveItemAdmin\([\s\S]{0,140}?await db\.discoverItem\(/,
        'discoverItem phải chạy SAU khi đã cấp thành công, và kết quả của nó không được\n'
        + 'dùng để quyết định có khoe hay không.');
    assert.doesNotMatch(s, /if \(!\s*await db\.discoverItem\(/,
        'Đang chặn theo kết quả discoverItem — sai chiều: vật phẩm đã vào giỏ mà không báo.');
});
