// ============================================================
// test/antinuke.test.js — Khoá phần NÃO của hệ chống nuke.
//
// Vì sao chỉ test tầng này: phần quyết định (đếm cửa sổ trượt, ngưỡng, nhận diện leo
// thang quyền, thang hình phạt) là hàm thuần — sai một dòng ở đây thì hoặc bot ban
// nhầm admin thật, hoặc ngồi im nhìn server bị xoá sạch. Cả hai đều không được phép
// phát hiện bằng cách "gặp ngoài thực tế".
//
// Phần chạm Discord API (ban/kick/khoá server) KHÔNG test ở đây: nó cần một server
// thật và nằm ở bước playtest trong AGENTS.md §3.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits } = require('discord.js');

const {
    taoState, ghiNhan, danhGia, xetHanhVi, demKeTanCong, quyenNguyHiemMoi, quetRac,
} = require('../src/lib/antinuke/detector');
const { thang } = require('../src/lib/antinuke/punish');
const { TRUONG_KHOI_PHUC } = require('../src/lib/antinuke/revert');
const { ANTINUKE } = require('../src/config');

const G = 'guild_1';
const K = 'ke_tan_cong';

// ------------------------------------------------------------------
// 1. Cửa sổ trượt — biên là chỗ dễ sai nhất
// ------------------------------------------------------------------
test('cửa sổ trượt: đếm đúng số lần trong cửa sổ', () => {
    const s = taoState();
    assert.strictEqual(ghiNhan(s, G, K, 'channel_delete', 1000, 20_000), 1);
    assert.strictEqual(ghiNhan(s, G, K, 'channel_delete', 2000, 20_000), 2);
    assert.strictEqual(ghiNhan(s, G, K, 'channel_delete', 3000, 20_000), 3);
});

test('cửa sổ trượt: mốc cũ hơn cửa sổ bị loại', () => {
    const s = taoState();
    ghiNhan(s, G, K, 'channel_delete', 1000, 20_000);
    ghiNhan(s, G, K, 'channel_delete', 2000, 20_000);
    // Lần thứ 3 xảy ra 25 giây sau lần đầu -> hai lần đầu đã rơi khỏi cửa sổ.
    assert.strictEqual(ghiNhan(s, G, K, 'channel_delete', 26_000, 20_000), 1);
});

test('cửa sổ trượt: mốc đúng bằng biên cửa sổ bị loại (dùng > chứ không >=)', () => {
    const s = taoState();
    ghiNhan(s, G, K, 'channel_delete', 1000, 20_000);
    assert.strictEqual(ghiNhan(s, G, K, 'channel_delete', 21_000, 20_000), 1);
});

test('cửa sổ trượt: mỗi người một bộ đếm riêng', () => {
    const s = taoState();
    ghiNhan(s, G, 'a', 'channel_delete', 1000, 20_000);
    ghiNhan(s, G, 'a', 'channel_delete', 1100, 20_000);
    assert.strictEqual(ghiNhan(s, G, 'b', 'channel_delete', 1200, 20_000), 1);
});

test('cửa sổ trượt: mỗi hành vi một bộ đếm riêng', () => {
    const s = taoState();
    ghiNhan(s, G, K, 'channel_delete', 1000, 20_000);
    assert.strictEqual(ghiNhan(s, G, K, 'role_delete', 1100, 20_000), 1);
});

test('cửa sổ trượt: mỗi server một bộ đếm riêng', () => {
    const s = taoState();
    ghiNhan(s, 'g1', K, 'channel_delete', 1000, 20_000);
    assert.strictEqual(ghiNhan(s, 'g2', K, 'channel_delete', 1100, 20_000), 1);
});

test('cửa sổ trượt: có trần chống phình RAM khi bị dội hàng loạt', () => {
    const s = taoState();
    let cuoi = 0;
    for (let i = 0; i < 500; i++) cuoi = ghiNhan(s, G, K, 'channel_delete', 1000 + i, 20_000, 50);
    assert.strictEqual(cuoi, 50, 'phải bị cắt ở trần, không giữ đủ 500 mốc');
});

// ------------------------------------------------------------------
// 2. Ngưỡng
// ------------------------------------------------------------------
test('ngưỡng: dưới ngưỡng thì KHÔNG kích hoạt', () => {
    assert.strictEqual(danhGia('channel_delete', 2), null);
});

test('ngưỡng: đúng ngưỡng thì kích hoạt', () => {
    const qd = danhGia('channel_delete', 3);
    assert.ok(qd);
    assert.strictEqual(qd.verdict, 'ban');
    assert.strictEqual(qd.lockdown, true);
});

