// ============================================================
// test/economy.invariants.test.js — BẤT BIẾN KINH TẾ (tĩnh, KHÔNG cần DB).
//
// LÝ DO TỒN TẠI: `npm test` từng xanh 105/105 trong khi tồn tại máy in tiền
// (mua `go` 60 xu ở /store -> bán 400 xu ở chợ = +567%/vòng, lặp vô hạn).
// Test suite cũ chỉ kiểm "logic thuần" (hàm hash, parse) nên không thể thấy:
// giá MUA sống trong SQL (`items.price`), giá BÁN sống trong JS
// (`src/lib/market.js`) và lặp lại lần nữa trong `web/src/lib/market.ts`.
// BA nguồn cho MỘT con số, không ai đối chiếu.
//
// File này đối chiếu cả ba. Nó là hợp đồng: bất kỳ ai đổi giá ở MỘT nơi
// mà quên hai nơi kia sẽ thấy đỏ ngay lúc commit, không phải sau khi
// nền kinh tế đã lạm phát.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { buildCatalog } = require('./helpers/sqlCatalog');
const { BASE_MARKET_ITEMS, computeMarketMultiplier } = require('../src/lib/market');
const RECIPES = require('../src/data/recipes');

const ROOT = path.join(__dirname, '..');
const { items: catalog, marketSeed } = buildCatalog();

// Biên hệ số nhân của engine chợ (src/lib/market.js: 0.70 -> 1.50).
const MULT_MAX = 1.50;
const MULT_MIN = 0.70;

// Quy ước bán lại của game (RPC sell_item từ 0006): thu về 50% giá mua.
// 5/12 item chợ hiện đã tuân đúng tỉ lệ này -> đó là ý định thiết kế gốc.
const RESALE_RATE = 0.5;
const BAND_LO = 0.30;
const BAND_HI = 0.60;

// ------------------------------------------------------------
test('KINH TẾ #1 — Không có máy in tiền: mua ở /store rồi bán ở chợ phải LỖ', () => {
    const printers = [];
    for (const [id, info] of Object.entries(BASE_MARKET_ITEMS)) {
        const item = catalog.get(id);
        if (!item) continue;            // #4 lo việc thiếu item
        if (item.shopHidden) continue;  // không mua được ở tiệm -> không arbitrage được

        // Kịch bản xấu nhất cho nền kinh tế: người chơi canh đúng block giá đỉnh.
        const peakSell = info.basePrice * MULT_MAX;
        if (peakSell >= item.price) {
            printers.push(
                `${id}: mua ${item.price} -> bán đỉnh ${Math.round(peakSell)} ` +
                `(lãi ${Math.round((peakSell / item.price - 1) * 100)}%/vòng)`
            );
        }
    }
    assert.deepStrictEqual(printers, [],
        'Item mua được ở /store mà bán ở chợ có LÃI = tạo tiền từ không khí.\n' +
        'Sửa: hạ basePrice chợ, HOẶC đặt shop_hidden = true (hàng chỉ cày mới có).\n' +
        printers.map(s => '  · ' + s).join('\n'));
});

// ------------------------------------------------------------
test('KINH TẾ #2 — basePrice hiển thị PHẢI = items.price × 0.5 (khớp RPC market_unit_price)', () => {
    // Migration 0098 tính giá bán = items.price × 0.5 × multiplier. Bảng JS/TS chỉ là
    // bản sao ĐỂ HIỂN THỊ. Lệch một con số = web/bot hiện một giá, DB trả một giá khác —
    // đúng lỗi đã khiến người chơi thấy "Kỳ Nam 35.500" rồi bán được 500.
    const wrong = [];
    for (const [id, info] of Object.entries(BASE_MARKET_ITEMS)) {
        const item = catalog.get(id);
        if (!item || !item.price) continue;
        const expected = Math.floor(item.price * RESALE_RATE);
        if (info.basePrice !== expected) {
            wrong.push(`${id}: basePrice ${info.basePrice} ≠ floor(${item.price} × ${RESALE_RATE}) = ${expected}`);
        }
    }
    assert.deepStrictEqual(wrong, [],
        'basePrice trong src/lib/market.js không khớp catalog DB.\n' +
        'Đổi items.price thì PHẢI đổi cả basePrice ở bot lẫn web.\n' +
        wrong.map(s => '  · ' + s).join('\n'));
});

