// ============================================================
// test/kenh_thong_bao.test.js — /announcement phải chọn đúng kênh, và phải NHẮC khi
// nó không gửi được vào chỗ admin muốn.
//
// VÌ SAO CÓ: đo ngày 22-08-2026 thấy chỉ 4 trên 19 server đặt `announcement_channel`.
// Đọc kỹ vòng gửi thì có hai lỗ IM LẶNG — server dính thì không nhận gì mà cũng không
// ai biết vì sao:
//
//   1. Kênh đã đặt nhưng BỊ XOÁ      -> không lui về systemChannel, chỉ tăng failCount.
//   2. Kênh còn đó, bot MẤT QUYỀN GỬI -> send() ném lỗi, rơi vào catch ngoài, cũng chỉ
//      tăng failCount. Chỗ này còn tệ hơn: mã cũ không hề kiểm quyền trước khi gửi.
//
// Kiểu hỏng này không bao giờ tự lộ ra: người vận hành chỉ thấy con số "gửi N thất bại M"
// mà không biết M là những server nào hay vì sao.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { PermissionFlagsBits } = require('discord.js');

const { chonKenhThongBao } = require('../src/lib/kenhThongBao');

const HONG = 'commands.announcement.nhac_kenh_hong';
const CHUA_DAT = 'commands.announcement.nhac_kenh';

/** Dựng guild giả. `guiDuocO` là tập id kênh mà bot có quyền gửi. */
function guildGia({ kenhDat = null, systemId = 'sys', guiDuocO = [], coMe = true } = {}) {
    const kenh = id => ({ id, toString: () => `#${id}` });
    return {
        systemChannel: systemId ? kenh(systemId) : null,
        members: coMe
            ? { me: { permissionsIn: ch => ({ has: p => p === PermissionFlagsBits.SendMessages && guiDuocO.includes(ch.id) }) } }
            : {},
        channels: {
            fetch: async id => {
                if (kenhDat === null || id !== kenhDat) throw new Error('Unknown Channel');
                return kenh(id);
            }
        }
    };
}

test('kênh đã đặt và gửi được -> dùng đúng kênh đó, KHÔNG nhắc gì', async () => {
    const g = guildGia({ kenhDat: 'tin', guiDuocO: ['tin', 'sys'] });
    const r = await chonKenhThongBao(g, { announcement_channel: 'tin' });
    assert.strictEqual(r.channel.id, 'tin');
    assert.strictEqual(r.nhac, null, 'Server đã cấu hình đúng mà vẫn bị nhắc là phiền người ta.');
});

test('kênh đã đặt nhưng BỊ XOÁ -> lui về systemChannel và nhắc là kênh hỏng', async () => {
    const g = guildGia({ kenhDat: null, guiDuocO: ['sys'] });
    const r = await chonKenhThongBao(g, { announcement_channel: 'da-xoa' });
    assert.strictEqual(r.channel.id, 'sys', 'Kênh bị xoá thì phải lui, không được im lặng bỏ qua.');
    assert.strictEqual(r.nhac, HONG);
});

test('kênh đã đặt nhưng bot MẤT QUYỀN GỬI -> lui về systemChannel và nhắc là kênh hỏng', async () => {
    // Kênh vẫn fetch được, chỉ là không gửi nổi. Mã cũ không kiểm quyền nên sẽ ném lỗi ở send().
    const g = guildGia({ kenhDat: 'tin', guiDuocO: ['sys'] });
    const r = await chonKenhThongBao(g, { announcement_channel: 'tin' });
    assert.strictEqual(r.channel.id, 'sys', 'Mất quyền ở kênh đã đặt cũng phải lui như khi kênh bị xoá.');
    assert.strictEqual(r.nhac, HONG);
});

test('chưa đặt kênh -> lui về systemChannel và nhắc đi đặt', async () => {
    const g = guildGia({ guiDuocO: ['sys'] });
    const r = await chonKenhThongBao(g, {});
    assert.strictEqual(r.channel.id, 'sys');
    assert.strictEqual(r.nhac, CHUA_DAT);
});

test('chưa đặt và không có systemChannel -> không gửi đâu cả', async () => {
    const g = guildGia({ systemId: null });
    const r = await chonKenhThongBao(g, {});
    assert.strictEqual(r.channel, null);
});

test('kênh đặt hỏng và systemChannel cũng không gửi được -> không gửi đâu cả', async () => {
    const g = guildGia({ kenhDat: null, guiDuocO: [] }); // có systemChannel nhưng thiếu quyền
    const r = await chonKenhThongBao(g, { announcement_channel: 'da-xoa' });
    assert.strictEqual(r.channel, null, 'Không được gửi vào kênh mà bot không có quyền.');
});

test('guild chưa cache thành viên bot -> không nổ, chỉ là không gửi', async () => {
    const g = guildGia({ coMe: false, guiDuocO: ['sys'] });
    const r = await chonKenhThongBao(g, {});
    assert.strictEqual(r.channel, null);
});

test('hai khoá nhắc đều có bản dịch vi lẫn en', () => {
    const { t } = require('../src/lib/i18n');
    for (const khoa of [HONG, CHUA_DAT]) {
        for (const ngu of ['vi', 'en']) {
            const s = t(ngu, khoa);
            assert.ok(s && s !== khoa, `Thiếu bản dịch ${ngu} cho ${khoa}`);
            assert.ok(s.includes('/config announcement-channel'),
                `${ngu}/${khoa} phải chỉ rõ lệnh cần chạy, nhắc chung chung thì admin không biết làm gì.`);
        }
    }
});
