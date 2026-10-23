// ============================================================
// test/cay_cuoc_khong_khoe_hao.test.js — cày cuốc không được khoe món chưa vào kho.
//
// (Trước là `cau_ca_khong_khoe_hao.test.js`, chỉ gác `/fish`. Mở rộng 23/10 khi đo lưu lượng
// để xếp priority: `/fish` `/mine` `/chop` dùng CHUNG `lib/gather.js`, và chính ở đó còn BỐN
// chỗ trao vật phẩm không kiểm kết quả — trên bề mặt 1.712 bút toán/30 ngày, tức ~107 lần
// lưu lượng của `/farm`. Cổng cũ xanh suốt vì nó chỉ soi mỗi fish.js.)
//
// VÌ SAO CÓ: `giveItemAdmin` trả `false`/`null` khi DB lỗi. Bỏ trôi giá trị đó rồi cộng dòng
// khoe vào mô tả nghĩa là người chơi đọc được
//
//     "✨ Đất đá sụt lở để lộ ra: 1× Vàng Đông Triều 🟡 (Quặng hiếm!)"
//
// mà kho trống. NẶNG HƠN lớp "thông báo lỗi sai": ở đó người dùng chỉ bối rối rồi thử lại.
// Ở đây NĂNG LƯỢNG VÀ ĐỘ BỀN CÔNG CỤ ĐÃ BỊ TIÊU, và với hai món 1% / 0,5% thì cú may hàng
// tuần mất luôn.
//
// CHỐT BA ĐIỀU:
//   (A) Toàn repo: không chỗ nào được gọi `db.giveItemAdmin(...)` rồi bỏ trôi kết quả.
//   (B) Cả ba hoạt động cày cuốc đi qua ĐÚNG MỘT cửa — `moSoTrao` trong lib/gather.js.
//   (C) Cửa đó xử sự đúng: trao được thì im, trao hụt thì nói + ghi log + KHÔNG trao lại.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const docSach = (...p) => boCmt(doc(...p));

// ---- bản giả của database.js, cài TRƯỚC khi nạp gather.js ----
const dbPath = require.resolve('../src/database.js');
let traoThanhCong = true;
let khamPhaThanhCong = true;
const daGoiTrao = [];
const daGoiKhamPha = [];
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        giveItemAdmin: async (u, itemId, qty) => { daGoiTrao.push(`${itemId}x${qty}`); return traoThanhCong; },
        discoverItem: async (u, itemId) => { daGoiKhamPha.push(itemId); return khamPhaThanhCong; },
        // Chỉ được gọi ở ĐƯỜNG HỎNG, để lấy tên tiếng Việt từ cột `items.name`.
        getItem: async (itemId) => ({ name: `TÊN-${itemId}` }),
    },
};

const { moSoTrao } = require('../src/lib/gather.js');

const logGoc = console.error;
const daLog = [];
console.error = (...a) => { daLog.push(a.join(' ')); };
test.after(() => { console.error = logGoc; });

function dat(ok, khamPha = true) {
    traoThanhCong = ok;
    khamPhaThanhCong = khamPha;
    daGoiTrao.length = 0;
    daGoiKhamPha.length = 0;
    daLog.length = 0;
}

// =====================================================================
// (C) Cửa trao xử sự đúng
// =====================================================================

test('phép đo tự kiểm: bản giả database.js có được dùng thật', async () => {
    dat(true);
    await moSoTrao('vi').trao('u1', 'quang_sat', 1, 'material');
    assert.deepStrictEqual(daGoiTrao, ['quang_satx1'],
        'không lời trao nào đi qua bản giả -> mọi phép kiểm dưới đây vô nghĩa');
});