// ------------------------------------------------------------
test('KINH TẾ #3 — Một nguồn sự thật: bot JS ≡ seed SQL ≡ choices lệnh /market sell', () => {
    const jsKeys = Object.keys(BASE_MARKET_ITEMS).sort();

    // Seed bảng market_prices sau khi replay 0095 + 0096.
    assert.deepStrictEqual([...marketSeed].sort(), jsKeys,
        'BASE_MARKET_ITEMS (src/lib/market.js) lệch với seed market_prices trong migration.\n' +
        'Đây đúng lớp lỗi mà migration 0096 phải sinh ra để vá — gate này chặn nó tái diễn.');

    // addChoices trong định nghĩa slash command.
    const cmdSrc = fs.readFileSync(path.join(ROOT, 'src/commands/economy/market.js'), 'utf8');
    const choices = [...cmdSrc.matchAll(/value:\s*'([^']+)'/g)].map(m => m[1]).sort();
    assert.deepStrictEqual(choices, jsKeys,
        'Danh sách choices của /market sell lệch với BASE_MARKET_ITEMS — ' +
        'người chơi sẽ thấy món không bán được, hoặc không thấy món bán được.');
});

// ------------------------------------------------------------
test('KINH TẾ #4 — Mọi item chợ phải tồn tại trong catalog items', () => {
    const missing = Object.keys(BASE_MARKET_ITEMS).filter(id => !catalog.has(id));
    assert.deepStrictEqual(missing, [],
        'Item chợ không có trong bảng items -> RPC bán sẽ không tìm thấy trong inventory: ' + missing.join(', '));
});

// ------------------------------------------------------------
test('KINH TẾ #5 — Bản sao web không được trôi lệch khỏi bot', () => {
    // src/lib/market.js và web/src/lib/market.ts là HAI file chép tay cùng nội dung.
    // Lệch nhau = web hiện một giá, bot bán một giá khác.
    const tsSrc = fs.readFileSync(path.join(ROOT, 'web/src/lib/market.ts'), 'utf8');

    const webItems = {};
    const entryRe = /(\w+):\s*\{\s*basePrice:\s*(\d+),\s*category:\s*"(\w+)"[\s\S]*?nameVi:\s*"([^"]+)",\s*nameEn:\s*"([^"]+)"/g;
    let m;
    while ((m = entryRe.exec(tsSrc)) !== null) {
        webItems[m[1]] = { basePrice: Number(m[2]), category: m[3], nameVi: m[4], nameEn: m[5] };
    }

    assert.ok(Object.keys(webItems).length > 0, 'Không parse được BASE_MARKET_ITEMS từ web/src/lib/market.ts');

    const botItems = {};
    for (const [id, v] of Object.entries(BASE_MARKET_ITEMS)) {
        botItems[id] = { basePrice: v.basePrice, category: v.category, nameVi: v.nameVi, nameEn: v.nameEn };
    }
    assert.deepStrictEqual(webItems, botItems,
        'web/src/lib/market.ts lệch với src/lib/market.js. ' +
        'Hai bản sao chép tay LUÔN trôi — cân nhắc sinh 1 file từ nguồn chung.');

    // Thuật toán phải cho cùng kết quả (web đang chép lại hàm hash của bot).
    const tsMultBody = tsSrc.match(/export function computeMarketMultiplier[\s\S]*?\n\}/)?.[0] || '';
    for (const frag of ['(hash << 5) - hash', '% 81', '0.70 +', 'toFixed(2)']) {
        assert.ok(tsMultBody.includes(frag),
            `computeMarketMultiplier bên web thiếu "${frag}" -> web và bot sẽ tính ra giá KHÁC nhau.`);
    }
});

