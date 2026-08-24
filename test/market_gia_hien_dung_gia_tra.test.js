// ============================================================
// test/market_gia_hien_dung_gia_tra.test.js — giá NGƯỜI CHƠI ĐỌC phải bằng giá HỌ NHẬN.
//
// VÌ SAO CÓ, dù đã có bốn cổng kinh tế: những cổng đó canh BẢNG GIÁ.
//   · KINH TẾ #2 — basePrice === floor(items.price × 0.5)          (giá GỐC)
//   · KINH TẾ #3 — bot JS ≡ seed SQL ≡ choices lệnh                (danh sách món)
//   · KINH TẾ #5 — bản sao web ≡ bản sao bot                       (bảng chép tay)
// Không cổng nào kiểm PHÉP TÍNH CUỐI áp lên bảng đó — và lời nói dối nằm đúng ở đấy.
//
// HAI LỖI ĐÃ TÌM RA Ở ĐÂY, cái sau chỉ lộ khi vá cái trước:
//
//   (1) Hai tầng hiển thị dùng `Math.round(basePrice × mult)` còn RPC `market_unit_price`
//       (0098) trả `GREATEST(1, floor(items.price × 0.5 × mult))`. 15,4% số khung 4 giờ
//       bảng hiện CAO HƠN số thật; ba món cày nhiều nhất sai gần một nửa thời gian
//       (ca_tuoi 50,6% · quang_sat 49,4% · go 48,9%).
//
//   (2) Đổi sang `Math.floor(basePrice × mult)` VẪN SAI, chỉ đổi hướng lệch. `mult` là số
//       thực dấu phẩy động: 0,99 lưu thành 0,98999999999999999…, nên
//       Math.floor(40000 × 0,99) = 39.599 trong khi DB dùng `numeric` chính xác và trả
//       39.600. Đối chiếu 2.880 trường hợp với CHÍNH hàm `market_multiplier` của prod:
//       9/12 món lệch, JS luôn THẤP hơn. `Math.round` ở (1) vô tình che được lỗi này.
//       Cách đúng: nhân SỐ NGUYÊN rồi mới chia 100, đúng như numeric của Postgres.
//
// VÌ SAO CỔNG NÀY NEO VÀO "GIÁ TRỊ VÀNG" thay vì tự dựng lại công thức: bản đầu của chính
// cổng này dựng lại `Math.floor(basePrice × mult)` làm mốc so sánh — tức là mang y nguyên
// lỗi (2) sang phía trọng tài, nên nó XANH trong khi code SAI. Một hàm tham chiếu viết
// bằng cùng ngôn ngữ, cùng kiểu số, sẽ mắc cùng lỗi. Mốc so sánh phải đến TỪ DB.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const {
    BASE_MARKET_ITEMS, computeMarketMultiplier, getLiveMarketPrices, get4HourBlock,
} = require('../src/lib/market');

// Dấu vân tay lấy TỪ DB PROD ngày 2026-08-24, bằng chính hàm của Postgres:
//
//   with blk as (select '2026-'||d||'-'||b as blk
//                from generate_series(1,40) d, generate_series(0,5) b)
//   select md5(string_agg(id||':'||blk||'='||g, ',' order by (id||':'||blk) collate "C"))
//   from (select m.id, b.blk,
//                greatest(1, floor(i.price*0.5*public.market_multiplier(m.id, b.blk)))::bigint as g
//         from mon m join items i on i.id = m.id cross join blk b) gia;
//
// 2.880 trường hợp = 12 món × 240 khung 4 giờ (40 ngày).
// ĐỎ ở đây nghĩa là một trong hai điều, cả hai đều phải dừng lại xem xét:
//   · công thức hiển thị đã trôi khỏi công thức trả tiền, HOẶC
//   · `items.price` trong DB đã đổi — khi đó chạy lại câu SQL trên để lấy vân tay mới, và
//     nhớ cập nhật basePrice ở CẢ bot lẫn web (cổng KINH TẾ #2/#5 sẽ nhắc).
const VAN_TAY_DB = 'fcf7302f9be01a42d6399950363a0d83';

function vanTay(giaCua) {
    const rows = [];
    for (let d = 1; d <= 40; d++) {
        for (let b = 0; b < 6; b++) {
            const blk = `2026-${d}-${b}`;
            for (const id of Object.keys(BASE_MARKET_ITEMS)) {
                rows.push({ k: `${id}:${blk}`, s: `${id}:${blk}=${giaCua(id, blk)}` });
            }
        }
    }
    rows.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
    return crypto.createHash('md5').update(rows.map(r => r.s).join(',')).digest('hex');
}

