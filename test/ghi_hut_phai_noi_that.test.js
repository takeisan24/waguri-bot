// ============================================================
// test/ghi_hut_phai_noi_that.test.js — ghi vào DB rồi phải ĐỌC kết quả trước khi khoe.
//
// VÌ SAO CÓ: lớp lỗi đông nhất của repo này không phải sai logic, mà là "làm một việc, không
// kiểm kết quả, rồi báo thành công". Nó đã bị vá từng chỗ nhiều lần (`/config` ở `e138e6b`,
// nhánh tiền của heo/cây ở `5a6edf8`, nhánh vật phẩm ở `1f21606`, bề mặt cày cuốc ở
// `f682637`) — mỗi lần vá một chỗ thì nó mọc lại ở chỗ khác, vì chưa ai gác CẢ LỚP.
//
// Cổng này gác phần còn lại: các hàm ghi CÓ GIÁ TRỊ ngoài `giveItemAdmin` (đã có cổng riêng
// ở `cay_cuoc_khong_khoe_hao.test.js`), cộng hai ca vừa vá 23/10 mà máy quét tổng quát bắt
// được — `/pet feed` và `/announcement`.
//
// PHÉP ĐO PHẢI TỔNG QUÁT, KHÔNG SOI THEO TỆP ĐÃ NGHI: lượt quét trước chỉ nhìn 6 tệp tôi
// đang nghi, nên bỏ sót 4 chỗ — trong đó có trộm heo/trộm cây, ca mất mát CHÉO giữa hai
// người chơi. Nới phép quét ra toàn `src/` thì chúng hiện ra ngay.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const docSach = (...p) => boCmt(doc(...p));

function duyet(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) duyet(p, out);
        else if (e.name.endsWith('.js')) out.push(p);
    }
    return out;
}

// =====================================================================
// (1) Quét toàn repo: hàm ghi CÓ GIÁ TRỊ không được bỏ trôi kết quả
// =====================================================================

// Ghi thứ người chơi đánh đổi hoặc kiếm được. `giveItemAdmin` KHÔNG có ở đây vì
// `cay_cuoc_khong_khoe_hao.test.js` đã gác riêng nó cùng cả câu chuyện của nó.
const HAM_CO_GIA_TRI = [
    'removeItem', 'takeItem', 'addMoney', 'addBankMoney', 'addPetSkillPoints',
    'setWallet', 'transferMoney', 'addSkillPoints', 'spendEnergy', 'updateExp', 'addHealth',
];