// ------------------------------------------------------------
// Giá bán lại của MỘT item, tính ở kịch bản XẤU NHẤT cho nền kinh tế:
// item chợ -> hệ số đỉnh 1.50; item thường -> 50% giá catalog (RPC sell_item, 0006).
function sellValue(id) {
    const m = BASE_MARKET_ITEMS[id];
    if (m) return Math.floor(m.basePrice * MULT_MAX);
    const it = catalog.get(id);
    return it ? Math.floor(it.price * RESALE_RATE) : 0;
}
// Giá MUA ở /store. null = không mua được (shop_hidden) -> không arbitrage được.
function buyPrice(id) {
    const it = catalog.get(id);
    if (!it || it.shopHidden) return null;
    return it.price;
}

test('KINH TẾ #7 — Chế tạo: mua nguyên liệu ở shop rồi chế rồi bán PHẢI lỗ', () => {
    // Luật này đã được ghi thành lời trong src/data/recipes.js dòng 6-9 từ lâu:
    //   "Tiền công đặt sao cho: mua HẾT nguyên liệu từ shop + tiền công > giá bán lại"
    // Nhưng nó chỉ là comment nên không ai chặn được khi thêm item mới. Nay là exit 1.
    const printers = [];
    for (const r of RECIPES) {
        let cost = r.cost || 0;
        let buyable = true;
        for (const [matId, qty] of Object.entries(r.mats)) {
            const p = buyPrice(matId);
            if (p === null) { buyable = false; break; }   // mats chỉ cày mới có -> bỏ qua
            cost += p * qty;
        }
        if (!buyable) continue;
        const out = sellValue(r.result) * (r.qty || 1);
        if (out >= cost) {
            printers.push(`${r.id}: mua mats+công ${cost} -> bán ${out} (lãi ${Math.round((out / cost - 1) * 100)}%/vòng)`);
        }
    }
    assert.deepStrictEqual(printers, [],
        'Chế tạo từ nguyên liệu MUA ở shop đang có LÃI = tạo tiền từ không khí.\n' +
        'Sửa: tăng `cost` tiền công, tăng giá mats, HOẶC đặt shop_hidden cho mats.\n' +
        printers.map(s => '  · ' + s).join('\n'));
});

test('KINH TẾ #8 — Chế tạo từ đồ tự cày PHẢI có lãi (không thì không ai craft)', () => {
    // Mặt còn lại của #7: nếu bán thẳng nguyên liệu lời hơn ghép đồ thì cây chế tạo chết.
    // Chính điều này đã xảy ra: bán 3 gỗ được 1.200 trong khi Tấm Gỗ chỉ bán được 125.
    const deadEnds = [];
    for (const r of RECIPES) {
        let matsValue = 0;
        for (const [matId, qty] of Object.entries(r.mats)) matsValue += sellValue(matId) * qty;
        const out = sellValue(r.result) * (r.qty || 1);
        if (out <= matsValue) {
            deadEnds.push(`${r.id}: mats bán được ${matsValue} ≥ sản phẩm bán được ${out} -> ghép đồ là LỖ`);
        }
    }
    assert.deepStrictEqual(deadEnds, [],
        'Chế tạo đang PHÁ giá trị — người chơi hợp lý sẽ không bao giờ craft.\n' +
        deadEnds.map(s => '  · ' + s).join('\n'));
});

// ------------------------------------------------------------
test('KINH TẾ #6 — Hệ số nhân luôn nằm trong biên đã công bố', () => {
    for (const id of Object.keys(BASE_MARKET_ITEMS)) {
        for (let day = 1; day <= 366; day += 7) {
            for (let block = 0; block < 6; block++) {
                const mult = computeMarketMultiplier(id, `2026-${day}-${block}`);
                assert.ok(mult >= MULT_MIN && mult <= MULT_MAX,
                    `${id} block ${day}-${block}: hệ số ${mult} ngoài biên [${MULT_MIN}, ${MULT_MAX}]`);
            }
        }
    }
});