test('giá hiển thị khớp TỪNG XU với giá DB trả, trên 2.880 trường hợp', async () => {
    // Chạy đúng đường code thật: dịch đồng hồ rồi gọi chính getLiveMarketPrices(),
    // thay vì dựng lại công thức — hàm tham chiếu tự viết sẽ mắc lại đúng lỗi số thực.
    //
    // Phải thay CẢ hàm dựng `new Date()`, không chỉ `Date.now()`: `get4HourBlock()` dùng
    // `new Date()` argless, thứ không đi qua Date.now. Bản đầu chỉ thay Date.now nên đồng
    // hồ không hề nhúc nhích và cổng đỏ vì thiếu dữ liệu — chứ không phải vì giá sai.
    const That = global.Date;
    let moc = That.UTC(2026, 0, 1);
    class GiaDate extends That {
        constructor(...a) { if (a.length === 0) super(moc); else super(...a); }
        static now() { return moc; }
    }

    const bang = new Map();
    try {
        global.Date = GiaDate;
        for (let i = 0; i < 260; i++) {
            const blk = get4HourBlock();
            for (const p of await getLiveMarketPrices()) bang.set(`${p.itemId}:${blk}`, p.currentPrice);
            moc += 4 * 3600_000;
        }
    } finally {
        global.Date = That;
    }

    const thieu = [];
    const van = vanTay((id, blk) => {
        const g = bang.get(`${id}:${blk}`);
        if (g === undefined) thieu.push(`${id}@${blk}`);
        return g;
    });
    assert.deepStrictEqual(thieu.slice(0, 3), [],
        `Không dựng được giá cho ${thieu.length} khung giờ — phép dịch đồng hồ hỏng, chưa kết luận được gì.`);

    assert.strictEqual(van, VAN_TAY_DB,
        'Giá bot hiển thị KHÔNG khớp giá RPC market_unit_price trả.\n'
        + 'Đây là lớp lỗi ăn mòn uy tín nhanh nhất: bảng hứa một con số, ví trả con số khác.\n'
        + 'Nếu vừa đổi items.price thì chạy lại câu SQL ở đầu file để lấy vân tay mới.');
});

test('không tầng hiển thị nào được nhân giá với SỐ THỰC', () => {
    for (const [nhan, f] of [['bot', 'src/lib/market.js'], ['web', 'web/src/lib/market.ts']]) {
        const s = fs.readFileSync(path.join(ROOT, f), 'utf8');

        assert.ok(/Math\.max\s*\(\s*1\s*,\s*Math\.floor\s*\(\s*info\.basePrice\s*\*\s*multPct\s*\/\s*100\s*\)\s*\)/.test(s),
            `${nhan} (${f}) phải tính giá bằng SỐ NGUYÊN: Math.max(1, Math.floor(basePrice * multPct / 100)).\n`
            + 'Nhân thẳng với `mult` (số thực) làm 9/12 món lệch so với numeric của Postgres.\n'
            + 'Sàn 1 soi gương GREATEST(1, ...) của market_unit_price.');

        const xau = s.split('\n').filter(l => /Math\.(round|floor|ceil)\s*\(\s*info\.basePrice\s*\*\s*mult\s*\)/.test(l));
        assert.deepStrictEqual(xau, [],
            `${nhan} (${f}) còn dòng nhân giá với số thực:\n` + xau.join('\n'));
    }
});

test('web dùng ĐÚNG một công thức với bot', () => {
    const lay = f => {
        const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const m = s.match(/const price = ([^;]+);/);
        assert.ok(m, `${f}: không tìm thấy dòng tính giá.`);
        return m[1].replace(/\s+/g, ' ').trim();
    };
    assert.strictEqual(lay('web/src/lib/market.ts'), lay('src/lib/market.js'),
        'Công thức giá của web đã trôi khỏi bot. Hai file là bản chép tay của nhau; lệch\n'
        + 'nhau nghĩa là trang /market hiện một giá còn bot bán một giá khác.');
});

test('giá ĐANG hiển thị hôm nay cũng khớp công thức trả tiền', async () => {
    const prices = await getLiveMarketPrices();
    assert.ok(prices.length > 0, 'getLiveMarketPrices không trả món nào.');
    const blk = get4HourBlock();
    const lech = [];
    for (const p of prices) {
        const k = Math.round(computeMarketMultiplier(p.itemId, blk) * 100);
        const tra = Math.max(1, Math.floor(BASE_MARKET_ITEMS[p.itemId].basePrice * k / 100));
        if (p.currentPrice !== tra) lech.push(`${p.itemId}: bảng ${p.currentPrice} ≠ trả ${tra}`);
    }
    assert.deepStrictEqual(lech, [], 'Giá đang hiển thị lệch giá sẽ trả:\n' + lech.join('\n'));
});