test('ngưỡng: hành vi không có luật thì bỏ qua (không đoán bừa)', () => {
    assert.strictEqual(danhGia('mot_hanh_vi_la', 999), null);
});

test('ngưỡng: leo thang quyền kích hoạt ngay lần đầu', () => {
    assert.strictEqual(ANTINUKE.RULES.perm_escalate.limit, 1);
    assert.ok(danhGia('perm_escalate', 1));
});

test('ngưỡng: thêm bot lạ kích hoạt ngay lần đầu', () => {
    assert.ok(danhGia('bot_add', 1));
});

test('xetHanhVi: chỉ trả quyết định ở đúng lần vượt ngưỡng', () => {
    const s = taoState();
    const t0 = 1_000_000;
    assert.strictEqual(xetHanhVi(G, K, 'channel_delete', t0, ANTINUKE.RULES, s), null);
    assert.strictEqual(xetHanhVi(G, K, 'channel_delete', t0 + 1000, ANTINUKE.RULES, s), null);
    const qd = xetHanhVi(G, K, 'channel_delete', t0 + 2000, ANTINUKE.RULES, s);
    assert.ok(qd);
    assert.strictEqual(qd.hits, 3);
});

test('xetHanhVi: rải đủ chậm thì không bao giờ vượt ngưỡng (admin dọn kênh bình thường)', () => {
    const s = taoState();
    let t0 = 1_000_000;
    for (let i = 0; i < 10; i++) {
        assert.strictEqual(xetHanhVi(G, K, 'channel_delete', t0, ANTINUKE.RULES, s), null,
            'xoá 1 kênh mỗi 30 giây là việc dọn dẹp hợp lệ, không được coi là nuke');
        t0 += 30_000;
    }
});

// ------------------------------------------------------------------
// 3. Nhận diện leo thang quyền
// ------------------------------------------------------------------
const ADMIN = PermissionFlagsBits.Administrator;
const BAN = PermissionFlagsBits.BanMembers;
const NOI = PermissionFlagsBits.Speak;

test('leo thang: thêm Administrator bị bắt', () => {
    assert.deepStrictEqual(quyenNguyHiemMoi(0n, ADMIN), ['Administrator']);
});

test('leo thang: thêm quyền vô hại thì bỏ qua', () => {
    assert.deepStrictEqual(quyenNguyHiemMoi(0n, NOI), []);
});

test('leo thang: GỠ quyền nguy hiểm không bị coi là leo thang', () => {
    assert.deepStrictEqual(quyenNguyHiemMoi(ADMIN, 0n), []);
});

test('leo thang: giữ nguyên quyền cũ (chỉ đổi tên/màu role) không bị bắt', () => {
    assert.deepStrictEqual(quyenNguyHiemMoi(ADMIN | BAN, ADMIN | BAN), []);
});

test('leo thang: bắt được nhiều quyền cùng lúc', () => {
    const them = quyenNguyHiemMoi(0n, ADMIN | BAN);
    assert.ok(them.includes('Administrator') && them.includes('BanMembers'));
});

test('leo thang: nhận cả chuỗi bitfield (audit log của Discord trả về chuỗi)', () => {
    assert.deepStrictEqual(quyenNguyHiemMoi('0', String(ADMIN)), ['Administrator']);
});

test('leo thang: đầu vào rác không làm nổ (fail-safe)', () => {
    assert.deepStrictEqual(quyenNguyHiemMoi('khong-phai-so', '123'), []);
    assert.deepStrictEqual(quyenNguyHiemMoi(null, undefined), []);
});

// ------------------------------------------------------------------
// 4. Leo thang nhiều kẻ tấn công
// ------------------------------------------------------------------
test('panic: một kẻ tấn công chưa đủ để coi là chiếm tài khoản hàng loạt', () => {
    const s = taoState();
    assert.strictEqual(demKeTanCong(G, 'a', 1000, 60_000, s), 1);
    assert.strictEqual(demKeTanCong(G, 'a', 2000, 60_000, s), 1, 'cùng một người không được đếm thành hai');
});

test('panic: hai kẻ tấn công khác nhau trong cửa sổ -> chạm ngưỡng leo thang', () => {
    const s = taoState();
    demKeTanCong(G, 'a', 1000, 60_000, s);
    assert.strictEqual(demKeTanCong(G, 'b', 2000, 60_000, s), ANTINUKE.PANIC_EXECUTORS);
});

test('panic: kẻ tấn công cũ rơi khỏi cửa sổ', () => {
    const s = taoState();
    demKeTanCong(G, 'a', 1000, 60_000, s);
    assert.strictEqual(demKeTanCong(G, 'b', 100_000, 60_000, s), 1);
});

