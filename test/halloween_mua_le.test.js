// ============================================================
// test/halloween_mua_le.test.js — Cổng cho mùa lễ DƯƠNG lịch + ảnh sự kiện.
//
// LỚP LỖI ĐỢT NÀY, và vì sao không cổng cũ nào thấy được nó:
//
//  1. `src/lib/season.js` trước 27-10 CHỈ có nhánh ÂM lịch. Gắn `season = 'halloween'`
//     cho một món trong migration là chuyện DB, hoàn toàn hợp lệ, `check-sql` xanh,
//     `check-db` xanh, `npm test` xanh — nhưng `activeSeasons()` không bao giờ trả về
//     'halloween', nên món đó BIẾN MẤT KHỎI /store vĩnh viễn. Không log, không lỗi, không
//     ai bấm vào đâu để thấy. Đúng kiểu "dữ liệu nói một đằng, mã mở cửa một nẻo".
//
//  2. Ảnh embed: `.setImage('https://.../banner_halloween.jpg')` gõ sai một ký tự thì
//     Discord hiện Ô ẢNH VỠ và KHÔNG báo gì cho bot. Phép đọc mã chỉ chứng minh chuỗi CÓ
//     MẶT. Cổng dưới đây đi xa hơn một bậc: nó lần URL ngược về FILE THẬT trong repo.
//
//  3. Và kể cả khi chuỗi đúng + file có thật, vẫn còn khoảng hở "không ai nối dây" —
//     đúng lớp lỗi của Sổ Sứ Mệnh (nút vẽ ra mà không router nào nhận). Nên có một phép
//     CHẠY THẬT `runDecision()` với client giả, bắt đúng payload gửi đi, thay vì đọc mã.
//
// Thứ tự ưu tiên khi sửa: phép chạy thật (#7, #8) mới là thứ khoá được hành vi; mấy phép
// đọc chuỗi chỉ là lưới phụ. Đừng "sửa cho xanh" bằng cách đổi tên biến.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const season = require('../src/lib/season');
const { activeSeasons, isItemInSeason, SEASON_LABEL, LUNAR_MONTHS, SOLAR_WINDOWS } = season;
const config = require('../src/config');
const { EVENTS, eventForDate } = require('../src/data/events');
const catalog = require('../scripts/db-catalog-ids.json');

const d = (ngay, thang, nam = 2026) => new Date(nam, thang - 1, ngay, 12, 0, 0);

// ------------------------------------------------------------
test('#1 cửa sổ Halloween mở/đóng ĐÚNG ngày (gồm cả hai đầu mút)', () => {
    const mong = [
        [d(24, 10), false, '24/10 — trước cửa sổ'],
        [d(25, 10), true, '25/10 — đầu mút mở'],
        [d(30, 10), true, '30/10 — giữa'],
        [d(31, 10), true, '31/10 — chính lễ'],
        [d(1, 11), true, '01/11 — đầu mút đóng'],
        [d(2, 11), false, '02/11 — sau cửa sổ'],
        [d(31, 10, 2027), true, '31/10 năm khác — cửa sổ không gắn với năm'],
    ];
    const sai = mong
        .filter(([ngay, co]) => activeSeasons(ngay).has('halloween') !== co)
        .map(([, co, nhan]) => `${nhan}: đáng lẽ ${co ? 'MỞ' : 'ĐÓNG'}`);
    assert.deepStrictEqual(sai, [], 'Cửa sổ dương lịch sai ngày:\n  · ' + sai.join('\n  · '));
});

// ------------------------------------------------------------
test('#2 cửa sổ vắt qua Giao thừa vẫn hiểu đúng (tháng 12 -> tháng 1)', () => {
    // SOLAR_WINDOWS hiện chưa có mùa nào vắt năm, nhưng logic so sánh tháng*100+ngày sẽ
    // ĐẢO NGƯỢC nếu ai đó thêm. Khoá ngay bây giờ, rẻ hơn nhiều so với debug vào 01/01.
    const { trongCuaSoDuong } = (() => {
        // Hàm nội bộ không export -> kiểm gián tiếp qua một mùa giả cắm thẳng vào bảng.
        SOLAR_WINDOWS.__thu = { from: [28, 12], to: [3, 1] };
        return { trongCuaSoDuong: (ngay) => activeSeasons(ngay).has('__thu') };
    })();
    try {
        assert.strictEqual(trongCuaSoDuong(d(27, 12)), false, '27/12 đáng lẽ ĐÓNG');
        assert.strictEqual(trongCuaSoDuong(d(28, 12)), true, '28/12 đáng lẽ MỞ');
        assert.strictEqual(trongCuaSoDuong(d(31, 12)), true, '31/12 đáng lẽ MỞ');
        assert.strictEqual(trongCuaSoDuong(d(1, 1)), true, '01/01 đáng lẽ MỞ');
        assert.strictEqual(trongCuaSoDuong(d(3, 1)), true, '03/01 đáng lẽ MỞ');
        assert.strictEqual(trongCuaSoDuong(d(4, 1)), false, '04/01 đáng lẽ ĐÓNG');
    } finally {
        delete SOLAR_WINDOWS.__thu;
    }
});

