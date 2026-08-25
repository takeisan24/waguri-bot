// ============================================================
// test/khong_im_lang_ve_nguoi_choi.test.js — hai đuôi cuối của lớp "bot nói sai/không nói".
//
// (A) `/bacay` — bot KHÔNG NÓI GÌ CẢ, khác mọi chỗ khác trong đợt vá này.
//     Vòng thu cược chỉ `push` người thu được tiền; ai bị `stakeCollect` trả falsy sẽ biến
//     mất khỏi ván không một dấu vết. Nếu vẫn còn >=2 người thì ván CHẠY TIẾP, và người bị
//     loại — vốn đã bấm vào lobby và chờ hết thời gian — chỉ thấy ván diễn ra mà không có
//     mình. Cả bàn thì đọc "không đủ người", một câu nói về BÀN chứ không về họ.
//
// (B) Năm chuỗi i18n còn KHẲNG ĐỊNH PHẲNG về tài sản người dùng.
//     `stakeCollect`/`takeItem`/`addMoney`… trả `null` khi DB lỗi và `false` khi thật sự
//     thiếu (0144). Nhiều nơi gọi chưa tách hai nhánh đó, nhưng KHÔNG cần sửa logic: chỉ cần
//     câu chữ đừng khẳng định chắc nịch. Khuôn đã có sẵn trong repo từ trước ở
//     `cosmetic.title_err_poor`: "…mà ví chưa đủ (hoặc có lỗi xảy ra)~".
//
//     Cố ý chọn cách rẻ. Tách nhánh ở từng nơi gọi là việc lớn hơn nhiều mà kết quả với
//     người dùng y hệt — họ đọc một câu không nói dối. Xem thêm quyết định đã ghi trong
//     `test/loi_db_khong_noi_doi_ve_vi.test.js` cho các chỗ ĐÁNG tách nhánh thật.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));

test('bacay: người bị loại phải được GOM lại, không biến mất', () => {
    const s = doc('src', 'commands', 'games', 'bacay.js');
    assert.match(s, /const biLoai = \[\];/,
        'Phải gom người bị loại vào một mảng. Bản cũ chỉ push người thu được cược, nên người\n'
        + 'bị loại không còn dấu vết nào để mà nhắc tới.');
    assert.match(s, /else biLoai\.push\(p\);/,
        'Nhánh `else` của vòng thu cược phải ghi lại người bị loại.');
    assert.match(s, /biLoai\.map\(p => `<@\$\{p\.id\}>`\)/,
        'Phải nhắc tên (mention) người bị loại — nói "có người bị loại" mà không nói ai thì\n'
        + 'người bị loại vẫn không biết đó là mình.');
});

test('bacay: nêu tên ở CẢ hai nhánh — ván huỷ VÀ ván vẫn chạy', () => {
    const s = doc('src', 'commands', 'games', 'bacay.js');
    const soLanDung = (s.match(/\+ dongBiLoai|dongBiLoai,/g) || []).length;
    assert.ok(soLanDung >= 2,
        `Chỉ dùng \`dongBiLoai\` ${soLanDung} lần. Phải có ở CẢ HAI nhánh.\n`
        + 'Nhánh "ván vẫn chạy" mới là nhánh quan trọng hơn: ở nhánh huỷ ván thì ít nhất cả\n'
        + 'bàn còn thấy một thông báo, còn ở đây người bị loại tuyệt đối không được biết gì.');

    assert.match(s, /err_not_enough_players'\) \+ dongBiLoai/,
        'Nhánh huỷ ván phải kèm danh sách người bị loại.');
    assert.match(s, /prize: fmt\(share, locale\)[\s\S]{0,80}\+ dongBiLoai/,
        'Nhánh ván VẪN CHẠY phải kèm danh sách người bị loại.');
});

test('bacay: khoá i18n phải có ở cả hai ngôn ngữ và cắm được tên', () => {
    for (const ngu of ['vi', 'en']) {
        const b = require(`../src/locales/${ngu}.json`).commands.bacay;
        assert.ok(b.bi_loai, `${ngu}: thiếu commands.bacay.bi_loai`);
        assert.match(b.bi_loai, /\{names\}/, `${ngu}: bi_loai phải cắm ô {names}`);
    }
});

test('năm chuỗi khẳng định phẳng phải chừa đường lùi', () => {
    // Không khẳng định chắc nịch về tài sản người dùng khi nguyên nhân có thể là lỗi DB.
    const CAN_SUA = [
        ['tangdo', 'err_poor_self'],
        ['tangdo', 'err_poor_player'],
        ['couple', 'marry_poor_desc'],
        ['couple', 'divorce_err_poor'],
        ['lixi', 'err_poor'],
    ];
    const CHUA_LUI = {
        vi: /trục trặc|có lỗi|thử lại/i,
        // Gộp đủ các cách diễn đạt đang dùng trong repo: bản `cosmetic` có sẵn nói
        // "or something went wrong", các chuỗi mới nói "glitched"/"try again".
        en: /glitch|error|went wrong|try again/i,
    };
    const thieu = [];
    for (const ngu of ['vi', 'en']) {
        const c = require(`../src/locales/${ngu}.json`).commands;
        for (const [nhom, khoa] of CAN_SUA) {
            const s = c[nhom]?.[khoa];
            if (!s) { thieu.push(`${ngu}/${nhom}.${khoa}: THIẾU KHOÁ`); continue; }
            if (!CHUA_LUI[ngu].test(s)) thieu.push(`${ngu}/${nhom}.${khoa}: còn khẳng định phẳng`);
        }
    }
    assert.deepStrictEqual(thieu, [],
        'Các chuỗi này khẳng định chắc nịch rằng người dùng thiếu tiền/vật phẩm. Nhưng hàm\n'
        + 'bọc trả `null` khi DB lỗi và `false` khi thật sự thiếu, mà nơi gọi chưa tách hai\n'
        + 'nhánh — nên lúc Supabase chập chờn câu đó thành nói sai về tài sản của chính họ.\n'
        + 'Khuôn: `cosmetic.title_err_poor` — "…mà ví chưa đủ (hoặc có lỗi xảy ra)~".');
});

test('khuôn gốc `cosmetic` không được gỡ mất', () => {
    // Hai chuỗi này vốn ĐÃ đúng từ trước và là lý do cả cách vá rẻ này tồn tại.
    for (const ngu of ['vi', 'en']) {
        const c = require(`../src/locales/${ngu}.json`).commands.cosmetic;
        for (const k of ['title_err_poor', 'color_err_poor']) {
            assert.match(c[k], ngu === 'vi' ? /hoặc có lỗi|trục trặc/i : /or an error|went wrong|glitch/i,
                `${ngu}/cosmetic.${k}: mất mệnh đề chừa đường lùi — đây là khuôn mẫu cho 5 chuỗi kia.`);
        }
    }
});
