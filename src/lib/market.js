// ⚠️ `basePrice` KHÔNG phải con số tự do — nó PHẢI bằng `items.price × 0.5` của catalog DB.
// Đây là bản sao CHỈ-ĐỂ-HIỂN-THỊ; nguồn sự thật khi BÁN là RPC `market_unit_price()`
// (migration 0098), tính cùng công thức. Test `economy.invariants` chặn lệch giữa hai nơi.
//
// Vì sao 0.5: đó là tỉ lệ bán lại của `sell_item` (0006) mà toàn bộ nghề/craft/sink đang
// cân bằng quanh. Kết hợp hệ số 0.70–1.50 -> bán đỉnh = giá mua × 0.75 < giá mua,
// nên KHÔNG THỂ mua ở /store rồi bán kiếm lời (sự cố máy in tiền 2026-08).
const BASE_MARKET_ITEMS = {
    'trai_1500':      { basePrice: 1500,  category: 'crop', emoji: '🍎', nameVi: 'Trái Cây Loại Thường',          nameEn: 'Common Fruit' },
    'trai_2500':      { basePrice: 2500,  category: 'crop', emoji: '🍇', nameVi: 'Trái Cây Loại Ngon',         nameEn: 'Fine Fruit' },
    'hoa_2000':       { basePrice: 2000,  category: 'crop', emoji: '🌷', nameVi: 'Hoa Loại Khá',           nameEn: 'Fair Flowers' },
    'hoa_3500':       { basePrice: 3500,  category: 'crop', emoji: '🌺', nameVi: 'Hoa Hảo Hạng',           nameEn: 'Premium Flowers' },
    'thit_heo_2500':  { basePrice: 2500,  category: 'pig',  emoji: '🥓', nameVi: 'Thịt Heo Loại Khá',          nameEn: 'Fair Pork' },
    'ca_tuoi':        { basePrice: 150,   category: 'fish', emoji: '🐟', nameVi: 'Cá Tươi',           nameEn: 'Fresh Fish' },
    'ca_koi_nhat':    { basePrice: 40000, category: 'fish', emoji: '🐠', nameVi: 'Cá Koi Hoàng Gia',            nameEn: 'Royal Koi' },
    'ca_rong_vang':   { basePrice: 10000, category: 'fish', emoji: '🐉', nameVi: 'Cá Rồng Kim Long',      nameEn: 'Kim Long Arowana' },
    'quang_sat':      { basePrice: 50,    category: 'ore',  emoji: '🪨', nameVi: 'Quặng Sắt',       nameEn: 'Iron Ore' },
    'vang_dong_tren': { basePrice: 2500,  category: 'ore',  emoji: '🥇', nameVi: 'Vàng Đông Triều',      nameEn: 'Dong Trieu Gold' },
    'go':             { basePrice: 30,    category: 'wood', emoji: '🪵', nameVi: 'Gỗ',            nameEn: 'Wood' },
    'ky_nam':         { basePrice: 7500,  category: 'wood', emoji: '🪵', nameVi: 'Kỳ Nam',            nameEn: 'Ky Nam Agarwood' },
};

/**
 * Bộ trộn băm tuyết lở MurmurMix32 (Avalanche Mixer)
 * Biến đổi các bit để khử tương quan tuyến tính khi chuỗi đầu vào chỉ khác nhau 1 ký tự cuối.
 */
function murmurMix32(h) {
    h = (h ^ (h >>> 16)) >>> 0;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
}

/**
 * Tính toán hệ số nhân giá thị trường (0.70 đến 1.50) dựa trên block 4h tất định
 */
function computeMarketMultiplier(itemId, timeBlock) {
    let hash = 0;
    const str = `${itemId}:${timeBlock}`;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    const mixed = murmurMix32(hash >>> 0);
    const normalized = (mixed % 81) / 100; // 0.00 đến 0.80
    return parseFloat((0.70 + normalized).toFixed(2)); // 0.70 đến 1.50
}


function get4HourBlock() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const day = Math.floor((now - new Date(Date.UTC(year, 0, 0))) / (1000 * 60 * 60 * 24));
    const block = Math.floor(now.getUTCHours() / 4);
    return `${year}-${day}-${block}`;
}

function getNextShiftCountdown() {
    const now = new Date();
    const nextHour = (Math.floor(now.getUTCHours() / 4) + 1) * 4;
    const nextShift = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), nextHour, 0, 0));
    const diffMs = nextShift - now;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
}

function getPast4HourBlocks(count = 6, referenceDate = new Date()) {
    const blocks = [];
    const msPerBlock = 4 * 60 * 60 * 1000;
    const refMs = referenceDate.getTime();
    for (let i = count - 1; i >= 0; i--) {
        const d = new Date(refMs - i * msPerBlock);
        const year = d.getUTCFullYear();
        const day = Math.floor((d.getTime() - Date.UTC(year, 0, 0)) / (1000 * 60 * 60 * 24));
        const block = Math.floor(d.getUTCHours() / 4);
        blocks.push({
            blockKey: `${year}-${day}-${block}`,
            timestamp: d.getTime(),
        });
    }
    return blocks;
}

