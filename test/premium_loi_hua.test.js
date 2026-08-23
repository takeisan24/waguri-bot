// ============================================================
// test/premium_loi_hua.test.js — Premium chỉ được hứa những gì mã THẬT SỰ làm.
//
// VÌ SAO CÓ: đây là bề mặt duy nhất của dự án có người TRẢ TIỀN, và lời hứa sai ở đây rơi
// đúng vào người trả tiền đầu tiên — người ít khoan dung nhất. Rà ngày 2026-08-23 tìm được
// hai lời hứa không giữ được:
//
//   1. footer: "Quét VietQR · kích hoạt tự động 💎"
//      Webhook Casso CÓ trong mã (voteServer.js:221-299) nhưng chỉ chạy khi có
//      CASSO_WEBHOOK_TOKEN, mà biến đó không tồn tại. Tệ hơn: `free_desc` ngay bên cạnh
//      đã nói đúng là "owner kiểm tra & kích hoạt thủ công". Một màn hình tự mâu thuẫn.
//
//   2. benefits_desc: "Được ưu tiên trải nghiệm tính năng mới"
//      Quét cả mã không có bất kỳ cơ chế nào. Đã đổi thành nhánh Premium của /pass —
//      quyền lợi CÓ THẬT (20/20 mốc) mà bảng cũ chưa hề kể.
//
// Cổng này soi chuỗi hiển thị và đối chiếu với mã, ở CẢ hai ngôn ngữ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const NGU = ['vi', 'en'];
const doc = ngu => require(`../src/locales/${ngu}.json`).commands.premium;

test('KHÔNG hứa kích hoạt tự động khi chưa có webhook thanh toán', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'voteServer.js'), 'utf8');
    const coWebhook = /CASSO_WEBHOOK_TOKEN/.test(src);
    assert.ok(coWebhook, 'Mã webhook biến mất — test này cần viết lại.');

    // Webhook TỒN TẠI trong mã nhưng chỉ bật khi có token. Chừng nào chưa chắc token luôn có
    // trên máy chủ thật thì KHÔNG được hứa tự động.
    for (const ngu of NGU) {
        const s = JSON.stringify(doc(ngu));
        assert.ok(!/kích hoạt tự động|tự động kích hoạt|automatic activation|activated automatically/i.test(s),
            `${ngu}: vẫn hứa "kích hoạt tự động". Webhook Casso chỉ chạy khi có CASSO_WEBHOOK_TOKEN; `
            + 'thiếu biến đó thì người trả tiền ngồi đợi một thứ không tồn tại.');
    }
});

test('màn hình Premium KHÔNG tự mâu thuẫn về cách kích hoạt', () => {
    for (const ngu of NGU) {
        const p = doc(ngu);
        const noiTay = /thủ công|duyệt tay|manually|by the owner/i.test(JSON.stringify(p));
        const noiTuDong = /tự động|automatic/i.test(JSON.stringify(p));
        assert.ok(!(noiTay && noiTuDong),
            `${ngu}: cùng một màn hình vừa nói duyệt tay vừa nói tự động. Người đọc tin cái nào?`);
    }
});

test('mỗi quyền lợi khoe ra đều có cơ chế thật trong mã', () => {
    const config = require('../src/config');

    // (a) hạn mức AI
    assert.ok(config.AI.PREMIUM_DAILY > config.AI.FREE_DAILY,
        'Khoe nhiều lượt chat hơn mà PREMIUM_DAILY không lớn hơn FREE_DAILY.');

    // (b) +% thu nhập — phải thật sự được áp ở đâu đó
    const apDung = ['src/commands/economy/work.js', 'src/lib/gather.js']
        .filter(f => /INCOME_BONUS/.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')));
    assert.ok(apDung.length >= 2,
        'Khoe "+% thu nhập khi /work /fish /mine /chop" nhưng INCOME_BONUS không được áp ở cả work lẫn gather.');

    // (c) nhánh Premium của /pass
    const { REWARDS } = require('../src/data/battlepass_rewards');
    const moc = Object.values(REWARDS);
    const coP = moc.filter(r => r.premium).length;
    assert.strictEqual(coP, moc.length,
        `Khoe thưởng Premium ở CẢ ${moc.length} mốc nhưng chỉ ${coP} mốc có.`);

    // (d) huy hiệu + thành tựu
    const ach = require('../src/data/achievements');
    const ds = Array.isArray(ach) ? ach : (ach.ACHIEVEMENTS || Object.values(ach).find(Array.isArray) || []);
    assert.ok(ds.some(a => a.id === 'is_premium'), 'Khoe thành tựu Premium nhưng không có thành tựu id=is_premium.');
});

test('KHÔNG khoe quyền lợi mơ hồ mà mã không có cơ chế nào', () => {
    // Danh sách những lời hứa từng xuất hiện rồi bị gỡ vì không có gì đứng sau.
    const CAM = [
        [/ưu tiên trải nghiệm|priority access/i, 'ưu tiên tính năng mới — không có cơ chế nào trong mã'],
        [/hỗ trợ ưu tiên|priority support/i, 'hỗ trợ ưu tiên — không có hàng đợi riêng nào'],
        [/không quảng cáo|ad[- ]free/i, 'bỏ quảng cáo — bot vốn không có quảng cáo'],
    ];
    for (const ngu of NGU) {
        const s = JSON.stringify(doc(ngu));
        for (const [re, viSao] of CAM) {
            assert.ok(!re.test(s), `${ngu}: hứa "${viSao}".`);
        }
    }
});

test('hai ngôn ngữ khoe CÙNG một bộ quyền lợi, không lệch nhau', () => {
    const dem = ngu => (doc(ngu).benefits_desc || '').split('\n').filter(x => x.trim().startsWith('•')).length;
    assert.strictEqual(dem('vi'), dem('en'),
        `Bảng quyền lợi vi có ${dem('vi')} dòng còn en có ${dem('en')} — người dùng hai ngôn ngữ đọc hai lời hứa khác nhau.`);
    assert.ok(dem('vi') >= 3, 'Bảng quyền lợi quá ngắn — có phải vừa xoá nhầm không?');
});
