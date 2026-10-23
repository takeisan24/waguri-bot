// ============================================================
// test/khong_cho_db_truoc_ack.test.js — không chờ DB trước khi ack.
//
// CHUYỆN ĐÃ XẢY RA: `/study start` gọi `studyLib.startStudySession` — một lời GHI DB — TRƯỚC
// mọi lời ack. DB chậm hơn hạn 3 giây của Discord thì interaction chết: người chơi đọc "The
// application did not respond" TRONG KHI phiên học đã được tạo, rồi `/study status` lại báo
// đang có phiên. Kiểu vỡ đắt nhất: không lỗi, không log, chỉ nói sai.
//
// Phát hiện 23/10 nhờ đồng hồ ack mới (`ec75e46`) in ra con số THẬT trong log prod.
//
// LUẬT (chốt ở sổ ack 22/10):
//   · lời ĐỌC trên đường trước ack -> bọc `withTimeout` + fail-open
//   · lời GHI -> **ack trước, ghi sau**. KHÔNG chặn trần lời ghi: chặn ở 800ms mà DB thành
//     công ở 900ms là nói sai lần nữa.
//
// HAI LẦN TÔI ĐỊNH QUY TỘI SAI, ghi ra để khỏi lặp:
//   · `getInteractionLanguage` — tưởng là thủ phạm, nhưng nó CÓ cache (`localeCacheGet`) và
//     `interactionCreate` đã gọi trước khi dispatch, nên lượt gọi trong lệnh là cache-hit.
//   · `getLiveMarketPrices` — tưởng chạm DB, nhưng nó thuần in-memory (giá suy ra, 0 query).
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// Được phép await TRƯỚC ack — mỗi mục PHẢI có lý do đã kiểm.
const CHO_PHEP = {
    getInteractionLanguage: 'có cache (localeCacheGet) và interactionCreate đã làm ấm trước khi '
        + 'dispatch -> lượt gọi trong lệnh là cache-hit, tính bằng micro giây.',
    isOwner: 'getOwnerIds cache sau lần đầu; lần đầu có một lời REST tới Discord nhưng chỉ ở '
        + 'lệnh owner (3 lệnh, lưu lượng ~0).',
    getLiveMarketPrices: 'thuần in-memory — giá chợ là giá SUY RA từ items.price × hash khối 4h, '
        + '0 query DB (xem lib/market.js).',
};

function quet() {
    const ra = [];
    const di = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) return di(p);
        if (!e.name.endsWith('.js')) return;
        const src = fs.readFileSync(p, 'utf8');
        const rel = path.relative(ROOT, p).replace(/\\/g, '/');

        const i = src.search(/async execute\s*\(/);
        if (i < 0) return;
        const than = src.slice(i);
        const ack = than.search(/\.(deferReply|deferUpdate|reply|showModal|respond)\s*\(/);
        if (ack < 0) return;   // uỷ thác ack cho hàm khác — nhánh này `canh_ack` lo lúc chạy

        const dauThan = than.slice(0, ack);
        const awaits = [...dauThan.matchAll(/await\s+([A-Za-z_$][\w$.]*)\s*\(/g)]
            .map((m) => m[1].split('.').pop());
        if (awaits.length) ra.push({ rel, awaits });
    });
    di(path.join(ROOT, 'src', 'commands'));
    return ra;
}

test('phép đo tự kiểm: có quét được lệnh và có thấy lời ack', () => {
    const r = quet();
    assert.ok(r.length > 0,
        'không lệnh nào có await trước ack — nghe quá tốt để là thật, phép quét có lẽ đã trượt');
});

test('không lệnh nào chờ việc CHƯA ĐƯỢC KIỂM trước khi ack', () => {
    const xau = [];
    for (const { rel, awaits } of quet()) {
        for (const ten of awaits) {
            if (CHO_PHEP[ten]) continue;
            xau.push(`${rel}: await ${ten}() TRƯỚC ack`);
        }
    }
    assert.deepStrictEqual(xau, [],
        `${xau.length} chỗ chờ việc chưa kiểm trước khi ack. Nếu là lời GHI -> ack trước, ghi `
        + `sau. Nếu là lời ĐỌC đã chứng minh rẻ -> thêm vào CHO_PHEP kèm lý do thật:\n  `
        + xau.join('\n  '));
});

test('/study start ack TRƯỚC khi ghi phiên học', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'fun', 'study.js'), 'utf8');
    const iAck = src.indexOf('await interaction.deferReply()');
    const iGhi = src.indexOf('studyLib.startStudySession(');
    assert.ok(iAck > 0, 'không thấy deferReply trong /study');
    assert.ok(iGhi > 0, 'không thấy lời ghi startStudySession');
    assert.ok(iAck < iGhi,
        'lời GHI phiên học đứng TRƯỚC ack -> DB chậm là người chơi đọc "did not respond" trong '
        + 'khi phiên ĐÃ được tạo');
});

test('/study start vẫn trả lời ẩn cho trường hợp trùng phiên thấy được trong RAM', () => {
    // Sau khi defer CÔNG KHAI thì không ẩn lại được. Nhánh rẻ (RAM) phải đứng TRƯỚC defer để
    // giữ nguyên hành vi cũ: không làm ồn kênh chat khi ai đó gõ `/study start` hai lần.
    const src = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'fun', 'study.js'), 'utf8');
    const iRam = src.indexOf('studyLib.activeSessions.has(userId)');
    const iAck = src.indexOf('await interaction.deferReply()');
    assert.ok(iRam > 0, 'mất phép kiểm trùng phiên trong RAM -> mọi lần gõ hai lần sẽ báo công khai');
    assert.ok(iRam < iAck, 'phép kiểm RAM phải đứng TRƯỚC defer mới ẩn được');
    const giua = src.slice(iRam, iAck);
    assert.match(giua, /MessageFlags\.Ephemeral/, 'nhánh trùng phiên trong RAM phải trả lời ẩn');
});

test('mọi mục CHO_PHEP đều có lý do tử tế', () => {
    for (const [k, v] of Object.entries(CHO_PHEP)) {
        assert.ok(typeof v === 'string' && v.trim().length > 40,
            `CHO_PHEP["${k}"] thiếu lý do đã kiểm — danh sách miễn không lý do là cách lớp lỗi `
            + 'này quay lại');
    }
});