// Chỗ CỐ Ý bỏ trôi, kèm lý do đã kiểm. Thêm vào đây phải nêu được vì sao ghi hụt KHÔNG làm
// lời nào thành sai — không phải "chắc không sao".
const MIEN = {
    'src/commands/economy/rest.js': {
        ham: 'addHealth',
        lyDo: 'hồi máu là phần thưởng KÈM THÊM của /rest (đỡ tốn viện phí), còn thứ lệnh này '
            + 'HỨA là hồi năng lượng — và `setEnergy` thì CÓ kiểm. Câu thông báo không nêu con '
            + 'số máu nào, nên `addHealth` hỏng riêng thì không có lời nào thành sai.',
        // Lý do chỉ đứng được nếu `setEnergy` vẫn được kiểm và chữ thông báo vẫn không nêu máu.
        conDung: (s) => /const daHoi = await db\.setEnergy\(/.test(s) && /if \(daHoi !== true\)/.test(s),
    },
};

test('toàn repo: không chỗ nào ghi thứ có giá trị rồi bỏ trôi kết quả', () => {
    const re = new RegExp(`^\\s*await\\s+db\\.(${HAM_CO_GIA_TRI.join('|')})\\([^;]*\\);\\s*$`);
    const viPham = [];
    for (const f of duyet(path.join(ROOT, 'src'))) {
        const rel = path.relative(ROOT, f).replace(/\\/g, '/');
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        s.split(/\r?\n/).forEach((l, i) => {
            const m = re.exec(l);
            if (!m) return;
            if (MIEN[rel] && MIEN[rel].ham === m[1]) return;
            viPham.push(`${rel}:${i + 1}  ${m[1]}()  ->  ${l.trim()}`);
        });
    }
    assert.deepStrictEqual(viPham, [],
        'Ghi thứ CÓ GIÁ TRỊ mà không đọc kết quả. Mọi hàm trong src/database.js nuốt lỗi và\n'
        + 'trả `false`/`null`, nên bỏ trôi nghĩa là người chơi được báo thành công trong khi\n'
        + 'DB không ghi gì — và thứ đã bị tiêu để đổi lấy nó thì không lấy lại được.\n'
        + 'Khuôn sửa: kiểm kết quả, nói thật khi hụt, ghi [PAYOUT FAIL], KHÔNG làm lại.\n'
        + 'Nếu thật sự vô hại thì thêm vào MIEN kèm lý do VÀ một phép `conDung` tự kiểm.');
});

test('mỗi mục MIEN phải còn đúng, không chỉ còn tồn tại', () => {
    for (const [rel, m] of Object.entries(MIEN)) {
        assert.ok(fs.existsSync(path.join(ROOT, rel)), `MIEN nêu ${rel} nhưng tệp không còn.`);
        assert.ok(m.lyDo && m.lyDo.length > 60, `MIEN[${rel}] thiếu lý do thật.`);
        const s = docSach(rel);
        assert.ok(new RegExp(`await\\s+db\\.${m.ham}\\(`).test(s),
            `${rel} không còn gọi ${m.ham}() — bỏ khỏi MIEN để cổng khỏi rộng vô ích.`);
        assert.ok(m.conDung(s),
            `Lý do miễn cho ${rel} KHÔNG còn đứng được: nó dựa vào việc lời ghi mà lệnh thật sự\n`
            + 'HỨA vẫn đang được kiểm. Phần đó đã đổi -> phải vá, hoặc viết lại lý do.');
    }
});

// =====================================================================
// (2) /pet feed — điểm kỹ năng mất là mất VĨNH VIỄN
// =====================================================================

test('pet: điểm kỹ năng phải kiểm kết quả, và kiểm ĐÚNG KIỂU', () => {
    const s = docSach('src', 'commands', 'economy', 'pet.js');

    assert.strictEqual((s.match(/await db\.addPetSkillPoints\(/g) || []).length, 2,
        'Có đúng hai nhánh cho ăn (bằng tiền và bằng vật phẩm); lệch thì xem lại cổng.');

    // Hàm trả SỐ điểm mới (int) hoặc `null` — `=== true` sẽ luôn sai, `if (x)` thì coi 0 là lỗi.
    assert.strictEqual((s.match(/const daCong = typeof spMoi === 'number';/g) || []).length, 2,
        'Phải kiểm `typeof === \'number\'`: addPetSkillPoints trả SỐ điểm mới hoặc `null`,\n'
        + 'không phải boolean. `=== true` luôn sai, còn `if (sp)` coi 0 điểm là lỗi.');

    // Buộc log GẮN VỚI điều kiện của nó, không chỉ "có mặt đâu đó trong tệp". Bản đầu của
    // phép kiểm này chỉ đếm chuỗi `[PAYOUT FAIL] pet-skillpoint`, nên phép bẻ ngược đổi
    // `if (!daCong)` thành `if (false)` vẫn làm cổng XANH — đúng kiểu cổng bù nhìn.
    assert.strictEqual(
        (s.match(/if \(!daCong\) console\.error\(`\[PAYOUT FAIL\] pet-skillpoint user=\$\{userId\} points=\$\{pointsGained\}`\);/g) || []).length, 2,
        'Log [PAYOUT FAIL] pet-skillpoint phải nằm sau `if (!daCong)` và kèm cả userId lẫn số\n'
        + 'điểm — không có log thì không truy được vụ mất điểm, mà log không bao giờ chạy thì\n'
        + 'cũng như không có.');
});

test('pet: ghi hụt thì NÓI, ở cả hai ngôn ngữ', () => {
    const s = docSach('src', 'commands', 'economy', 'pet.js');
    // Điểm kỹ năng SUY RA từ cấp (`floor(lvl/5)`), nên lần cho ăn sau tính mốc theo cấp MỚI
    // -> mốc đã vượt không bao giờ trả điểm lần hai. Im lặng ở đây là mất hẳn.
    const nhanhHut = s.match(/: \(daCong[\s\S]*?\)\);/g) || [];
    assert.ok(s.includes('daCong') && nhanhHut.length >= 1,
        'Không còn nhánh nói-thật khi cộng điểm hụt.');
    for (const [nn, dau] of [['en', 'did not finish saving'], ['vi', 'chưa ghi nhận xong']]) {
        assert.ok(s.includes(dau),
            `Thiếu câu cảnh báo bản ${nn}. Hai dòng này viết thẳng hai ngôn ngữ tại chỗ (theo\n`
            + 'đúng lối sẵn có của chúng), nên thiếu một bản là người dùng ngôn ngữ đó không\n'
            + 'được báo gì.');
    }
    assert.doesNotMatch(s, /daCong[\s\S]{0,200}?await db\.addPetSkillPoints\(/,
        'Đang cộng lại sau khi hụt -> `null` có thể là timeout SAU khi DB đã ghi, cộng lại là\n'
        + 'cộng hai lần.');
});

// =====================================================================
// (3) /announcement — "đã xoá" / "đã gửi" mà bản lưu thì không
// =====================================================================

test('announcement: không lời setGuildSetting nào bị bỏ trôi', () => {
    const s = docSach('src', 'commands', 'utility', 'announcement.js');
    const boTroi = s.split(/\r?\n/)
        .filter((l) => /^\s*await\s+db\.setGuildSetting\([^;]*\);\s*$/.test(l))
        .map((l) => l.trim());
    assert.deepStrictEqual(boTroi, [],
        'Bản tin lưu ở `guild_settings[\'global\']` là thứ `/announcement view` VÀ TRANG WEB\n'
        + 'đọc. Ghi hụt mà im lặng nghĩa là 49 server nhận tin mới trong khi web vẫn hiện tin\n'
        + 'cũ — và chủ bot đọc chữ "đã gửi xong".');
});

test('announcement clear: ghi hụt thì DỪNG, không nói "đã xoá"', () => {
    const s = docSach('src', 'commands', 'utility', 'announcement.js');
    assert.match(s, /const daXoa = \(await Promise\.all\(\[[\s\S]{0,400}?\]\)\)\.every\(\(x\) => x !== false\);/,
        'Ba lời xoá phải được gom và kiểm cùng nhau: hụt một khoá là bản tin vẫn treo.');
    // `every(x => x !== false)` chứ không phải `every(Boolean)`: helper trả `false` khi lỗi,
    // nhưng một lời ghi thành công có thể trả giá trị khác `true` trong tương lai.
    // Ngưỡng 1800 ký tự chứ không phải vài trăm: hai câu nói-thật trong khối này viết thẳng
    // hai ngôn ngữ nên dài sẵn. Đặt chật là cổng đỏ oan khi ai đó chỉ sửa câu chữ.
    assert.match(s, /if \(!daXoa\) \{[\s\S]{0,1800}?return interaction\.editReply/,
        'Xoá hụt thì phải DỪNG và báo lỗi, chứ không chạy tiếp tới embed "đã xoá".');
    assert.match(s, /\[CONFIG FAIL\] announcement-clear/, 'Thiếu log để truy vụ xoá hụt.');
});

test('announcement clear: KHÔNG dùng câu lỗi của lời ĐỌC cho lời GHI', () => {
    const s = docSach('src', 'commands', 'utility', 'announcement.js');
    // `common.db_error` nói "chưa lấy được dữ liệu của cậu" — đó là lời ĐỌC hụt. Dán vào ca
    // GHI hụt là nói sai lần nữa, và che mất điều chủ bot cần biết: tin VẪN đang treo.
    assert.doesNotMatch(s, /common\.db_error/,
        '`common.db_error` là câu cho lời ĐỌC hụt. Ca này là lời GHI hụt.');
    for (const dau of ['The announcement was not cleared', 'Chưa xoá được thông báo']) {
        assert.ok(s.includes(dau), `Thiếu câu nói thật: "${dau}"`);
    }
});

test('announcement send: lưu hụt thì vẫn phát tin, nhưng phải nói ra', () => {
    const s = docSach('src', 'commands', 'utility', 'announcement.js');
    assert.match(s, /const daLuu = \(await Promise\.all\(\[[\s\S]{0,300}?\]\)\)\.every\(\(x\) => x !== false\);/,
        'Hai lời lưu (nội dung + tiêu đề) phải được kiểm.');
    assert.match(s, /\[CONFIG FAIL\] announcement-send/, 'Thiếu log để truy vụ lưu hụt.');

    // CỐ Ý vẫn phát tin khi lưu hụt: tin đã soạn xong, chặn lại thì mất công soạn. Nhưng
    // dòng kết quả phải nói rõ web + /announcement view còn hiện bản cũ.
    assert.match(s, /success_desc[\s\S]{0,120}?\+ \(daLuu \? '' :/,
        'Dòng báo kết quả không kèm cảnh báo khi lưu hụt -> chủ bot tưởng web đã cập nhật.');
    assert.doesNotMatch(s, /if \(!daLuu\) return/,
        'Lưu hụt KHÔNG được chặn việc phát tin: tin đã soạn xong rồi, chặn là mất công soạn\n'
        + 'mà chẳng cứu được gì.');
});
