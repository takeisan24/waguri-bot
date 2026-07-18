// CI guard i18n — chặn raw-key leak (key t() thiếu trong locale) tái diễn.
//
// Cơ chế RATCHET (bánh cóc):
//   - `test/i18n-known-missing.json` = danh sách leak ĐANG CÓ (nợ i18n hiện tại).
//   - Test FAIL nếu có leak MỚI không nằm trong baseline  -> chặn regression ngay.
//   - Test FAIL nếu baseline còn mục đã được SỬA         -> ép xoá khỏi baseline khi vá,
//     nên danh sách chỉ co lại, không phình. Khi rỗng = i18n phủ 100% (ở tầng key này).
//
// Khi VÁ một leak: thêm key vào src/locales/{vi,en}.json RỒI xoá mục tương ứng khỏi
// test/i18n-known-missing.json trong CÙNG commit. Regen nhanh:
//   node -e "require('fs').writeFileSync('test/i18n-known-missing.json', JSON.stringify(require('./test/helpers/i18nScan').scanMissing(),null,2)+'\n')"
//
// Phạm vi: mọi key t() có root != data/items (2 root này CỐ TÌNH trả undefined -> call-site
// fallback tên DB, không leak). Key tĩnh phải có ở CẢ vi+en; key động thì namespace prefix
// phải tồn tại. (Phủ tầng value của key động có-children là bước sau — xem README repo.)
const { test } = require('node:test');
const assert = require('node:assert');
const { scanMissing } = require('./helpers/i18nScan');
const baseline = require('./i18n-known-missing.json');

test('i18n: không có raw-key leak MỚI (ngoài baseline)', () => {
    const current = new Set(scanMissing());
    const known = new Set(baseline);

    const newLeaks = [...current].filter(k => !known.has(k)).sort();
    const fixed = [...known].filter(k => !current.has(k)).sort();

    const msgs = [];
    if (newLeaks.length) {
        msgs.push(
            `\n❌ ${newLeaks.length} raw-key i18n MỚI (key t() thiếu ở vi/en, root != data/items):\n` +
            newLeaks.map(k => '   + ' + k).join('\n') +
            `\n→ Thêm key vào src/locales/{vi,en}.json (dạng "x.*" nghĩa là cả namespace 'x' đang trống).`
        );
    }
    if (fixed.length) {
        msgs.push(
            `\n✅ ${fixed.length} mục trong baseline đã được SỬA — hãy XOÁ khỏi test/i18n-known-missing.json:\n` +
            fixed.map(k => '   - ' + k).join('\n')
        );
    }
    assert.ok(msgs.length === 0, msgs.join('\n') + '\n');
});
