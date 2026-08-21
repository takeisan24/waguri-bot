// Trung tâm ủng hộ /premium — dựng THẬT embed + hàng nút rồi ép discord.js xác thực.
//
// VÌ SAO TEST NÀY TỒN TẠI: `db0fdd5` ghi lại một sự cố prod đúng lớp này — `/pass` ném
// `RangeError: Premium buttons must have an SKU id` ngay tại `editReply`, tức lệnh hỏng
// 100% với mọi người chưa Premium. Lint không bắt, unit test logic cũng không bắt: lỗi chỉ
// lộ ra khi discord.js xác thực payload. Nên ở đây gọi thẳng `.toJSON()` — đó chính là bước
// xác thực mà thư viện chạy trước khi gửi lên Discord.
//
// Các trần của Discord mà màn hình này dễ vượt nhất: field value 1024 ký tự, label nút 80,
// customId 100, tối đa 5 nút/hàng và 5 hàng/tin nhắn.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

process.env.VCB_ACCOUNT = process.env.VCB_ACCOUNT || '0123456789';
process.env.VCB_BANK = process.env.VCB_BANK || 'VCB';
process.env.VCB_HOLDER = process.env.VCB_HOLDER || 'NGUYEN VAN A';

// Chặn `require('../database.js')` bằng bản giả -> test không chạm DB thật.
const NGUOI = { user_id: '1', wallet: 0, premium_until: null, ai_used: 3, ai_used_date: new Date().toISOString().slice(0, 10) };
let supportersGia = [];
const dbGia = {
    getUser: async () => NGUOI,
    getSupporters: async () => supportersGia,
    createDonationOrder: async () => ({ code: 'WAGURI1A2B3C4D', amount: 0, kind: 'donate' }),
    createPremiumOrder: async (_u, plan, months, amount) => ({ code: 'WAGURI9F8E7D6C', amount, months, plan, kind: 'premium' }),
};
const loadGoc = Module._load;
Module._load = function (yeuCau, cha, laChinh) {
    if (/database(\.js)?$/.test(yeuCau)) return dbGia;
    return loadGoc.apply(this, [yeuCau, cha, laChinh]);
};

const premium = require('../src/commands/utility/premium.js');
const { buildQrScreen } = require('../src/lib/payButtons.js');
Module._load = loadGoc;

const interactionGia = {
    user: { id: '1', username: 'tester' },
    client: { user: { id: 'bot', displayAvatarURL: () => 'https://x/y.png' }, users: { fetch: async id => ({ username: 'ngdung' + id }) } },
    locale: 'vi',
};

/** Ép discord.js xác thực y như lúc gửi thật; trả về payload đã serialise để soi tiếp. */
function xacThuc(payload) {
    const embeds = payload.embeds.map(e => e.toJSON());
    const components = (payload.components || []).map(r => r.toJSON());
    return { embeds, components };
}

describe('/premium — trung tâm ủng hộ', () => {
    for (const locale of ['vi', 'en']) {
        test(`hub dựng & xác thực được (${locale}), chưa có người ủng hộ`, async () => {
            supportersGia = [];
            const out = xacThuc(await premium.buildHub(interactionGia, locale));
            assert.ok(out.embeds[0].title, 'embed phải có tiêu đề');
            // Hai lối phải cùng xuất hiện — đó là toàn bộ ý nghĩa của việc gộp một màn hình.
            const fields = out.embeds[0].fields.map(f => f.name).join(' ');
            assert.match(fields, /💝|☕/, 'thiếu lối ủng hộ tuỳ tâm');
            assert.match(fields, /💎/, 'thiếu lối Premium');
            for (const f of out.embeds[0].fields) {
                assert.ok(f.value.length <= 1024, `field "${f.name}" dài ${f.value.length} > trần 1024 của Discord`);
                assert.ok(f.value.trim().length > 0, `field "${f.name}" rỗng -> Discord từ chối`);
            }
            // 1 nút ủng hộ + 3 nút gói, chia 2 hàng.
            assert.strictEqual(out.components.length, 2);
            const nut = out.components.flatMap(r => r.components);
            assert.strictEqual(nut.length, 4);
            for (const b of nut) {
                assert.ok(b.label.length <= 80, `label nút quá dài: ${b.label}`);
                assert.ok(b.custom_id && b.custom_id.length <= 100, `custom_id hỏng: ${b.custom_id}`);
                // Bẫy của sự cố cũ: style 6 (Premium) bắt buộc có sku_id, không nhận custom_id.
                assert.notStrictEqual(b.style, 6, 'KHÔNG được dùng ButtonStyle.Premium — nó cần sku_id');
            }
        });

        test(`hub hiện bảng vinh danh khi đã có người ủng hộ (${locale})`, async () => {
            supportersGia = Array.from({ length: 10 }, (_, i) => ({ user_id: String(i), total: (10 - i) * 10000 }));
            const out = xacThuc(await premium.buildHub(interactionGia, locale));
            const bang = out.embeds[0].fields.find(f => /🌸/.test(f.name));
            assert.ok(bang, 'thiếu bảng vinh danh người ủng hộ');
            assert.ok(bang.value.length <= 1024, `bảng vinh danh ${bang.value.length} > 1024`);
        });

        test(`màn QR ủng hộ tuỳ tâm dựng & xác thực được (${locale})`, () => {
            const donHang = { code: 'WAGURI1A2B3C4D', amount: 0 };
            const out = xacThuc(buildQrScreen(interactionGia, locale, donHang, true));
            const e = out.embeds[0];
            assert.match(e.image.url, /^https:\/\/img\.vietqr\.io\//, 'ảnh QR phải là VietQR');
            // Ủng hộ tuỳ tâm -> QR KHÔNG được ghim số tiền.
            assert.ok(!/[?&]amount=/.test(e.image.url), 'QR ủng hộ không được ghim số tiền');
            // Mã đơn phải xuất hiện: mất nó là owner không biết tiền của ai.
            assert.ok(JSON.stringify(e).includes(donHang.code), 'màn QR thiếu mã đơn');
            for (const f of e.fields) assert.ok(f.value.trim().length > 0 && f.value.length <= 1024);
            assert.strictEqual(out.components[0].components[0].custom_id, `pay:claim:${donHang.code}`);
        });

        test(`màn QR mua Premium GHIM đúng số tiền (${locale})`, () => {
            const donHang = { code: 'WAGURI9F8E7D6C', amount: 25000 };
            const out = xacThuc(buildQrScreen(interactionGia, locale, donHang, false));
            assert.match(out.embeds[0].image.url, /[?&]amount=25000(&|$)/, 'QR Premium phải ghim đúng 25000');
        });
    }
});
