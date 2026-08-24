// ============================================================
// test/sqlcatalog_khop_prod.test.js — Neo danh mục DỰNG TỪ MIGRATION vào danh mục THẬT.
//
// VÌ SAO CÓ (24-08): `test/helpers/sqlCatalog.js` replay migration bằng regex để dựng lại
// bảng `items` mà không cần DB. Bốn cổng kinh tế trong `test/economy.invariants.test.js`
// ăn danh mục đó. Nhưng parser không đọc khối `DO $$`, nên nó ĐỨNG YÊN Ở TRẠNG THÁI TRƯỚC
// `0068_rename_item_ids.sql` suốt nhiều tháng — lệch prod 7/90 món:
//
//     ve_vip -> banh_kem_dau · ve_dai_gia -> banh_cheesecake · bh_duong_pho -> bh_hoc_duong
//     xe_sh  -> xe_vespa     · nuoc_tang_luc -> soda_gekka   · bo_do_sua_xe -> bo_lam_banh
//     may_quay -> may_anh
//
// VÌ SAO KHÔNG CỔNG NÀO THẤY: cả hai bên vẫn đếm ra ĐÚNG 90 món. Drift kiểu ĐỔI TÊN thì
// mọi phép đếm số lượng đều mù. Và cổng kinh tế #2 dùng `if (!item) continue`, nên món
// thiếu bị BỎ QUA IM LẶNG chứ không báo đỏ — cổng vẫn xanh trong khi đã thôi kiểm thứ nó
// sinh ra để kiểm.
//
// HÔM ẤY CHƯA AI BỊ HẠI: 12 món chợ không món nào nằm trong 7 mã lệch. Nhưng đó là may,
// không phải thiết kế. Cổng này biến cái may đó thành bảo đảm.
//
// VÌ SAO NEO VÀO `scripts/db-catalog-ids.json` MÀ KHÔNG PHẢI VIẾT PARSER SQL TỔNG QUÁT:
// tệp đó do `scripts/db-catalog.js` sinh THẲNG TỪ PROD và có cổng `db-catalog.js --check`
// đối chiếu lại mỗi lần push. Dạy parser đọc `DO $$` chỉ vá được đúng lối viết hôm nay;
// lần sau ai viết khác là hụt tiếp, và lại hụt IM LẶNG. Cổng này bắt MỌI kiểu drift, kể
// cả kiểu mà cả hai bên đều đếm ra 90.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const { buildCatalog } = require('./helpers/sqlCatalog.js');
const prodCatalog = require('../scripts/db-catalog-ids.json');

const { items, marketSeed } = buildCatalog();
const dungTuMigration = new Set(items.keys());
const thatSuTrongProd = new Set(prodCatalog.items);

test('danh mục dựng từ migration phải KHỚP TỪNG MÃ với danh mục prod', () => {
    const thua = [...dungTuMigration].filter(id => !thatSuTrongProd.has(id)).sort();
    const thieu = [...thatSuTrongProd].filter(id => !dungTuMigration.has(id)).sort();

    // Báo cả hai chiều trong MỘT lần chạy: drift đổi tên luôn đi theo cặp, thấy một nửa
    // rồi sửa mù sẽ đẻ ra vòng thử-sai.
    assert.deepStrictEqual(
        { thua, thieu }, { thua: [], thieu: [] },
        '\n❌ DANH MỤC TEST ĐÃ LỆCH PROD.\n\n' +
        `   Test tưởng còn sống, prod KHÔNG có (${thua.length}): ${thua.join(', ') || '(không)'}\n` +
        `   Prod CÓ, test không biết      (${thieu.length}): ${thieu.join(', ') || '(không)'}\n\n` +
        'Số lượng hai bên có thể vẫn BẰNG NHAU — đổi tên thì phép đếm mù. Đọc theo CẶP.\n\n' +
        'Nguyên nhân hay gặp, theo thứ tự nên kiểm:\n' +
        '  1. Migration mới đổi tên id bằng lối viết mà `applyRenames()` chưa nhận ra.\n' +
        '     `test/helpers/sqlCatalog.js` neo vào alias `AS m(oldid, newid)` — viết khác là hụt.\n' +
        '  2. Migration mới thêm/xoá item bằng khối `DO $$` (parser không đọc được khối này).\n' +
        '  3. Ai đó sửa DB tay mà không qua migration -> chạy `npm run db:catalog` rồi commit.\n\n' +
        'ĐỪNG chữa bằng cách sửa `db-catalog-ids.json` cho khớp test — tệp đó là bản chụp PROD,\n' +
        'nó đúng còn parser sai. Sửa `applyRenames()` (hoặc parser) cho đọc được migration mới.\n'
    );
});

test('mọi món chợ phải nằm trong danh mục — nếu không, cổng kinh tế bỏ qua im lặng', () => {
    // `economy.invariants` #2 dùng `if (!item) continue` để nhường việc cho #4. Nếu một món
    // chợ rơi khỏi danh mục vì drift, nó thoát KHỎI CẢ HAI: #2 bỏ qua, còn #4 chỉ soi món
    // có trong seed. Chốt ở đây để khoảng hở đó không mở ra được.
    const mocoi = [...marketSeed].filter(id => !dungTuMigration.has(id)).sort();
    assert.deepStrictEqual(mocoi, [],
        '\n❌ Món chợ không có trong danh mục items: ' + mocoi.join(', ') +
        '\n   Cổng kinh tế sẽ IM LẶNG bỏ qua các món này thay vì báo đỏ.\n');
});

test('bản chụp prod phải còn dùng được (không rỗng, không mất khoá)', () => {
    // Nếu `db-catalog-ids.json` hỏng hoặc rỗng, hai test trên sẽ "xanh" một cách vô nghĩa
    // (tập rỗng khớp tập rỗng). Chốt cái neo trước khi tin vào nó.
    assert.ok(Array.isArray(prodCatalog.items), 'db-catalog-ids.json phải có mảng `items`');
    assert.ok(prodCatalog.items.length > 50,
        `Bản chụp prod chỉ còn ${prodCatalog.items.length} món — nghi hỏng. Chạy lại npm run db:catalog.`);
    assert.ok(dungTuMigration.size > 50,
        `Danh mục dựng từ migration chỉ có ${dungTuMigration.size} món — nghi parser vỡ, không phải drift.`);
});
