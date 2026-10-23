// ============================================================
// test/khong_mat_vat_pham_im_lang.test.js — tiêu rồi phải trao được, hoặc phải NÓI ra.
//
// CHUYỆN ĐÃ XẢY RA: `sellPig` gọi `pigClaimSale` (XOÁ con heo) rồi `giveItemAdmin(thịt)` mà
// KHÔNG kiểm kết quả, sau đó báo "bán thành công". `harvest` y vậy: `plantClaim` TIÊU cái cây
// rồi trao nông sản + cám heo, cả hai không kiểm. DB lỗi ở bước trao -> người chơi mất
// heo/cây, không nhận gì, và đọc đúng chữ "thành công".
//
// Đây đúng lớp lỗi đã vá ở `5a6edf8` cho NHÁNH TIỀN của hai tệp này; nhánh VẬT PHẨM còn sót
// tới 23/10.
//
// Dùng chuỗi RIÊNG `common.item_unconfirmed`, KHÔNG dùng lại `common.payout_unconfirmed`:
// chuỗi tiền nói "Số dư dưới đây mới là con số thật", mà ca này chẳng có số dư nào hiện ra
// -> dán vào là nói sai lần nữa (chính `5a6edf8` đã ghi nhận điều đó).
//
// KHÔNG BAO GIỜ trao lại khi hụt: `false` có thể là timeout SAU khi DB đã ghi -> trao lại là
// trao hai lần (sổ ghi nhớ 24/08).
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---- thay database.js bằng bản giả TRƯỚC khi nạp pig/plant ----
const dbPath = require.resolve('../src/database.js');
let traoThanhCong = true;
let daGoiTrao = [];
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
        getPig: async () => ({ stage: 'mature', type: 'heo_den', created_at: new Date(Date.now() - 9e8).toISOString() }),
        pigClaimSale: async () => ({ result: 'ok', tier: 2500 }),
        getPlant: async () => ({ stage: 'mature', type: 'lua_mi' }),
        plantClaim: async () => ({ result: 'ok', tier: 2000, is_flower: false }),
        giveItemAdmin: async (u, itemId) => { daGoiTrao.push(itemId); return traoThanhCong; },
        addMoney: async () => true,
        getUser: async () => ({}),
    },
};

const pig = require('../src/lib/pig.js');
const plant = require('../src/lib/plant.js');

// Chặn console.error để log [PAYOUT FAIL] không làm rác output test, nhưng vẫn quan sát được.
const logGoc = console.error;
const daLog = [];
console.error = (...a) => { daLog.push(a.join(' ')); };
test.after(() => { console.error = logGoc; });

const dat = (ok) => { traoThanhCong = ok; daGoiTrao = []; daLog.length = 0; };
const CANH_BAO = /vật phẩm chưa ghi nhận xong/;

test('phép đo tự kiểm: bản giả có được dùng thật', async () => {
    dat(true);
    await pig.sellPig('u1', 'vi');
    assert.ok(daGoiTrao.length > 0,
        'không lời trao nào đi qua bản giả -> mọi phép kiểm dưới đây vô nghĩa');
});

test('bán heo: trao được -> KHÔNG cảnh báo gì', async () => {
    dat(true);
    const r = await pig.sellPig('u1', 'vi');
    assert.doesNotMatch(r.description || '', CANH_BAO, 'trao thành công thì đừng làm người chơi lo');
    assert.deepStrictEqual(daLog, [], 'trao thành công thì đừng ghi [PAYOUT FAIL]');
});

test('bán heo: trao HỤT -> phải nói ra, và KHÔNG trao lại', async () => {
    dat(false);
    const r = await pig.sellPig('u1', 'vi');
    assert.match(r.description || '', CANH_BAO,
        'heo đã bị xoá mà thịt không vào -> không được báo "thành công" trơn');
    assert.strictEqual(daGoiTrao.length, 1,
        '`false` có thể là timeout SAU khi DB đã ghi -> trao lại là trao hai lần');
    assert.ok(daLog.some((x) => x.includes('[PAYOUT FAIL]') && x.includes('pig-sell')),
        'phải ghi [PAYOUT FAIL] để admin truy được');
});

test('thu hoạch: trao được -> KHÔNG cảnh báo gì', async () => {
    dat(true);
    const r = await plant.harvest('u1', 'vi');
    assert.doesNotMatch(r.description || '', CANH_BAO);
    assert.deepStrictEqual(daLog, []);
});

test('thu hoạch: trao HỤT -> phải nói ra, và KHÔNG trao lại', async () => {
    dat(false);
    const r = await plant.harvest('u1', 'vi');
    assert.match(r.description || '', CANH_BAO,
        'cây đã bị tiêu mà nông sản không vào -> không được báo "thành công" trơn');
    assert.strictEqual(daGoiTrao.length, 2,
        'đúng hai lời trao (nông sản + cám heo), mỗi thứ gọi một lần, không gọi lại');
    assert.ok(daLog.some((x) => x.includes('[PAYOUT FAIL]') && x.includes('plant-harvest')),
        'phải ghi [PAYOUT FAIL] kèm món nào hụt');
});

test('chuỗi item_unconfirmed có THẬT ở cả hai tệp locale, và khác chuỗi tiền', () => {
    // Đọc thẳng JSON: `t()` rơi về bản Việt khi thiếu khoá tiếng Anh, nên kiểm qua `t()`
    // là xanh giả (bẫy đã ghi sổ 23/10).
    for (const ngn of ['vi', 'en']) {
        const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'locales', `${ngn}.json`), 'utf8'));
        const s = L.common.item_unconfirmed;
        assert.ok(typeof s === 'string' && s.trim(), `${ngn}.json thiếu common.item_unconfirmed`);
        assert.notStrictEqual(s, L.common.payout_unconfirmed,
            `${ngn}: chuỗi vật phẩm trùng chuỗi tiền — chuỗi tiền nói về "số dư", ca này không có `
            + 'số dư nào hiện ra nên dán vào là nói sai');
    }
});

test('MEAT phủ MỌI tier mà pig_claim_sale có thể sinh ra', () => {
    // Nếu RPC sinh một tier không có trong MEAT thì `giveItemAdmin(userId, undefined, 1)` —
    // heo đã mất mà món trao là `undefined`. Hiện KHÔNG xảy ra, và cổng này giữ cho vẫn vậy
    // khi ai đó thêm tier mới vào RPC.
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '0039_pigs.sql'), 'utf8');
    const i = sql.indexOf('v_tier := CASE');
    assert.ok(i >= 0, 'không thấy khối tính tier trong 0039_pigs.sql');
    const khoi = sql.slice(i, sql.indexOf('END;', i));
    const tiers = [...khoi.matchAll(/THEN (\d+)|ELSE (\d+)/g)].map((m) => Number(m[1] || m[2]));
    assert.ok(tiers.length >= 6, `chỉ đọc được ${tiers.length} tier — phép kiểm vô nghĩa`);

    const { MEAT } = require('../src/data/pig');
    const thieu = tiers.filter((x) => !MEAT[x]);
    assert.deepStrictEqual(thieu, [],
        `RPC sinh tier ${thieu.join(', ')} mà MEAT không có -> bán heo sẽ trao \`undefined\``);
});
