// ============================================================
// test/pass_qua_co_that.test.js — Sổ Sứ Mệnh chỉ được hứa những món CÓ THẬT, và gọi chúng
// bằng TÊN người đọc hiểu.
//
// Cổng KINH TẾ #4 đã canh "mọi item CHỢ phải tồn tại trong catalog". Sổ Sứ Mệnh phát vật
// phẩm y hệt như vậy nhưng chưa có cổng nào — và đúng chỗ hở đó có hai món ma.
//
// HAI LỖI TÌM RA NGÀY 2026-08-24:
//
//   (1) Màn hình XEM TRƯỚC hiện MÃ NỘI BỘ. `formatRewardDetails` truyền thẳng `id` vào ô
//       tên, trong khi màn hình NHẬN QUÀ tra qua `db.getItem` rồi hiện tên thật. Cùng một
//       món, hai cái tên. Đo trên vùng level 1–5 (nơi cả 33 người đang chơi nhìn thấy —
//       XP cao nhất prod là 2.178 = level 2): 5/10 ô quà hiện `banh_mi`, `bo_hoa`,
//       `thoi_sat`, `da`, `soda_gekka` thay vì "Bánh Mì Việt Nam", "Bó Hoa Tươi"…
//
//   (2) Hai món quà KHÔNG TỒN TẠI trong danh mục: `ve_vip` (mốc 15 premium) và
//       `ve_dai_gia` (mốc 19 premium). Bảng `inventory` KHÔNG có khoá ngoại, nên khi ai đó
//       chạm mốc, món ma sẽ ghi vào kho thật: không bán được, không dùng được, `db.getItem`
//       trả null. Hiện chưa ai chạm (0 người Premium, level cao nhất 2/20) nên là lỗi TIỀM
//       ẨN — nhưng lời hứa đã in trên màn hình.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// CỐ Ý dùng `scripts/db-catalog-ids.json` chứ không phải `helpers/sqlCatalog.js`.
// Bản kia replay danh mục từ file migration nhưng KHÔNG mô hình hoá được lệnh đổi mã của
// `0068_rename_item_ids.sql`, nên nó đứng ở trạng thái trước 0068 và lệch prod 7/90 món
// (nó tưởng `ve_vip` còn tồn tại và `soda_gekka` chưa có — ngược hẳn sự thật).
// File JSON này được cổng `db-catalog.js --check` đối chiếu với prod mỗi lần push.
const rewards = require('../src/data/battlepass_rewards');

// Hai món đang treo, CỐ Ý ghi ra đây thay vì giấu vào allowlist rời: việc tạo chúng là
// quyết định thiết kế (tên, loại, giá, công dụng) chứ không phải việc dọn dẹp, nên phải
// nhìn thấy được. Cổng vẫn chặn mọi món ma MỚI.
// Gỡ khỏi danh sách này ngay khi hai món được thêm vào danh mục.
const DANG_TREO = new Set(['ve_vip', 've_dai_gia']);

const DANH_MUC = new Set(require('../scripts/db-catalog-ids.json').items);

function moiMonQua() {
    const ra = [];
    for (const [lvl, q] of Object.entries(rewards.REWARDS)) {
        for (const [bac, d] of [['free', q.free], ['premium', q.premium]]) {
            if (!d || !d.items) continue;
            for (const [id, qty] of Object.entries(d.items)) ra.push({ lvl: Number(lvl), bac, id, qty });
        }
    }
    return ra;
}

test('không món quà MỚI nào nằm ngoài danh mục vật phẩm', () => {
    const ma = moiMonQua().filter(x => !DANH_MUC.has(x.id) && !DANG_TREO.has(x.id));
    assert.deepStrictEqual(ma.map(x => `Level ${x.lvl} ${x.bac} -> ${x.id}`), [],
        'Sổ Sứ Mệnh hứa món không có trong danh mục.\n'
        + '`inventory` KHÔNG có khoá ngoại nên món ma vẫn ghi vào kho được: người chơi nhận\n'
        + 'một thứ không bán được, không dùng được, và db.getItem trả null.\n'
        + 'Sửa: thêm vật phẩm vào catalog bằng migration, HOẶC đổi phần thưởng sang món có thật.');
});

test('hai món đang treo vẫn đúng là hai món đó — không âm thầm mọc thêm', () => {
    const conThieu = new Set(moiMonQua().filter(x => !DANH_MUC.has(x.id)).map(x => x.id));
    assert.deepStrictEqual([...conThieu].sort(), [...DANG_TREO].sort(),
        'Danh sách món ma đã đổi.\n'
        + 'Nếu vừa THÊM vật phẩm vào catalog: xoá nó khỏi DANG_TREO trong file này.\n'
        + 'Nếu vừa thêm món ma mới: đừng — thêm vật phẩm vào catalog trước.');
});

test('màn hình xem trước gọi vật phẩm bằng TÊN, không phải mã nội bộ', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'pass.js'), 'utf8');

    assert.ok(/function formatRewardDetails\([^)]*nameOf/.test(s),
        'formatRewardDetails phải nhận bộ tra tên. Truyền thẳng `id` vào ô tên nghĩa là màn\n'
        + 'hình xem trước hiện mã máy trong khi màn hình nhận quà hiện tên thật.');

    assert.ok(!/format_item',\s*\{\s*qty,\s*name:\s*id\s*\}/.test(s),
        'Còn chỗ truyền `name: id` vào format_item — đó chính là lỗi đang vá.');

    // File có HAI bản sao của khối dựng embed (`view` và `updateViewEmbed`); từng sửa một
    // bản mà quên bản kia, nên đếm để chắc cả hai đều được truyền bộ tra tên.
    const soLanTruyen = (s.match(/formatRewardDetails\([^)]*,\s*nameOf\s*\)/g) || []).length;
    assert.strictEqual(soLanTruyen, 4,
        `Chỉ ${soLanTruyen}/4 lời gọi formatRewardDetails được truyền nameOf. Hai khối dựng\n`
        + 'embed (view và updateViewEmbed) mỗi khối gọi 2 lần (free + premium) — thiếu chỗ nào\n'
        + 'thì chỗ đó vẫn hiện mã nội bộ.');

    const soLanDung = (s.match(/await layBoTraTen\(locale\)/g) || []).length;
    assert.strictEqual(soLanDung, 2,
        `Chỉ ${soLanDung}/2 khối dựng embed gọi layBoTraTen.`);
});

test('nhánh nút mua Premium không nổ khi DB trả null', () => {
    const s = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'economy', 'pass.js'), 'utf8');
    const i = s.indexOf("action === 'buy_confirm'");
    assert.ok(i > -1, 'Không thấy nhánh buy_confirm.');
    const khoi = s.slice(i, i + 700);
    assert.ok(/if\s*\(\s*!user\s*\)/.test(khoi),
        'buy_confirm đọc `user.wallet` mà không kiểm null. Nhánh `/pass buy` có chốt này,\n'
        + 'nhánh nút thì không — khi DB lỗi, người dùng nhận "ứng dụng không phản hồi"\n'
        + 'thay vì một lời báo lỗi tử tế.');
});