// ------------------------------------------------------------
test('#3 mùa ÂM lịch không bị nhánh dương làm hỏng', () => {
    // Trung Thu 2026 rơi vào 25/09 dương (rằm tháng 8 âm). Chỉ cần tháng 8 âm là mở.
    assert.ok(activeSeasons(d(25, 9)).has('trungthu'), 'Trung Thu phải mở quanh rằm tháng 8 âm');
    assert.ok(!activeSeasons(d(25, 9)).has('halloween'), 'Halloween không được mở vào tháng 9');
    // Và mọi mùa âm đã khai báo đều phải mở được ÍT NHẤT một ngày trong năm — mùa khai mà
    // không bao giờ mở chính là lỗi #1 ở dạng âm lịch.
    for (const id of Object.keys(LUNAR_MONTHS)) {
        let moNgayNao = false;
        for (let thang = 1; thang <= 12 && !moNgayNao; thang++) {
            for (let ngay = 1; ngay <= 28; ngay += 3) {
                if (activeSeasons(d(ngay, thang)).has(id)) { moNgayNao = true; break; }
            }
        }
        assert.ok(moNgayNao, `Mùa âm "${id}" không mở ngày nào trong 2026 -> đồ gắn mùa đó biến mất khỏi /store`);
    }
});

// ------------------------------------------------------------
test('#4 lịch âm hỏng thì mùa DƯƠNG vẫn sống (fail-safe, Luật 6)', () => {
    // `solar2lunar` tra bảng và có thể ném. Bản cũ của season.js không bọc try/catch nên
    // một cú ném ở đó làm CHẾT luôn /store list (nó gọi isItemInSeason cho mọi món).
    const amlich = require('../src/lib/amlich');
    const that = amlich.solar2lunar;
    amlich.solar2lunar = () => { throw new Error('bảng lịch hỏng'); };
    try {
        delete require.cache[require.resolve('../src/lib/season')];
        const lai = require('../src/lib/season');
        assert.ok(lai.activeSeasons(d(31, 10)).has('halloween'),
            'Lịch âm ném -> mùa dương phải vẫn mở');
        assert.doesNotThrow(() => lai.isItemInSeason({ season: 'tet' }, d(31, 10)),
            'isItemInSeason không được ném ra ngoài khi lịch âm hỏng');
    } finally {
        amlich.solar2lunar = that;
        delete require.cache[require.resolve('../src/lib/season')];
        require('../src/lib/season');
    }
});

// ------------------------------------------------------------
test('#5 mọi mùa có NHÃN đều phải có CỬA mở, và ngược lại', () => {
    // Đây chính là lỗi gốc đợt này ở dạng tổng quát: nhãn 'halloween' tồn tại nhưng không
    // bảng nào mở cửa cho nó. Hai chiều, vì thiếu chiều nào cũng là một kiểu hỏng khác.
    const coCua = new Set([...Object.keys(LUNAR_MONTHS), ...Object.keys(SOLAR_WINDOWS)]);
    const coNhan = new Set(Object.keys(SEASON_LABEL));
    assert.deepStrictEqual([...coNhan].filter(id => !coCua.has(id)).sort(), [],
        'Mùa có nhãn mà KHÔNG có cửa mở -> đồ gắn mùa đó không bao giờ bán được.');
    assert.deepStrictEqual([...coCua].filter(id => !coNhan.has(id)).sort(), [],
        'Mùa có cửa mà KHÔNG có nhãn -> /store báo lỗi mùa với chuỗi rỗng.');
});

