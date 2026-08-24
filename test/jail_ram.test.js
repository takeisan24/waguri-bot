// ============================================================
// test/jail_ram.test.js — Gác BỘ NHỚ GIAM trong RAM.
//
// VÌ SAO CÓ: ngày 24-08 vòng DB tra "giam" bị gỡ khỏi đường trước ack của 18 lệnh đông
// nhất (xem `src/lib/jail.js`). Đổi lấy tốc độ thì phải trả bằng một rủi ro mới: nguồn
// sự thật nay nằm trong RAM, và RAM thì hỏng THẦM LẶNG.
//
// Hai kiểu hỏng đối nghịch, test này gác cả hai:
//   · nhớ HỤT  -> người vừa bị giam vẫn chơi tiếp -> thủng đúng chỗ tính năng cần chặn
//   · nhớ THỪA -> quên dọn khi hết hạn -> giam vĩnh viễn, người chơi không hiểu vì sao
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const db = require('../src/database.js');
const jail = require('../src/lib/jail');
const { loadJails, isJailed, refreshJail, _giam } = jail;

const PHUT = 60_000;
const mocISO = ms => new Date(Date.now() + ms).toISOString();

/** Chạy `fn` với `db.getJailedUsers`/`db.getJail` bị thay, rồi trả nguyên trạng. */
async function voiDbGia({ danhSach, motNguoi }, fn) {
    const g1 = db.getJailedUsers, g2 = db.getJail;
    if (danhSach) db.getJailedUsers = danhSach;
    if (motNguoi) db.getJail = motNguoi;
    try { return await fn(); } finally { db.getJailedUsers = g1; db.getJail = g2; }
}

test('nạp: chỉ giữ người CÒN hạn, bỏ qua án đã hết', async () => {
    _giam.xoaHet();
    const n = await voiDbGia({
        danhSach: async () => [
            { user_id: 'con_han', jailed_until: mocISO(30 * PHUT), jail_reason: 'trộm heo bị bắt' },
            { user_id: 'het_han', jailed_until: mocISO(-30 * PHUT), jail_reason: 'cũ' },
        ],
    }, loadJails);

    assert.strictEqual(n, 1, 'Án đã hết mà vẫn nạp thì người ta bị giam oan sau mỗi lần khởi động');
    assert.ok(isJailed('con_han'), 'Người còn hạn PHẢI vẫn bị chặn — đây là lỗ hổng kinh tế nếu sai');
    assert.strictEqual(isJailed('het_han'), null);
});

test('kiểm tra: ĐỒNG BỘ và KHÔNG chạm DB', async () => {
    _giam.xoaHet();
    await voiDbGia({
        danhSach: async () => [{ user_id: 'u1', jailed_until: mocISO(10 * PHUT), jail_reason: null }],
    }, loadJails);

    // DB hỏng hoàn toàn: nếu `isJailed` còn lén tra DB thì chỗ này sẽ ném hoặc trả Promise.
    await voiDbGia({ motNguoi: () => { throw new Error('DB sập'); } }, async () => {
        const kq = isJailed('u1');
        assert.ok(kq && typeof kq.until === 'number',
            'isJailed phải trả thẳng dữ liệu trong RAM, không phụ thuộc DB');
        assert.ok(!(kq instanceof Promise), 'isJailed không được trả Promise — nó nằm trên đường trước ack');
    });
});

test('hết hạn: tự dọn khỏi RAM, không giam vĩnh viễn', async () => {
    _giam.xoaHet();
    await voiDbGia({
        danhSach: async () => [{ user_id: 'sap_het', jailed_until: mocISO(40), jail_reason: 'x' }],
    }, loadJails);

    assert.ok(isJailed('sap_het'), 'Chưa tới hạn thì vẫn phải bị chặn');
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(isJailed('sap_het'), null, 'Quá hạn mà vẫn chặn = giam vĩnh viễn');
    assert.strictEqual(_giam.size(), 0, 'Phải dọn khỏi Map, nếu không bản đồ phình mãi theo thời gian');
});

