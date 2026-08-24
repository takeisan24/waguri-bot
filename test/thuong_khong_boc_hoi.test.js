// ============================================================
// test/thuong_khong_boc_hoi.test.js — phần thưởng không được bốc hơi giữa hai lời gọi.
//
// LỚP LỖI: ghi nhận thành công ở lời gọi A, trao thưởng hỏng ở lời gọi B, và vì A không đảo
// lại được nên chạy lại cũng KHÔNG trao lại. Đã cắn một lần ở `/achievements` (vá ở 0141),
// và đợt audit lô kinh tế 2026-08-24 tìm thấy ba chỗ nữa cùng hình dạng.
//
// BA MỨC XỬ LÝ, cố ý khác nhau — đừng "thống nhất" chúng lại:
//
//   `/worldevent claim`   -> RPC GỘP (0144). Nặng nhất: đặt cờ `claimed` rồi mới cấp đồ, nên
//                            hỏng là mất VĨNH VIỄN. Đã chứng minh trên DB test bằng cách ép
//                            bước cấp tràn số nguyên -> hàm nổ -> cờ cuộn lại thành false.
//   `/cosmetic badge-buy` -> RPC GỘP (0144). Bản cũ ba bước: trừ tiền -> cấp -> hoàn tiền,
//                            mà lời hoàn KHÔNG kiểm kết quả. Nay kiểm sở hữu TRƯỚC khi trừ
//                            nên không còn đường hoàn tiền để mà hỏng.
//   `/fish`, `/tiembanh`  -> KIỂM KẾT QUẢ là đủ. Không có cờ "đã nhận" nào bị bật, nên mất
//                            một lần rồi làm lại là có. Gộp giao dịch ở đây là quá tay.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

/** Migration khai báo hàm — tìm theo TÊN HÀM, không ghim số hiệu tệp. */
function sqlCua(tenHam) {
    const dir = path.join(ROOT, 'supabase', 'migrations');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        if (t.includes(`function public.${tenHam}`)) return t;
    }
    return null;
}

test('worldevent: đặt cờ và cấp thưởng nằm trong MỘT lời gọi', () => {
    const s = doc('src', 'commands', 'economy', 'worldevent.js');
    assert.match(s, /db\.claimWorldEventRewardAtomic\(/,
        'Phải dùng RPC gộp. Hai lời gọi rời nhau thì cấp hỏng là mất thưởng vĩnh viễn.');
    assert.doesNotMatch(s, /db\.claimWorldEventReward\(/,
        'Còn gọi bản CŨ (không gộp) — đúng lỗi đang vá.');
    assert.doesNotMatch(s, /await\s+db\.giveItemAdmin\(/,
        'Còn cấp vật phẩm bằng lời gọi RIÊNG: vật phẩm phải được cấp bên trong RPC.');
    assert.match(s, /r === 'error'/,
        'Phải có nhánh riêng cho lỗi DB, không gộp im lặng vào nhánh khác.');
});

test('worldevent RPC: cờ claimed phải đặt TRƯỚC khi cấp, trong cùng giao dịch', () => {
    const sql = sqlCua('claim_world_event_reward_atomic');
    assert.ok(sql, 'Không tìm thấy migration khai báo claim_world_event_reward_atomic.');

    const iCo = sql.indexOf('set claimed = true');
    const iCap = sql.indexOf('insert into inventory');
    assert.ok(iCo > -1 && iCap > -1, 'RPC phải vừa đặt cờ vừa cấp vật phẩm.');
    assert.ok(iCo < iCap,
        'Đang cấp vật phẩm TRƯỚC khi đặt cờ. Nếu đặt cờ hỏng, người chơi bấm lại và nhận\n'
        + 'thêm lần nữa — máy in vật phẩm, tệ hơn hẳn lỗi đang vá.');
    assert.match(sql, /for update/i, 'Phải khoá dòng đóng góp, nếu không hai lần bấm cùng lúc đều đi qua.');
    assert.match(sql, /p_qty\s*<\s*0[\s\S]{0,120}raise exception/i, 'Phải chặn số lượng âm.');
});

test('cosmetic: mua huy hiệu không còn đường hoàn tiền để mà hỏng', () => {
    const s = doc('src', 'commands', 'economy', 'cosmetic.js');
    assert.match(s, /db\.buyBadge\(/, 'Phải dùng RPC gộp buy_badge.');
    assert.match(s, /kq === 'owned'/, 'Phải xử lý trạng thái owned.');
    assert.match(s, /kq === 'poor'/, 'Phải xử lý trạng thái poor.');
    assert.match(s, /kq !== 'ok'/, 'Phải có nhánh bắt mọi trạng thái còn lại (gồm lỗi DB).');
    assert.doesNotMatch(s, /db\.unlockBadge\(/,
        'Còn cấp huy hiệu bằng lời gọi riêng — nghĩa là đã tách lại thành nhiều bước.');

    const sql = sqlCua('buy_badge');
    assert.ok(sql, 'Không tìm thấy migration khai báo buy_badge.');
    const iKiem = sql.indexOf('exists (select 1 from user_badges');
    const iTru = sql.indexOf('update users set wallet');
    assert.ok(iKiem > -1 && iTru > -1, 'RPC phải vừa kiểm sở hữu vừa trừ tiền.');
    assert.ok(iKiem < iTru,
        'Đang trừ tiền TRƯỚC khi kiểm sở hữu — lại đẻ ra nhu cầu hoàn tiền, đúng thứ vừa bỏ.');
    assert.match(sql, /p_cost\s*<\s*0[\s\S]{0,120}raise exception/i, 'Phải chặn giá âm.');
});

test('cả hai RPC mới phải bị thu quyền khỏi khoá công khai', () => {
    for (const ham of ['claim_world_event_reward_atomic', 'buy_badge']) {
        const sql = sqlCua(ham);
        assert.match(sql, new RegExp(`revoke all on function public\\.${ham}`, 'i'),
            `${ham}: Postgres mặc định cho PUBLIC quyền EXECUTE. Thiếu REVOKE là khoá công\n`
            + 'khai trong bundle web gọi được hàm ghi tiền — đúng lỗ hổng 0137 vừa bịt.');
        assert.match(sql, new RegExp(`grant execute on function public\\.${ham}[\\s\\S]{0,60}service_role`, 'i'),
            `${ham}: phải GRANT lại cho service_role, nếu không bot cũng không gọi được.`);
    }
});

test('fish và tiembanh: kiểm kết quả là đủ, không khoe khi cấp hỏng', () => {
    const fish = doc('src', 'commands', 'economy', 'fish.js');
    const khoe = fish.split('\n').filter(l => /desc \+=/.test(l) && !/if \(daTrao\)/.test(l));
    assert.deepStrictEqual(khoe, [], 'fish.js còn dòng khoe không nằm sau `if (daTrao)`.');

    const banh = doc('src', 'commands', 'economy', 'tiembanh.js');
    assert.match(banh, /const daTraoBanh = await db\.giveItemAdmin\(/,
        'tiembanh.js phải giữ kết quả giveItemAdmin.');
    assert.match(banh, /if \(daTraoBanh\)[\s\S]{0,120}cakeMsg =/,
        'Dòng khoe bánh phải nằm sau `if (daTraoBanh)`.');
});
