// ============================================================
// test/market_gia_hien_dung_gia_tra.test.js — giá NGƯỜI CHƠI ĐỌC phải bằng giá HỌ NHẬN.
//
// VÌ SAO CÓ, dù đã có bốn cổng kinh tế: những cổng đó canh BẢNG GIÁ.
//   · KINH TẾ #2 — basePrice === floor(items.price × 0.5)          (giá GỐC)
//   · KINH TẾ #3 — bot JS ≡ seed SQL ≡ choices lệnh                (danh sách món)
//   · KINH TẾ #5 — bản sao web ≡ bản sao bot                       (bảng chép tay)
// Không cổng nào kiểm PHÉP TÍNH CUỐI áp lên bảng đó — và lời nói dối nằm đúng ở đấy.
//
// Tới 2026-08-24, hai tầng hiển thị dùng `Math.round(basePrice × mult)` còn RPC
// `market_unit_price` (0098) trả `GREATEST(1, floor(items.price × 0.5 × mult))`.
// round vs floor. Đo 26.280 trường hợp (12 món × 2.190 khung 4 giờ):
//
//     15,4% số khung bảng hiện CAO HƠN số thật — luôn lệch theo hướng hứa nhiều hơn trả
//     ba món cày nhiều nhất sai gần MỘT NỬA thời gian:
//         ca_tuoi 50,6% · quang_sat 49,4% · go 48,9%
//     bán 1.000 gỗ ở khung lệch: bảng hứa 41.000, thực nhận 40.000 (hụt 2,4%)
//
// Đúng lớp lỗi mà KINH TẾ #2 sinh ra để chặn ("người chơi thấy Kỳ Nam 35.500 rồi bán được
// 500"), chỉ là ở một bước sau chỗ cổng đó dừng lại.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const {
    BASE_MARKET_ITEMS, computeMarketMultiplier, getLiveMarketPrices, get4HourBlock,
} = require('../src/lib/market');

// Đúng phép tính của RPC market_unit_price(0098). basePrice đã === floor(items.price×0.5)
// nhờ cổng KINH TẾ #2, nên phần còn lại là nhân hệ số rồi LÀM TRÒN XUỐNG, sàn 1.
const giaTraThat = (basePrice, mult) => Math.max(1, Math.floor(basePrice * mult));

test('bot: giá hiển thị === giá RPC thật sự trả, quét xuyên nhiều khung giờ', async () => {
    // KHÔNG tự dựng lại công thức rồi so với chính nó — làm vậy thì cổng luôn xanh dù code
    // sai (đã mắc đúng bẫy này ba lần trong dự án). Thay vào đó DỊCH ĐỒNG HỒ rồi gọi chính
    // `getLiveMarketPrices()`, tức là chạy đúng đường code mà lệnh /market prices chạy.
    const that = Date.now;
    const lech = [];
    try {
        let moc = Date.UTC(2026, 0, 1);
        for (let i = 0; i < 500; i++) {
            moc += 4 * 3600_000;                      // nhảy từng khung 4 giờ
            Date.now = () => moc;
            const prices = await getLiveMarketPrices();
            for (const p of prices) {
                const info = BASE_MARKET_ITEMS[p.itemId];
                const mult = computeMarketMultiplier(p.itemId, get4HourBlock());
                const tra = giaTraThat(info.basePrice, mult);
                if (p.currentPrice !== tra) {
                    lech.push(`${p.itemId} @${get4HourBlock()}: bảng ${p.currentPrice} ≠ trả ${tra}`);
                }
            }
        }
    } finally {
        Date.now = that;
    }
    assert.deepStrictEqual(lech.slice(0, 5), [],
        `${lech.length} trường hợp lệch trong 500 khung giờ.\n`
        + 'Giá trên bảng phải bằng ĐÚNG số RPC market_unit_price trả. Dùng Math.round ở tầng\n'
        + 'hiển thị trong khi DB dùng floor là hứa nhiều hơn trả — thứ ăn mòn uy tín nhanh nhất.');
});

test('bot: không tầng hiển thị nào được dùng Math.round cho giá', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'market.js'), 'utf8');
    const dong = s.split('\n').filter(l => /Math\.round\s*\(\s*info\.basePrice/.test(l));
    assert.deepStrictEqual(dong, [],
        'src/lib/market.js làm tròn giá bằng Math.round. RPC dùng floor — hai bên sẽ lệch\n'
        + 'ở ~15% số khung giờ, nặng nhất đúng vào ba món cày số lượng lớn.');
    assert.ok(/Math\.max\s*\(\s*1\s*,\s*Math\.floor\s*\(\s*info\.basePrice\s*\*\s*mult\s*\)\s*\)/.test(s),
        'src/lib/market.js phải giữ SÀN 1, soi gương GREATEST(1, ...) của market_unit_price.\n'
        + 'Món rẻ nhất hiện tại (30 × 0,70 = 21) chưa chạm 0 nên phép quét không phân biệt được —\n'
        + 'nhưng thêm một món basePrice = 1 là bảng hiện 0 trong khi DB vẫn trả 1.');
});

test('web: bản sao hiển thị cũng phải làm tròn XUỐNG như DB', () => {
    const s = fs.readFileSync(path.join(ROOT, 'web', 'src', 'lib', 'market.ts'), 'utf8');
    assert.ok(/Math\.floor\s*\(\s*info\.basePrice\s*\*\s*mult\s*\)/.test(s),
        'web/src/lib/market.ts phải dùng Math.floor cho giá, giống bot và giống DB.');
    const dong = s.split('\n').filter(l => /Math\.round\s*\(\s*info\.basePrice/.test(l));
    assert.deepStrictEqual(dong, [],
        'Trang /market trên web hiện giá cao hơn số người chơi thật sự nhận.');
    assert.ok(/Math\.max\s*\(\s*1\s*,\s*Math\.floor\s*\(\s*info\.basePrice\s*\*\s*mult\s*\)\s*\)/.test(s),
        'web/src/lib/market.ts phải giữ SÀN 1 giống bot và giống GREATEST(1, ...) của DB.');
});

test('giá thật hôm nay: bảng của bot khớp công thức trả tiền', async () => {
    const prices = await getLiveMarketPrices();
    assert.ok(prices.length > 0, 'getLiveMarketPrices không trả món nào.');

    const blk = get4HourBlock();
    const lech = [];
    for (const p of prices) {
        const info = BASE_MARKET_ITEMS[p.itemId];
        const tra = giaTraThat(info.basePrice, computeMarketMultiplier(p.itemId, blk));
        if (p.currentPrice !== tra) lech.push(`${p.itemId}: bảng ${p.currentPrice} ≠ trả ${tra}`);
    }
    assert.deepStrictEqual(lech, [],
        'Giá ĐANG hiển thị lệch giá sẽ trả:\n' + lech.join('\n'));
});