function getMarketHistory(itemId, blocksCount = 6, referenceDate = new Date()) {
    const info = BASE_MARKET_ITEMS[itemId];
    if (!info) return [];
    const blocks = getPast4HourBlocks(blocksCount, referenceDate);
    return blocks.map(b => {
        const mult = computeMarketMultiplier(itemId, b.blockKey);
        const multPct = Math.round(mult * 100);
        const price = Math.max(1, Math.floor(info.basePrice * multPct / 100));
        return {
            blockKey: b.blockKey,
            multiplier: mult,
            price,
            timestamp: b.timestamp,
        };
    });
}

function generateSparkline(prices) {
    if (!prices || prices.length === 0) return '';
    const ticks = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (min === max) return ticks[3].repeat(prices.length);
    return prices.map(p => {
        const idx = Math.min(ticks.length - 1, Math.floor(((p - min) / (max - min)) * ticks.length));
        return ticks[idx];
    }).join('');
}

async function getLiveMarketPrices() {
    const currentBlock = get4HourBlock();
    const prevBlock = (() => {
        const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
        const year = now.getUTCFullYear();
        const day = Math.floor((now - new Date(Date.UTC(year, 0, 0))) / (1000 * 60 * 60 * 24));
        const block = Math.floor(now.getUTCHours() / 4);
        return `${year}-${day}-${block}`;
    })();

    const results = [];

    for (const [itemId, info] of Object.entries(BASE_MARKET_ITEMS)) {
        const mult = computeMarketMultiplier(itemId, currentBlock);
        const prevMult = computeMarketMultiplier(itemId, prevBlock);
        // PHẢI khớp TỪNG PHÉP TÍNH với RPC `market_unit_price` (0098), thứ thật sự trả tiền:
        //     GREATEST(1, floor(items.price * 0.5 * mult))   và basePrice === floor(items.price*0.5)
        // Trước đây chỗ này dùng Math.round còn DB dùng floor. Cổng KINH TẾ #2/#5 canh BẢNG GIÁ
        // (basePrice, tên, emoji) nên vẫn xanh — không cổng nào kiểm CON SỐ CUỐI người chơi đọc.
        // Đo 26.280 trường hợp (12 món × 2.190 khung 4 giờ): 15,4% số khung bảng hiện CAO HƠN
        // số thật, và ba món cày nhiều nhất sai gần một nửa thời gian (ca_tuoi 50,6%, quang_sat
        // 49,4%, go 48,9%). Bán 1.000 gỗ ở khung lệch: bảng hứa 41.000, thực nhận 40.000.
        // Hạ HIỂN THỊ xuống cho khớp, KHÔNG nâng tiền trả — nâng là tạo tiền, đụng bất biến #1.
        // TÍNH BẰNG SỐ NGUYÊN, không nhân với số thực. `mult` luôn có dạng k/100 (k = 70..150)
        // nhưng dấu phẩy động lưu 0,99 thành 0,98999999999999999…, nên Math.floor(40000 × 0,99)
        // ra 39.599 trong khi RPC dùng `numeric` chính xác và trả 39.600.
        // Đã đo đối chiếu 2.880 trường hợp với CHÍNH hàm market_multiplier của DB: nhân trực
        // tiếp với số thực làm 9/12 món lệch. Nhân số nguyên rồi mới chia 100 thì khớp tuyệt đối.
        // (Math.round ở bản cũ vô tình che được lỗi này, nên nó chỉ lộ khi chuyển sang floor.)
        const multPct = Math.round(mult * 100);          // 70..150, đúng (abs(hash) % 81) + 70
        const price = Math.max(1, Math.floor(info.basePrice * multPct / 100));
        const trend = mult > prevMult ? 'UP' : (mult < prevMult ? 'DOWN' : 'STABLE');

        const history = getMarketHistory(itemId, 6);
        const historyPrices = history.map(h => h.price);
        const sparkline = generateSparkline(historyPrices);
        const high24h = Math.max(...historyPrices);
        const low24h = Math.min(...historyPrices);

        results.push({
            itemId,
            nameVi: info.nameVi,
            nameEn: info.nameEn,
            category: info.category,
            emoji: info.emoji,
            basePrice: info.basePrice,
            currentPrice: price,
            multiplier: mult,
            pctChange: Math.round((mult - 1) * 100),
            trend,
            sparkline,
            high24h,
            low24h,
            history,
        });
    }

    return results;
}

module.exports = {
    BASE_MARKET_ITEMS,
    murmurMix32,
    computeMarketMultiplier,
    get4HourBlock,
    getNextShiftCountdown,
    getPast4HourBlocks,
    getMarketHistory,
    generateSparkline,
    getLiveMarketPrices,
};

