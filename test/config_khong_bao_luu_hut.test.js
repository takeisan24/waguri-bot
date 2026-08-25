// ============================================================
// test/config_khong_bao_luu_hut.test.js — `/config` và `/setup` không được báo "đã lưu"
// khi chưa lưu được.
//
// VÌ SAO CÓ. `db.setGuildSetting()` trả `false` khi DB lỗi. Bản cũ của `config.js` có 13
// nhánh, mỗi nhánh tự gọi hàm đó rồi tự dựng embed `'success'` — và KHÔNG nhánh nào kiểm
// kết quả. Lúc Supabase chập chờn, admin đọc "✅ Đã tắt trò may rủi" trong khi thật ra
// chưa tắt gì cả, rồi rời đi với niềm tin rằng server đã cấu hình xong.
//
// NẶNG hơn cùng lớp lỗi ở tầng người chơi: mấy công tắc này là `gambling`, `pvp`,
// `police_jail` — thứ chủ server bật/tắt để KIỂM SOÁT server của họ. Tin nhầm rằng một
// công tắc an toàn đang bật là kiểu tin nhầm đắt nhất.
//
// ĐÂY KHÔNG PHẢI BÀI HỌC MỚI CỦA REPO. `antinuke.js` đã kiểm kết quả ghi ở mọi chỗ, kèm
// chú thích nói đúng lý do: "báo đã bật lá chắn trong khi DB từ chối là kiểu thất bại tệ
// nhất của cả tính năng — chủ server yên tâm nhầm". Chỉ là lúc đó áp cho antinuke mà quên
// config. Cổng này giữ cho hai bên không lệch nhau nữa.
//
// CÁCH VÁ — MỘT CỬA, không chép `if` 13 lần: 13 bản sao là 13 chỗ có thể quên lại. Cổng
// vì thế chốt vào chính cái cửa đó chứ không đếm số câu `if`.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const doc = (...p) => boCmt(fs.readFileSync(path.join(ROOT, 'src', 'commands', 'admin', ...p), 'utf8'));

