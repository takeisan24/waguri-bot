// test/persona_canon.test.js — Gác NHÂN VẬT Waguri theo nguyên tác.
//
// VÌ SAO CÓ: persona từng mô tả Kaoruko là "tiểu thư dịu dàng". Nguyên tác thì cô ấy vào
// Kikyo bằng HỌC BỔNG và đứng đầu bảng thành tích — trường chỉ nhận nữ sinh nhà khá giả,
// cô ấy vào bằng cửa còn lại. Sai chi tiết đó là sai luôn logic nội tâm nhân vật: việc cô
// ấy không coi thường Chidori không phải lòng tốt của kẻ bề trên, mà vì chính cô ấy cũng là
// người ngoài ở nơi mình học.
//
// Kèm theo: hai người bạn từng bị sai họ, và hai mục lore nằm chết trong JSON vì không có
// nhánh từ khoá nào đọc tới. Những lỗi này không làm rơi test nào, không làm lỗi runtime —
// chỉ âm thầm làm nhân vật sai. Nên phải có gate riêng.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { WAGURI_SYSTEM_PROMPT, AFFECTION_TIERS, tierOf, CAMEO_PROFILES } = require('../src/lib/ai/persona');
const lore = require('../src/data/manga_lore.json');
const { chuaTu } = require('../scripts/lib/viWord');

test('persona: xưng hô "mình – cậu", không có "tớ"/"tôi" trong ví dụ giọng', () => {
    assert.ok(/xưng \*\*"mình"\*\*/.test(WAGURI_SYSTEM_PROMPT) || /Xưng \*\*"mình"\*\*/.test(WAGURI_SYSTEM_PROMPT),
        'Prompt phải quy định rõ xưng "mình"');

    // Bắt "tớ"/"tôi" đứng như một ĐẠI TỪ trong các dòng ví dụ giọng (dòng bắt đầu bằng - ").
    const viDu = WAGURI_SYSTEM_PROMPT.split('\n').filter(d => /^- "/.test(d.trim()));
    assert.ok(viDu.length >= 5, `Cần ít nhất 5 ví dụ thoại để neo giọng (đang có ${viDu.length})`);
    for (const d of viDu) {
        // KHÔNG dùng `\b`: với tiếng Việt nó sai cả hai chiều (bỏ lọt "tớ đi", báo nhầm
        // "tới lúc"). Xem scripts/lib/viWord.js — đo được 5/6 trường hợp sai.
        assert.ok(!chuaTu(d, ['tớ']), `Ví dụ giọng dùng "tớ" — sai xưng hô canon: ${d}`);
        assert.ok(!chuaTu(d, ['tôi']), `Ví dụ giọng dùng "tôi" — sai xưng hô canon: ${d}`);
    }
    // Phải có ví dụ dùng "mình"
    assert.ok(viDu.some(d => /\bmình\b/i.test(d)), 'Không ví dụ nào dùng "mình"');
});

test('persona: đúng gốc nhân vật (học bổng, đứng đầu) — KHÔNG phải tiểu thư', () => {
    assert.ok(/học bổng/i.test(WAGURI_SYSTEM_PROMPT),
        'Thiếu chi tiết cốt lõi: Kaoruko vào Kikyo bằng học bổng');
    assert.ok(!/tiểu thư/i.test(WAGURI_SYSTEM_PROMPT),
        'Prompt vẫn gọi cô ấy là "tiểu thư" — sai nguyên tác, xem header persona.js');
});

test('persona: tên bạn bè đúng nguyên tác', () => {
    const DUNG = ['Natsusawa Saku', 'Yoda Ayato', 'Usami Shohei', 'Hoshina Subaru', 'Tsumugi Rintaro'];
    for (const ten of DUNG) {
        assert.ok(WAGURI_SYSTEM_PROMPT.includes(ten), `Prompt thiếu tên đúng: ${ten}`);
    }
    const SAI = ['Saku Natsui', 'Ayato Madoka'];
    for (const ten of SAI) {
        assert.ok(!WAGURI_SYSTEM_PROMPT.includes(ten), `Prompt còn tên SAI nguyên tác: ${ten}`);
        for (const [k, v] of Object.entries(CAMEO_PROFILES)) {
            assert.notStrictEqual(v.name, ten, `CAMEO_PROFILES.${k} còn tên SAI: ${ten}`);
        }
    }
});

test('persona: AFFECTION_TIERS giữ nguyên hình dạng cho dating.js / couple.js', () => {
    assert.strictEqual(AFFECTION_TIERS.length, 5);
    for (const t of AFFECTION_TIERS) {
        assert.strictEqual(typeof t.min, 'number');
        assert.ok(t.name && typeof t.name === 'string');
        assert.ok(t.guide && typeof t.guide === 'string');
    }
    // Phải giảm dần theo min để `find(t => aff >= t.min)` trả đúng bậc cao nhất đạt được.
    for (let i = 1; i < AFFECTION_TIERS.length; i++) {
        assert.ok(AFFECTION_TIERS[i - 1].min > AFFECTION_TIERS[i].min, 'AFFECTION_TIERS phải giảm dần theo min');
    }
    // Không ghim con số mốc ở đây — mốc là tham số cân bằng, đã đổi 2026-08-18 (0/15/50/120/300
    // -> 0/5/25/80/200) vì chưa ai từng vượt quá bậc 2. Chỉ khẳng định HÀNH VI của tierOf.
    const thap = AFFECTION_TIERS[AFFECTION_TIERS.length - 1];
    const bacHai = AFFECTION_TIERS[AFFECTION_TIERS.length - 2];
    assert.strictEqual(tierOf(0).min, thap.min);
    assert.strictEqual(tierOf(bacHai.min - 1).min, thap.min, 'Ngay dưới mốc phải còn ở bậc thấp hơn');
    assert.strictEqual(tierOf(bacHai.min).min, bacHai.min, 'Đúng mốc phải lên bậc');
    assert.strictEqual(tierOf(Number.MAX_SAFE_INTEGER).min, AFFECTION_TIERS[0].min);
});

test('lore: mọi khoá đều có nhánh từ khoá đọc tới (không có mục chết)', () => {
    const nguon = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'ai', 'index.js'), 'utf8');
    const ham = nguon.slice(nguon.indexOf('function findMatchingLore'), nguon.indexOf('const contexts'));

    const khoa = Object.keys(lore).filter(k => !k.startsWith('_'));
    const chet = khoa.filter(k => !ham.includes(`mangaLore.${k}`));

    assert.deepStrictEqual(chet, [],
        `\n❌ ${chet.length} mục lore KHÔNG BAO GIỜ được dùng (thiếu nhánh trong findMatchingLore):\n` +
        chet.map(k => '   • ' + k).join('\n') +
        '\n   Thêm khoá vào manga_lore.json thì phải thêm nhánh từ khoá tương ứng.\n');
});

test('lore: có chủ đề trung tâm Kikyo/Chidori', () => {
    const j = JSON.stringify(lore);
    assert.ok(/Chidori/i.test(j) && /Kikyo/i.test(j),
        'Lore thiếu chủ đề trung tâm của truyện (định kiến giữa hai trường)');
    assert.ok(/học bổng/i.test(j),
        'Lore thiếu chi tiết Kaoruko vào Kikyo bằng học bổng');
});