test('trao được -> trả true, im lặng, không ghi log', async () => {
    dat(true);
    const so = moSoTrao('vi');
    assert.strictEqual(await so.trao('u1', 'quang_sat', 2, 'material'), true);
    assert.strictEqual(so.canhBao(), '', 'trao thành công thì đừng làm người chơi lo');
    assert.deepStrictEqual(daLog, [], 'trao thành công thì đừng ghi [PAYOUT FAIL]');
    assert.deepStrictEqual(daGoiKhamPha, ['quang_sat'],
        'trao xong phải đánh dấu bộ sưu tập — thiếu là /album không bao giờ đủ');
});

test('trao HỤT -> trả false, nói ra, ghi log, và KHÔNG trao lại', async () => {
    dat(false);
    const so = moSoTrao('vi');
    assert.strictEqual(await so.trao('u1', 'vang_dong_tren', 1, 'rare-ore'), false);

    assert.match(so.canhBao(), /vật phẩm chưa ghi nhận xong/,
        'năng lượng + độ bền đã tiêu mà kho trống -> không được im lặng');
    assert.strictEqual(daGoiTrao.length, 1,
        '`false` có thể là timeout SAU khi DB đã ghi -> trao lại là trao hai lần');
    assert.ok(daLog.some((x) => x.includes('[PAYOUT FAIL]') && x.includes('rare-ore')
        && x.includes('vang_dong_tren')),
    `phải ghi [PAYOUT FAIL] kèm nhãn + mã món để admin truy được. Thực tế: ${JSON.stringify(daLog)}`);
});

test('trao HỤT -> KHÔNG đánh dấu bộ sưu tập', async () => {
    dat(false);
    await moSoTrao('vi').trao('u1', 'ky_nam', 1, 'rare-wood');
    assert.deepStrictEqual(daGoiKhamPha, [],
        'món chưa vào kho mà đã ghi "đã khám phá" -> /album khoe món người chơi không có');
});

test('cảnh báo KÈM TÊN món, vì cái tên mới là thứ dùng để đối chiếu', async () => {
    dat(false);
    const so = moSoTrao('vi');
    await so.trao('u1', 'quang_sat', 3, 'material');
    const cb = so.canhBao();
    // vi.json CỐ Ý không dịch `data.items.*` -> tên phải lấy từ cột `items.name` qua getItem.
    assert.match(cb, /TÊN-quang_sat/,
        'câu `common.item_unconfirmed` chỉ nói "có món chưa ghi nhận xong", không nói món nào');
    assert.match(cb, /3× TÊN-quang_sat/, 'hụt nhiều cái thì phải nói rõ bao nhiêu cái');
});

test('một lượt hụt NHIỀU món -> cảnh báo đúng MỘT lần, liệt kê hết', async () => {
    dat(false);
    const so = moSoTrao('vi');
    await so.trao('u1', 'quang_sat', 1, 'material');
    await so.trao('u1', 'vang_dong_tren', 1, 'rare-ore');
    await so.trao('u1', 'trung_su_thi', 1, 'pet-egg');

    const cb = so.canhBao();
    const soLanCanhBao = (cb.match(/vật phẩm chưa ghi nhận xong/g) || []).length;
    assert.strictEqual(soLanCanhBao, 1,
        'ba dòng cảnh báo giống nhau còn khó hiểu hơn là không nói — phải gom một lần');
    for (const m of ['TÊN-quang_sat', 'TÊN-vang_dong_tren', 'TÊN-trung_su_thi']) {
        assert.match(cb, new RegExp(m), `thiếu ${m} trong danh sách món hụt`);
    }
});

test('discoverItem hỏng KHÔNG được làm mất dòng khoe', async () => {
    // `discoverItem` chỉ đánh dấu bộ sưu tập — hỏng thì không mất gì. Siết luôn cả nó là sai
    // theo chiều ngược lại: vật phẩm ĐÃ vào kho mà người chơi không được báo.
    dat(true, false);
    const so = moSoTrao('vi');
    assert.strictEqual(await so.trao('u1', 'ca_tuoi', 1, 'fish'), true,
        'vật phẩm đã vào kho thì phải trả true dù discoverItem hỏng');
    assert.strictEqual(so.canhBao(), '', 'không được cảnh báo khi vật phẩm thực sự đã vào kho');
});