// ------------------------------------------------------------------
// 5. Thang hình phạt
// ------------------------------------------------------------------
test('thang: ban tụt dần xuống kick rồi strip (bot thiếu quyền vẫn cứu được server)', () => {
    assert.deepStrictEqual(thang('ban', false), ['ban', 'kick', 'strip']);
});

test('thang: strip KHÔNG tự leo lên mức nặng hơn', () => {
    assert.deepStrictEqual(thang('strip', false), ['strip']);
});

test('thang: với BOT thì không bao giờ dùng strip (role tích hợp gỡ không được)', () => {
    assert.ok(!thang('strip', true).includes('strip'));
    assert.ok(!thang('ban', true).includes('strip'));
    assert.strictEqual(thang('strip', true)[0], 'kick');
});

// ------------------------------------------------------------------
// 6. Dọn rác & cấu hình
// ------------------------------------------------------------------
test('quetRac: xoá bộ đếm nguội, giữ bộ đếm còn nóng', () => {
    const s = taoState();
    ghiNhan(s, G, 'cu', 'channel_delete', 1000, 20_000);
    ghiNhan(s, G, 'moi', 'channel_delete', 1_000_000, 20_000);
    quetRac(1_000_100, 60_000, s);
    assert.strictEqual(s.moc.has(`${G}:cu:channel_delete`), false);
    assert.strictEqual(s.moc.has(`${G}:moi:channel_delete`), true);
});

test('cấu hình: mọi luật đều có đủ trường và mức xử lý hợp lệ', () => {
    const hopLe = new Set(['strip', 'kick', 'ban']);
    for (const [ten, luat] of Object.entries(ANTINUKE.RULES)) {
        assert.ok(luat.limit >= 1, `${ten}: limit phải >= 1`);
        assert.ok(luat.windowMs > 0, `${ten}: windowMs phải > 0`);
        assert.ok(hopLe.has(luat.verdict), `${ten}: verdict lạ "${luat.verdict}"`);
    }
});

test('cấu hình: mọi hành vi trong luật đều có bản dịch vi + en', () => {
    const vi = require('../src/locales/vi.json');
    const en = require('../src/locales/en.json');
    for (const ten of Object.keys(ANTINUKE.RULES)) {
        assert.ok(vi.antinuke.action[ten], `thiếu bản dịch vi cho ${ten}`);
        assert.ok(en.antinuke.action[ten], `thiếu bản dịch en cho ${ten}`);
    }
    for (const v of ['log', 'strip', 'kick', 'ban']) {
        assert.ok(vi.antinuke.verdict[v] && en.antinuke.verdict[v], `thiếu bản dịch mức xử lý ${v}`);
    }
});

test('cấu hình: mọi quyền nguy hiểm đều là tên quyền CÓ THẬT của discord.js', () => {
    for (const ten of ANTINUKE.DANGEROUS_PERMS) {
        assert.ok(PermissionFlagsBits[ten] !== undefined, `quyền không tồn tại: ${ten}`);
    }
});

test('khôi phục cấu hình server: chỉ nhận trường thật sự đảo ngược được', () => {
    // icon/vanity/owner CỐ Ý không có mặt — audit log không giữ bytes ảnh, và bot
    // không có cửa can thiệp việc chuyển quyền sở hữu.
    assert.ok(TRUONG_KHOI_PHUC.name && TRUONG_KHOI_PHUC.verification_level);
    for (const cam of ['icon_hash', 'vanity_url_code', 'owner_id', 'banner_hash']) {
        assert.strictEqual(TRUONG_KHOI_PHUC[cam], undefined, `${cam} không được nằm trong danh sách khôi phục`);
    }
});

test('trần whitelist trong config PHẢI khớp hằng số trong migration 0119', () => {
    // Cùng một con số nằm ở hai nơi (JS không đọc được SQL). Không có test này thì việc
    // nới trần ở config sẽ im lặng vô hiệu — RPC vẫn chặn ở 50 và người dùng thấy thông
    // báo "tối đa 80" trong khi bị từ chối ở 50. Đúng lớp lỗi của luật "MỘT con số =
    // MỘT nguồn" (AGENTS.md §2.10).
    const fs = require('node:fs');
    const sql = fs.readFileSync('supabase/migrations/0119_antinuke.sql', 'utf8');
    const m = sql.match(/IF\s+v_count\s*>=\s*(\d+)\s+THEN/i);
    assert.ok(m, 'không tìm thấy chỗ chặn trần whitelist trong migration');
    assert.strictEqual(Number(m[1]), ANTINUKE.WHITELIST_MAX);
});
