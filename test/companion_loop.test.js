// test/companion_loop.test.js — Gác VÒNG LẶP BẠN ĐỒNG HÀNH.
//
// VÌ SAO CÓ: thang 5 bậc thiện cảm thật sự đổi giọng Waguri, và cô ấy ghi nhớ tới 25 điều về
// người chơi — nhưng cả hai từng HOÀN TOÀN VÔ HÌNH với người dùng. `incrAffection` được gọi
// rồi vứt giá trị trả về, `/profile` không hề nhắc tới quan hệ hay ký ức. Đo 2026-08-18:
// 20 người có thiện cảm > 0, cao nhất 30, một nửa thử một hai lần rồi thôi. Vòng lặp vô hình
// thì không ai có lý do quay lại — đó là lỗi sản phẩm, không phải lỗi chất lượng nhân vật.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { AFFECTION_TIERS, tierOf } = require('../src/lib/ai/persona');
const vi = require('../src/locales/vi.json');
const en = require('../src/locales/en.json');
const { chuaTu } = require('../scripts/lib/viWord');

test('bậc thiện cảm: mốc phải LEO ĐƯỢC (bậc đầu tới sớm)', () => {
    const bacHai = [...AFFECTION_TIERS].reverse()[1];
    assert.ok(bacHai.min <= 10,
        `Mốc lên bậc đầu tiên là ${bacHai.min} — quá xa. Người dùng chat ~6 lượt/phiên, ` +
        'mốc cao thì phần lớn KHÔNG BAO GIỜ trải qua một lần lên bậc nào (điểm cao nhất ' +
        'toàn server từ trước tới nay chỉ là 30).');
    // Mốc cao nhất vẫn phải đủ xa để có ý nghĩa
    assert.ok(AFFECTION_TIERS[0].min >= 100, 'Bậc cao nhất quá gần thì mất ý nghĩa');
});

test('bậc thiện cảm: mọi bậc có `key` ổn định và có chuỗi lên bậc (trừ bậc đầu)', () => {
    for (const b of AFFECTION_TIERS) {
        assert.ok(b.key && /^[a-z_]+$/.test(b.key), `Bậc ${b.name} thiếu key hợp lệ`);
    }
    // Bậc thấp nhất là điểm khởi đầu, không có "lên bậc" tới nó.
    const canChuoi = AFFECTION_TIERS.filter(b => b.min > 0);
    for (const b of canChuoi) {
        for (const [ten, loc] of [['vi', vi], ['en', en]]) {
            const s = loc.lib?.ai?.tier_up?.[b.key];
            assert.ok(s && s.trim(), `${ten}.json thiếu lib.ai.tier_up.${b.key}`);
        }
    }
    for (const [ten, loc] of [['vi', vi], ['en', en]]) {
        assert.ok(loc.lib?.ai?.tier_up?.marker, `${ten}.json thiếu lib.ai.tier_up.marker`);
    }
});

test('lên bậc: chuỗi tiếng Việt giữ xưng hô "mình" và không dùng "tớ"/"tôi"', () => {
    for (const [k, s] of Object.entries(vi.lib.ai.tier_up)) {
        if (k === 'marker') continue;
        // Dùng chuaTu chứ KHÔNG dùng `\b`: chính test này từng báo nhầm chữ "tới" trong
        // "mong tới lúc", đồng thời sẽ bỏ lọt "tớ" thật. Xem scripts/lib/viWord.js.
        assert.ok(!chuaTu(s, ['tớ', 'tôi']),
            `lib.ai.tier_up.${k} sai xưng hô canon: ${s}`);
    }
});

test('chat: phát hiện lên bậc bằng cách SO BẬC, không phải mỗi lượt', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'ai', 'index.js'), 'utf8');
    assert.ok(/await\s+db\.incrAffection/.test(src),
        'Phải await incrAffection để đọc được tổng mới — bản cũ gọi rồi vứt giá trị trả về');
    assert.ok(/bacSau\.min\s*>\s*t\.min/.test(src),
        'Phải so bậc trước/sau; nếu không sẽ báo "lên bậc" ở MỌI lượt chat');
    assert.ok(/lib\.ai\.tier_up\./.test(src), 'Phải dùng chuỗi locale, không viết cứng');
});

test('riêng tư: /profile chỉ hiện ký ức Waguri cho CHÍNH CHỦ', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'economy', 'profile.js'), 'utf8');
    const iSelf = src.indexOf('const isSelf =');
    const iMem = src.indexOf('ai_memory');
    assert.ok(iSelf !== -1 && iMem !== -1, 'Không tìm thấy isSelf hoặc ai_memory trong profile.js');
    assert.ok(iSelf < iMem, 'isSelf phải được tính TRƯỚC khi đụng tới ai_memory');

    // Khối ký ức phải nằm trong nhánh isSelf. Lấy đoạn từ `if (isSelf)` tới hết khối.
    const iGuard = src.indexOf('if (isSelf) {');
    assert.ok(iGuard !== -1 && iGuard < iMem,
        '`ai_memory` KHÔNG nằm trong nhánh `if (isSelf)` — xem hồ sơ người khác sẽ lộ ký ức riêng của họ');
});

test('tierOf trả đúng bậc theo mốc mới', () => {
    assert.strictEqual(tierOf(0).key, 'nguoi_moi');
    assert.strictEqual(tierOf(4).key, 'nguoi_moi');
    assert.strictEqual(tierOf(5).key, 'quen_biet');
    assert.strictEqual(tierOf(9999).key, 'tri_ky');
});