test('cả hai ngôn ngữ đều có câu cảnh báo — đọc THẲNG tệp JSON', () => {
    // KHÔNG kiểm qua `t()`: `t()` rơi về bản Việt khi thiếu khoá tiếng Anh, nên phép kiểm
    // viết qua nó sẽ XANH GIẢ trong khi người dùng EN đọc tiếng Việt (bẫy ghi nhận 23/10).
    for (const f of ['vi.json', 'en.json']) {
        const j = JSON.parse(doc('src', 'locales', f));
        assert.ok(typeof j?.common?.item_unconfirmed === 'string' && j.common.item_unconfirmed.length > 20,
            `${f}: thiếu \`common.item_unconfirmed\` -> người chơi đọc chuỗi rỗng khi mất món`);
    }
});

// =====================================================================
// (B) Một cửa duy nhất cho cả ba hoạt động
// =====================================================================

test('gather.js: chỉ MỘT lời gọi giveItemAdmin, và nó kiểm `=== true`', () => {
    const s = docSach('src', 'lib', 'gather.js');
    const soGoi = (s.match(/db\.giveItemAdmin\(/g) || []).length;
    assert.strictEqual(soGoi, 1,
        `Có ${soGoi} lời gọi db.giveItemAdmin trong gather.js. Chỉ được đúng MỘT — nằm trong\n`
        + 'moSoTrao(). Gọi thẳng ở nhánh drop nghĩa là chỗ đó lại bỏ qua kết quả.');

    assert.match(s, /if \(\(await db\.giveItemAdmin\([^)]*\)\) === true\)/,
        'Cửa phải so `=== true`, không phải `if (ok)`: `giveItemAdmin` có thể trả `null`, và\n'
        + 'một ngày nào đó trả object thì `if (ok)` thành luôn-đúng.');
});