// ------------------------------------------------------------
test('#6 mọi mùa đều có nhãn ở CẢ hai ngôn ngữ (đọc thẳng JSON, không qua t())', () => {
    // `t()` rơi về bản Việt khi thiếu khoá tiếng Anh, nên mọi phép kiểm viết qua `t()`
    // đều XANH GIẢ trong khi người dùng EN đọc tiếng Việt. Phải đọc thẳng tệp.
    const doc = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'src/locales', f), 'utf8'));
    const vi = doc('vi.json'), en = doc('en.json');
    const thieu = [];
    for (const id of Object.keys(SEASON_LABEL)) {
        if (!vi.commands?.store?.seasons?.[id]) thieu.push(`vi.json thiếu commands.store.seasons.${id}`);
        if (!en.commands?.store?.seasons?.[id]) thieu.push(`en.json thiếu commands.store.seasons.${id}`);
    }
    assert.deepStrictEqual(thieu, [], thieu.join('\n  · '));
});

// ------------------------------------------------------------
// Helper: URL raw.githubusercontent -> đường dẫn thật trong repo.
function duongDanRepo(url) {
    const m = String(url).match(/\/master\/(.+)$/);
    return m ? path.join(ROOT, m[1]) : null;
}

test('#7 MỌI ảnh khai trong config phải là FILE CÓ THẬT trong repo', () => {
    // Quét CẢ PRESET_BANNERS lẫn SEASONAL_IMAGES, không chỉ nhóm vừa thêm: bài học của
    // các đợt trước là phép đo soi đúng thứ đang nghi thì lần sau lỗi mọc ở chỗ khác.
    const hong = [];
    for (const nhom of ['PRESET_BANNERS', 'SEASONAL_IMAGES']) {
        for (const [khoa, url] of Object.entries(config[nhom] || {})) {
            const p = duongDanRepo(url);
            if (!p) { hong.push(`${nhom}.${khoa}: URL không theo dạng raw.githubusercontent/.../master/<đường dẫn> — không kiểm được`); continue; }
            if (!fs.existsSync(p)) hong.push(`${nhom}.${khoa}: KHÔNG có file ${path.relative(ROOT, p)}`);
        }
    }
    assert.deepStrictEqual(hong, [],
        'Ảnh khai trong config không tồn tại trong repo -> embed hiện ô ảnh vỡ, Discord KHÔNG báo lỗi:\n  · ' + hong.join('\n  · '));
});

// ------------------------------------------------------------
test('#8 mọi sự kiện có `image` phải trỏ tới một khoá CÓ THẬT trong SEASONAL_IMAGES', () => {
    const hong = EVENTS
        .filter(ev => ev.image && !config.SEASONAL_IMAGES?.[ev.image])
        .map(ev => `${ev.id}: image = "${ev.image}" không có trong config.SEASONAL_IMAGES`);
    assert.deepStrictEqual(hong, [],
        'Khoá ảnh sai -> embed rơi âm thầm về ảnh Waguri ngẫu nhiên, trông như vẫn chạy:\n  · ' + hong.join('\n  · '));
});