test('đồng bộ lại: nhặt ĐÚNG mốc sau khi bảo hiểm giảm nửa án', async () => {
    // Đây là lý do `refreshJail` đọc lại DB thay vì tự ghi mốc đã tính sẵn: RPC `halve_jail`
    // KHÔNG trả về mốc mới. Tự ghi thì RAM giữ án đầy trong khi DB đã giảm — người chơi bị
    // giam lâu hơn mức đáng chịu, và không có chỗ nào lộ ra là sai.
    _giam.xoaHet();
    const daGiam = Date.now() + 30 * PHUT; // án đã bị halve_jail cắt còn một nửa

    const kq = await voiDbGia({
        motNguoi: async () => ({ jailed_until: new Date(daGiam).toISOString(), jail_reason: 'trộm cây bị bắt' }),
    }, () => refreshJail('u_bao_hiem'));

    assert.ok(kq, 'refreshJail phải trả về án đang có hiệu lực');
    const trongRam = isJailed('u_bao_hiem');
    assert.ok(trongRam, 'Người vừa bị giam PHẢI có mặt trong RAM ngay, không đợi khởi động lại');
    assert.strictEqual(trongRam.until, daGiam, 'RAM phải khớp mốc THẬT trong DB, không phải mốc tự tính');
    assert.strictEqual(trongRam.reason, 'trộm cây bị bắt');
});

test('đồng bộ lại: hết giam thì XOÁ khỏi RAM', async () => {
    _giam.xoaHet();
    await voiDbGia({
        danhSach: async () => [{ user_id: 'u2', jailed_until: mocISO(20 * PHUT), jail_reason: 'x' }],
    }, loadJails);
    assert.ok(isJailed('u2'));

    await voiDbGia({ motNguoi: async () => null }, () => refreshJail('u2'));
    assert.strictEqual(isJailed('u2'), null, 'DB nói hết giam mà RAM còn giữ = giam oan');
});

test('nạp lỗi: fail-OPEN (rỗng), không ném ra làm sập khởi động', async () => {
    _giam.xoaHet();
    // `db.getJailedUsers` đã tự nuốt lỗi và trả [], nên đây kiểm tra đúng hợp đồng đó:
    // DB hỏng -> không ai bị giam -> cả server vẫn chơi được 18 lệnh chính.
    // Đánh đổi có chủ ý, y như chính sách cũ: chặn oan MỌI người đắt hơn nhiều so với việc
    // một người đang bị giam lọt một lượt /work.
    const n = await voiDbGia({ danhSach: async () => [] }, loadJails);
    assert.strictEqual(n, 0);
    assert.strictEqual(isJailed('bat_ky_ai'), null);
});

test('nơi giam người PHẢI đồng bộ lại RAM — nếu không, giam xong vẫn chơi được', () => {
    // Test ở trên chứng minh `refreshJail` chạy đúng, nhưng KHÔNG chứng minh có ai gọi nó.
    // Đúng hai chỗ trên đời giam được người: pig.js và plant.js. Quên gọi ở đó thì mọi test
    // khác vẫn xanh trong khi tính năng thủng — nên soi thẳng mã nguồn.
    const fs = require('fs');
    const path = require('path');
    for (const ten of ['pig.js', 'plant.js']) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', ten), 'utf8');
        const iGiam = src.indexOf('jailOrFine');
        assert.notStrictEqual(iGiam, -1, `${ten}: không còn gọi jailOrFine — test cần cập nhật`);
        const iDongBo = src.indexOf('refreshJail(', iGiam);
        assert.notStrictEqual(iDongBo, -1,
            `${ten}: giam người xong mà KHÔNG gọi refreshJail — người vừa bị giam vẫn chơi ` +
            'tiếp được cho tới lần khởi động lại. Xem src/lib/jail.js.');
    }
});

test('phạm vi: 18 lệnh bị chặn vẫn nguyên, không sót không thừa', () => {
    // Danh sách này quyết định lệnh nào phải hỏi bộ nhớ giam. Đổi nó là đổi bề mặt tính năng.
    assert.strictEqual(jail.JAIL_BLOCKED.size, 18);
    for (const ten of ['work', 'fish', 'daily', 'taixiu', 'rob']) {
        assert.ok(jail.isBlocked(ten), `${ten} phải nằm trong danh sách bị chặn khi bị giam`);
    }
    assert.ok(!jail.isBlocked('help'), 'Lệnh không dính tiền thì không được chặn');
});