test('config: mọi lần ghi đều đi qua MỘT cửa, và cửa đó kiểm kết quả', () => {
    const s = doc('config.js');

    assert.match(s, /const ghiCauHinh = async \(khoa, giaTri, moTaOk\) => \{/,
        'Thiếu cửa ghi chung `ghiCauHinh`.');
    assert.match(s, /const daGhi = await db\.setGuildSetting\(gid, khoa, giaTri\);/,
        'Cửa ghi phải GIỮ kết quả của setGuildSetting.');
    assert.match(s, /daGhi \? 'success' : 'error'/,
        'Ghi hỏng thì embed phải đổi sang `error`, không được vẫn tô màu thành công.');
    assert.match(s, /description: daGhi \? moTaOk : t\(locale, 'commands\.config\.err_save_failed'\)/,
        'Ghi hỏng thì phải thay hẳn nội dung, không chỉ đổi màu.');

    // Lời gọi trực tiếp = một nhánh đã đi vòng qua cửa kiểm.
    const goiThang = (s.match(/await db\.setGuildSetting\(gid, '/g) || []).length;
    assert.strictEqual(goiThang, 0,
        `Còn ${goiThang} nhánh gọi thẳng \`db.setGuildSetting(gid, '...')\`. Mọi lần ghi phải\n`
        + 'đi qua `ghiCauHinh` — gọi thẳng nghĩa là nhánh đó lại bỏ qua kết quả.');
});

test('config: đủ 13 nhánh ghi đi qua cửa (không nhánh nào rụng lại)', () => {
    const s = doc('config.js');
    const qua = (s.match(/await ghiCauHinh\(/g) || []).length;
    assert.strictEqual(qua, 13,
        `Chỉ ${qua}/13 nhánh đi qua \`ghiCauHinh\`. Lệnh có 13 subcommand GHI (confession-channel,\n`
        + 'ai, ai-channel, pvp, police-jail, gambling, levelup, welcome-channel, welcome-role,\n'
        + 'goodbye-channel, announcement-channel, language, staff-role) — `view` chỉ đọc nên\n'
        + 'không tính. Con số lệch nghĩa là có nhánh mới thêm mà quên nối vào cửa.');
});

test('setup: kênh tạo xong mà ghi cấu hình hỏng thì phải nói rõ là "một nửa"', () => {
    const s = doc('setup.js');

    assert.match(s, /const daGhi = await db\.setGuildSetting\(guild\.id, 'ai_channel', channel\.id\);/,
        'setup.js phải giữ kết quả ghi cấu hình.');
    assert.match(s, /daGhi \? 'success' : 'warning'/,
        "Ghi hỏng ở đây là THÀNH CÔNG MỘT NỬA (kênh đã tạo), nên `warning` chứ không phải\n"
        + "`error` — dùng `error` sẽ khiến admin tưởng cả lệnh đã thất bại và tạo lại kênh.");
    assert.match(s, /daGhi \? '' : t\(locale, 'commands\.setup\.warn_save_failed'\)/,
        'Phải nối câu giải thích vào mô tả khi ghi hỏng.');
});

test('hai chuỗi mới có ở cả hai ngôn ngữ và chỉ được đường đi tiếp', () => {
    for (const ngu of ['vi', 'en']) {
        const c = require(`../src/locales/${ngu}.json`).commands;

        const cfg = c.config?.err_save_failed;
        assert.ok(cfg, `${ngu}: thiếu commands.config.err_save_failed`);
        // Admin cần biết cấu hình CŨ vẫn còn nguyên, nếu không họ sẽ tưởng đã mất hết.
        const conNguyen = ngu === 'vi' ? /giữ nguyên|như cũ/i : /unchanged/i;
        assert.match(cfg, conNguyen,
            `${ngu}: err_save_failed phải nói rõ cấu hình CŨ vẫn giữ nguyên.`);

        const st = c.setup?.warn_save_failed;
        assert.ok(st, `${ngu}: thiếu commands.setup.warn_save_failed`);
        assert.match(st, /\/config ai-channel/,
            `${ngu}: warn_save_failed phải chỉ đúng lệnh cần chạy lại (\`/config ai-channel\`).`);
        assert.ok(st.startsWith('\n\n'),
            `${ngu}: warn_save_failed phải mở đầu bằng hai dòng trống — nó được NỐI vào cuối\n`
            + 'mô tả thành công, dính liền vào câu trước thì đọc như một câu.');
    }
});

test('antinuke vẫn giữ chuẩn cũ — đây là nơi bài học này ra đời', () => {
    // Nếu ai đó "dọn dẹp" antinuke cho giống config bản CŨ thì lá chắn quay lại đúng lỗi
    // vừa vá, mà hậu quả ở đó nặng hơn nhiều.
    const s = doc('antinuke.js');
    assert.match(s, /const kq = await db\.antinukeSetFlag\(gid, 'enabled', '1', interaction\.user\.id\);/,
        'antinuke phải giữ kết quả khi bật lá chắn.');
    assert.match(s, /antinukeSetConfig\(gid, 'log_channel'[\s\S]{0,60}!== 'ok'/,
        'antinuke phải kiểm kết quả khi đặt kênh báo động.');

    // ĐẾM, không chỉ tìm-thấy-một. Bản đầu của cổng này dùng `assert.match(/if \(kq !== 'ok'\)/)`
    // và vẫn XANH khi phép bẻ ngược gỡ mất một câu kiểm — vì antinuke có nhiều câu như vậy,
    // gỡ một cái thì regex bắt được cái còn lại. Chỉ lộ ra lúc chạy bẻ ngược.
    const soCau = (s.match(/!== 'ok'/g) || []).length;
    assert.ok(soCau >= 5,
        `antinuke chỉ còn ${soCau} câu kiểm kết quả ghi, kỳ vọng >= 5 (bật lá chắn, hoãn tắt,\n`
        + 'đổi chế độ, whitelist, kênh báo động). Thiếu câu nào nghĩa là thao tác đó lại có thể\n'
        + 'báo thành công trong khi DB từ chối — đúng lỗi vừa vá ở `config.js`, mà ở lá chắn\n'
        + 'chống nuke thì hậu quả nặng hơn nhiều.');
});