// ------------------------------------------------------------
test('#9 CHẠY THẬT: runDecision gửi embed mang ĐÚNG ảnh Halloween', async () => {
    // Phép đọc mã chỉ chứng minh chuỗi CÓ MẶT. Phép này chứng minh nó ĐI TỚI ĐƯỢC Discord:
    // chạy thật nhánh thông báo với client giả và bắt payload gửi đi. Đây là tầng mà cổng
    // cũ không chạm tới — y hệt bài học Sổ Sứ Mệnh (nút có mã nhưng không ai nối dây).
    const evPath = require.resolve('../src/lib/event');
    const dataPath = require.resolve('../src/data/events');
    const calPath = require.resolve('../src/lib/eventCalendar');
    const luu = { ev: require.cache[evPath], data: require.cache[dataPath], cal: require.cache[calPath] };
    const envCu = process.env.ANNOUNCEMENT_CHANNEL_ID;

    const halloween = eventForDate(d(31, 10));
    assert.ok(halloween && halloween.id === 'halloween', '31/10 phải ra sự kiện halloween');

    let daGui = null;
    try {
        // Thay `./event` (DB) và `../data/events` (ép đúng ngày lễ) TRƯỚC khi nạp eventCalendar —
        // tệp đó destructure lúc require, vá sau là vô nghĩa.
        delete require.cache[calPath];
        require.cache[evPath] = { id: evPath, loaded: true, exports: {
            loadEvent: async () => {},
            getEventInfo: () => ({ active: false }),
            setEvent: async () => {},
            clearEvent: async () => {},
        } };
        require.cache[dataPath] = { id: dataPath, loaded: true, exports: {
            EVENTS, eventForDate: () => halloween,
        } };
        process.env.ANNOUNCEMENT_CHANNEL_ID = '123456789';

        const { runDecision } = require(calPath);
        await runDecision({
            shard: null,
            channels: { fetch: async () => ({ isTextBased: () => true, send: async p => { daGui = p; } }) },
            // iconURL rỗng bị discord.js từ chối (CombinedPropertyError) — phải là URL thật.
            user: { username: 'Waguri', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' },
        });
    } finally {
        process.env.ANNOUNCEMENT_CHANNEL_ID = envCu;
        for (const [p, m] of [[evPath, luu.ev], [dataPath, luu.data], [calPath, luu.cal]]) {
            if (m) require.cache[p] = m; else delete require.cache[p];
        }
    }

    assert.ok(daGui, 'runDecision KHÔNG gửi gì tới kênh thông báo — đoạn dây bị đứt');
    const anh = daGui.embeds?.[0]?.data?.image?.url;
    assert.strictEqual(anh, config.SEASONAL_IMAGES.HALLOWEEN_BANNER,
        `Embed sự kiện mang ảnh "${anh}" chứ không phải banner Halloween — ev.image không đi tới .setImage()`);
});

// ------------------------------------------------------------
test('#10 hai món Halloween: có trong DB, đúng mùa, và KHÔNG in tiền được', () => {
    const MON = ['keo_bi_ngo', 'banh_ma_gekka'];

    // (a) có thật trong danh mục prod (db-catalog-ids.json sinh thẳng từ DB)
    const thieu = MON.filter(id => !catalog.items.includes(id));
    assert.deepStrictEqual(thieu, [],
        `Món Halloween không có trong DB -> /crate rơi vào nhánh "trao hỏng": ${thieu.join(', ')}`);

    // (b) migration 0160 phải gắn đúng mùa — nếu không, mục (a) xanh mà đồ vẫn không hiện
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/0160_halloween_items.sql'), 'utf8');
    for (const id of MON) {
        const dong = sql.split(/\r?\n/).find(l => l.includes(`'${id}'`) && l.trim().startsWith('('));
        assert.ok(dong, `0160 không có dòng INSERT cho ${id}`);
        assert.ok(dong.includes("'halloween'"), `0160: ${id} không gắn season 'halloween'`);
    }

    // (c) KHÔNG nằm trong danh sách món chợ -> đường bán duy nhất là sell_item (50% giá mua)
    //     -> mua ở /store rồi bán luôn LỖ. Đây là phép kiểm mà migration KHÔNG đặt được,
    //     vì bảng market_prices đã bị 0111 xoá và danh sách món chợ sống trong JS.
    const { BASE_MARKET_ITEMS } = require('../src/lib/market');
    const loMay = MON.filter(id => BASE_MARKET_ITEMS[id]);
    assert.deepStrictEqual(loMay, [],
        `Đồ Halloween lọt vào chợ: mua ở tiệm rồi bán ở chợ có thể LÃI = in tiền (Luật 10): ${loMay.join(', ')}`);

    // (d) đúng mùa thì /store cho mua, trái mùa thì không
    assert.ok(isItemInSeason({ season: 'halloween' }, d(31, 10)), '31/10 phải mua được');
    assert.ok(!isItemInSeason({ season: 'halloween' }, d(15, 6)), '15/6 không được mua');
});

// ------------------------------------------------------------
test('#11 huy hiệu gắn mùa phải CÓ CỬA CHẶN trong /cosmetic badge-buy', () => {
    // Cấu hình có `season` mà nhánh mua không kiểm = huy hiệu giới hạn bán quanh năm.
    // Neo nằm TRONG nhánh `badge-buy` (bài học: neo phải ở trong thứ nó soi) và có chốt
    // chặn độ dài để `indexOf` trượt thì báo đỏ chứ không im lặng nuốt cả tệp.
    const src = fs.readFileSync(path.join(ROOT, 'src/commands/economy/cosmetic.js'), 'utf8');
    const dau = src.indexOf("if (sub === 'badge-buy')");
    const cuoi = src.indexOf("if (sub === 'badge-equip')");
    assert.ok(dau !== -1 && cuoi !== -1 && cuoi > dau, 'Không định vị được nhánh badge-buy');
    const latCat = src.slice(dau, cuoi);
    assert.ok(latCat.length < 4000,
        `Lát cắt badge-buy phình tới ${latCat.length} ký tự — neo đã trượt, phép kiểm dưới đây vô nghĩa`);
    assert.ok(/badgeConf\.season/.test(latCat) && /activeSeasons\(\)/.test(latCat),
        'Nhánh badge-buy KHÔNG kiểm `badgeConf.season` -> huy hiệu mùa mua được quanh năm.');

    // Và phải có ít nhất một huy hiệu thật sự dùng cơ chế đó, nếu không cửa trên là mã chết.
    const coMua = Object.entries(config.COSMETIC.BADGES).filter(([, b]) => b.season);
    assert.ok(coMua.length > 0, 'Không huy hiệu nào gắn `season` -> cửa chặn ở trên là mã chết');
    for (const [id, b] of coMua) {
        assert.ok(SEASON_LABEL[b.season], `Huy hiệu "${id}" gắn mùa "${b.season}" không có trong SEASON_LABEL`);
        assert.ok(b.cost > 0, `Huy hiệu mùa "${id}" có cost <= 0 -> nhánh badge-buy từ chối trước khi tới cửa mùa`);
    }
});

// ------------------------------------------------------------
test('#12 /crate thật sự nối dây mùa Halloween vào hai rổ thưởng', () => {
    // KHÔNG kiểm được bằng cách chạy thật: `activeSeasons()` trong crate.js đọc NGÀY HIỆN
    // TẠI và không nhận tham số, nên một phép chạy thật sẽ xanh trong cửa sổ 25/10–01/11 rồi
    // đỏ vào tháng 12 — tức là cổng tự hỏng theo lịch. Nên đây là phép đọc mã có neo nằm
    // TRONG nhánh cần soi và có chốt chặn độ dài; nó chứng minh đoạn dây CÓ MẶT, còn việc
    // nó CHẠY ĐÚNG thì phép #1 (cửa sổ) và #10 (món có thật) đã gánh.
    const src = fs.readFileSync(path.join(ROOT, 'src/commands/games/crate.js'), 'utf8');

    const dau = src.indexOf('const laHalloween');
    const cuoi = src.indexOf('const r = Math.random()');
    assert.ok(dau !== -1 && cuoi !== -1 && cuoi > dau,
        'Không định vị được khối trộn rổ Halloween trong crate.js');
    const latCat = src.slice(dau, cuoi);
    assert.ok(latCat.length < 800,
        `Lát cắt phình tới ${latCat.length} ký tự — neo đã trượt, phép kiểm dưới đây vô nghĩa`);

    assert.ok(/activeSeasons\(\)\.has\('halloween'\)/.test(latCat),
        'crate.js không hỏi mùa Halloween -> đồ lễ không bao giờ vào rổ');
    for (const hang of ['HALLOWEEN_COMMON', 'HALLOWEEN_GOOD']) {
        assert.ok(latCat.includes(hang), `Rổ thưởng không dùng ${hang}`);
    }

    // Hai hằng phải trỏ đúng mã CÓ THẬT — sai mã thì mọi lượt rơi vào chúng báo "trao hỏng".
    const ma = [...src.matchAll(/const HALLOWEEN_(?:COMMON|GOOD) = '([^']+)'/g)].map(m => m[1]);
    assert.strictEqual(ma.length, 2, 'Phải có đúng 2 hằng mã đồ Halloween trong crate.js');
    const laLac = ma.filter(id => !catalog.items.includes(id));
    assert.deepStrictEqual(laLac, [], `Mã đồ Halloween trong crate.js không có trong DB: ${laLac.join(', ')}`);

    // Và hai rổ phải được DÙNG ở nhánh trao đồ, không chỉ khai rồi bỏ đó.
    assert.ok(/dongDo\(rooCommon,/.test(src) && /dongDo\(rooGood,/.test(src),
        'Rổ trộn mùa được khai nhưng nhánh trao đồ vẫn dùng rổ cũ -> mã chết');
});
