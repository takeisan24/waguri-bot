const BASE_MARKET_ITEMS = {
    'lua_nuoc': { basePrice: 500, category: 'crop', emoji: '🌾', nameVi: 'Lúa Nước', nameEn: 'Wet Rice' },
    'ca_chua': { basePrice: 800, category: 'crop', emoji: '🍅', nameVi: 'Cà Chua', nameEn: 'Tomato' },
    'khoai_tay': { basePrice: 1200, category: 'crop', emoji: '🥔', nameVi: 'Khoai Tây', nameEn: 'Potato' },
    'dua_hau': { basePrice: 2500, category: 'crop', emoji: '🍉', nameVi: 'Dưa Hấu', nameEn: 'Watermelon' },
    'thit_heo_2500': { basePrice: 2500, category: 'pig', emoji: '🥓', nameVi: 'Thịt Heo', nameEn: 'Pork' },
    'ca_tuoi': { basePrice: 600, category: 'fish', emoji: '🐟', nameVi: 'Cá Tươi', nameEn: 'Fresh Fish' },
    'ca_koi': { basePrice: 5000, category: 'fish', emoji: '🐠', nameVi: 'Cá Koi', nameEn: 'Koi Fish' },
    'ca_rong': { basePrice: 15000, category: 'fish', emoji: '🐉', nameVi: 'Cá Rồng Vàng', nameEn: 'Golden Dragon Fish' },
    'sieu_cap_gem': { basePrice: 8000, category: 'ore', emoji: '💎', nameVi: 'Đá Siêu Cấp', nameEn: 'Super Gem' },
    'vang_dong_trieu': { basePrice: 20000, category: 'ore', emoji: '🥇', nameVi: 'Vàng Đông Triều', nameEn: 'Dong Trieu Gold' },
    'go_ram': { basePrice: 400, category: 'wood', emoji: '🪵', nameVi: 'Gỗ Rắn', nameEn: 'Solid Wood' },
    'ky_nam': { basePrice: 25000, category: 'wood', emoji: '🪵', nameVi: 'Kỳ Nam', nameEn: 'Ky Nam Agarwood' },
};

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
    const normalized = (Math.abs(hash) % 81) / 100; // 0.00 đến 0.80
    return parseFloat((0.70 + normalized).toFixed(2)); // 0.70 đến 1.50
}

function get4HourBlock() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const day = Math.floor((now - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
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

async function getLiveMarketPrices() {
    const currentBlock = get4HourBlock();
    const prevBlock = (() => {
        const now = new Date(Date.now() - 4 * 60 * 60 * 1000);
        const year = now.getUTCFullYear();
        const day = Math.floor((now - new Date(year, 0, 0)) / (1000 * 60 * 60 * 24));
        const block = Math.floor(now.getUTCHours() / 4);
        return `${year}-${day}-${block}`;
    })();

    const results = [];

    for (const [itemId, info] of Object.entries(BASE_MARKET_ITEMS)) {
        const mult = computeMarketMultiplier(itemId, currentBlock);
        const prevMult = computeMarketMultiplier(itemId, prevBlock);
        const price = Math.round(info.basePrice * mult);
        const trend = mult > prevMult ? 'UP' : (mult < prevMult ? 'DOWN' : 'STABLE');

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
        });
    }

    return results;
}

module.exports = {
    BASE_MARKET_ITEMS,
    computeMarketMultiplier,
    get4HourBlock,
    getNextShiftCountdown,
    getLiveMarketPrices,
};