test('gather.js: không lời trao nào bị bỏ trôi kết quả', () => {
    const s = docSach('src', 'lib', 'gather.js');
    const soTrao = (s.match(/so\.trao\(/g) || []).length;
    assert.strictEqual(soTrao, 4,
        `Thấy ${soTrao} lời \`so.trao(\` — cần 4 (nguyên liệu · Vàng Đông Triều · Kỳ Nam ·\n`
        + 'trứng thú cưng). Lệch thì cập nhật cổng này kèm lý do, đừng sửa số cho xanh.');

    const boTroi = s.split(/\r?\n/)
        .filter((l) => /^\s*await\s+so\.trao\([^;]*\);\s*$/.test(l))
        .map((l) => l.trim());
    assert.deepStrictEqual(boTroi, [],
        'Có lời `await so.trao(...)` đứng một mình -> kết quả bị bỏ trôi, đúng lại cái lỗi\n'
        + 'mà cửa này sinh ra để chặn.');
});

test('fish.js: đã bỏ cửa riêng, đi chung cửa với /mine và /chop', () => {
    const s = docSach('src', 'commands', 'economy', 'fish.js');
    assert.strictEqual((s.match(/db\.giveItemAdmin\(/g) || []).length, 0,
        'fish.js không được tự gọi giveItemAdmin nữa — một cửa thì chỉ một chỗ biết luật.');
    assert.strictEqual((s.match(/so\.trao\(/g) || []).length, 8,
        '8 nhánh drop của fish.js phải đều đi qua sổ trao.');
    assert.doesNotMatch(s, /async function traoCa\(/,
        'Cửa riêng `traoCa` đã bị gỡ: nó CÓ kiểm kết quả nhưng không ghi log và không nói gì\n'
        + 'với người chơi -> mẻ Cá Rồng 0,1% hụt thì biến mất không dấu vết.');
});

test('fish.js: không dòng khoe nào chạy khi trao thất bại', () => {
    const s = docSach('src', 'commands', 'economy', 'fish.js');
    const khoe = s.split(/\r?\n/).filter((l) => /desc \+=/.test(l));
    assert.ok(khoe.length >= 8, `Chỉ thấy ${khoe.length} dòng khoe — file đã đổi hình, xem lại cổng.`);

    const hoLung = khoe.filter((l) => !/if \(daTrao\)/.test(l));
    assert.deepStrictEqual(hoLung.map((l) => l.trim().slice(0, 60)), [],
        'Còn dòng cộng mô tả KHÔNG nằm sau `if (daTrao)`. Người chơi sẽ được báo đã bắt được\n'
        + 'món mà giỏ trống — và lượt câu thì đã tiêu.');

    const soGan = (s.match(/daTrao = await so\.trao\(/g) || []).length;
    const soKhoe = (s.match(/if \(daTrao\) desc \+=/g) || []).length;
    assert.strictEqual(soGan, soKhoe,
        `${soGan} chỗ gán cờ nhưng ${soKhoe} chỗ khoe — cờ dùng chung cho nhiều nhánh, nhánh\n`
        + 'nào quên gán sẽ ăn theo kết quả của nhánh chạy trước trong cùng lượt.');
});

test('ba lệnh cày cuốc đều chạy qua runGather, không ai đi lối riêng', () => {
    for (const ten of ['fish', 'mine', 'chop']) {
        const s = docSach('src', 'commands', 'economy', `${ten}.js`);
        assert.match(s, /require\('\.\.\/\.\.\/lib\/gather'\)/,
            `/${ten} không nạp lib/gather -> nó có đường trao riêng, ngoài tầm cổng này.`);
    }
});

// =====================================================================
// (A) Quét toàn repo — chặn lớp lỗi này mọc lại ở tệp khác
// =====================================================================

// Chỗ CỐ Ý bỏ trôi kết quả, kèm lý do đã kiểm. Thêm vào đây phải nêu được vì sao trao hụt
// KHÔNG làm người chơi mất gì.
const MIEN = {
    'src/commands/economy/quest.js': 'cấp `bo_lam_banh` rồi gọi NGAY `db.bakeryOpen(userId, cost, '
        + "'bo_lam_banh')` — RPC đó tự kiểm lại dụng cụ, nên trao hụt bị bắt ở nhánh else và "
        + 'tiền vốn cũng chưa bị trừ (bakeryOpen nguyên tử). Không có lời nói sai nào.',
};

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

test('toàn repo: không chỗ nào trao vật phẩm rồi bỏ trôi kết quả', () => {
    const viPham = [];
    for (const f of duyet(path.join(ROOT, 'src'))) {
        const rel = path.relative(ROOT, f).replace(/\\/g, '/');
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        s.split(/\r?\n/).forEach((l, i) => {
            if (!/^\s*await\s+db\.giveItemAdmin\([^;]*\);\s*$/.test(l)) return;
            if (MIEN[rel]) return;
            viPham.push(`${rel}:${i + 1}: ${l.trim()}`);
        });
    }
    assert.deepStrictEqual(viPham, [],
        'Trao vật phẩm mà không đọc kết quả. `giveItemAdmin` trả `false`/`null` khi DB lỗi;\n'
        + 'bỏ trôi nghĩa là người chơi được báo đã nhận trong khi kho trống — và thứ đã bị\n'
        + 'tiêu để đổi lấy món đó (năng lượng, cái cây, con heo) thì không lấy lại được.\n'
        + 'Sửa theo khuôn: kiểm `=== true`, cộng `common.item_unconfirmed`, ghi [PAYOUT FAIL],\n'
        + 'và TUYỆT ĐỐI không trao lại. Nếu thật sự vô hại thì thêm vào MIEN kèm lý do.');
});

test('danh sách MIEN phải còn đúng — mỗi mục kèm lý do thật', () => {
    for (const [rel, lyDo] of Object.entries(MIEN)) {
        assert.ok(fs.existsSync(path.join(ROOT, rel)), `MIEN nêu ${rel} nhưng tệp không còn.`);
        assert.ok(lyDo && lyDo.length > 40, `MIEN[${rel}] thiếu lý do thật.`);
        const s = boCmt(doc(rel));
        assert.ok(/await\s+db\.giveItemAdmin\(/.test(s),
            `${rel} không còn gọi giveItemAdmin — bỏ nó khỏi MIEN để cổng khỏi rộng vô ích.`);
    }
    // Lý do của quest.js chỉ đứng được nếu bakeryOpen VẪN kiểm lại dụng cụ ngay sau đó.
    const q = boCmt(doc('src/commands/economy/quest.js'));
    assert.match(q, /db\.giveItemAdmin\(userId, 'bo_lam_banh', 1\)[\s\S]{0,400}?db\.bakeryOpen\(userId, openCost, 'bo_lam_banh'\)/,
        'quest.js được miễn VÌ bakeryOpen kiểm lại `bo_lam_banh` ngay sau lời trao. Cặp đó đã\n'
        + 'rời nhau -> lý do miễn không còn đứng được, phải vá như các chỗ khác.');
});

// =====================================================================
// Ba chỗ mất mát CHÉO / tiêu-trước-trao-sau ngoài đường cày cuốc
// =====================================================================

test('trộm heo / trộm cây: tiêu tài sản NGƯỜI KHÁC thì phải kiểm lời trao', () => {
    // Nặng nhất của cả lớp lỗi: `pigClaimSale`/`plantClaim` xoá heo/cây của NẠN NHÂN trước,
    // rồi mới trao cho kẻ trộm. Hụt là hai người cùng mất, và cả hai đọc chữ "thành công".
    const ca = [
        ['src/lib/pig.js', /const meatId = MEAT\[claim\.tier\];\s*\r?\n\s*const daTrao = \(await db\.giveItemAdmin\(thiefId, meatId, 1\)\) === true;/, 'pig-steal'],
        ['src/lib/plant.js', /const nongSan = produceId\(claim\.tier, claim\.is_flower\);\s*\r?\n\s*const daTrao = \(await db\.giveItemAdmin\(thiefId, nongSan, 1\)\) === true;/, 'plant-steal'],
    ];
    for (const [tep, re, nhan] of ca) {
        const s = boCmt(doc(tep));
        assert.match(s, re, `${tep}: lời trao cho kẻ trộm không còn kiểm \`=== true\`.`);
        assert.match(s, new RegExp(`\\[PAYOUT FAIL\\][^\\n]*${nhan}`),
            `${tep}: thiếu log [PAYOUT FAIL] ${nhan} — không có log thì admin không truy được\n`
            + 'vụ mất mát chéo giữa hai người chơi.');
        assert.match(s, /steal_success[\s\S]{0,160}?common\.item_unconfirmed/,
            `${tep}: chữ "trộm thành công" không kèm cảnh báo khi trao hụt.`);
    }
});

test('heo ngủ: phụ phẩm phân bón cũng phải kiểm', () => {
    // `pigSetStage(bathed -> slept)` đã chuyển giai đoạn và KHÔNG lùi lại được.
    const s = boCmt(doc('src/lib/pig.js'));
    assert.match(s, /const daTrao = \(await db\.giveItemAdmin\(userId, 'phan_bon', 1\)\) === true;/,
        'phụ phẩm phân bón lại bị bỏ trôi kết quả.');
    assert.match(s, /pig\.sleep_success[\s\S]{0,160}?common\.item_unconfirmed/,
        'chữ "heo ngủ ngon" không kèm cảnh báo khi phân bón trao hụt.');
});
