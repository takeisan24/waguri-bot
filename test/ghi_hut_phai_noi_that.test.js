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
//
// ⚠️ GIỚI HẠN ĐÃ BIẾT CỦA CỔNG NÀY — đừng tin nó rộng hơn thực tế. Nó chỉ thấy được những
// lời ghi CÓ GIÁ TRỊ TRẢ VỀ ĐỂ MÀ BỎ TRÔI. Một nhóm helper trong `src/database.js` nuốt lỗi
// rồi trả `undefined` cho MỌI kết quả — `deletePlant`, `pigSetType`, `pigSetSick`,
// `plantSetDead`... (dạng `try { await supabase...; } catch { log; }`, không có `return`).
// Nơi gọi chúng KHÔNG THỂ kiểm, nên `destroyPlant` vẫn nói "đã phá cây thành công" khi lệnh
// xoá hỏng, và `/pig feed` vẫn khoe giống heo khi `pigSetType` hỏng. Hai ca đó CỐ Ý chưa vá
// ở đây: phải đổi hợp đồng helper trong database.js trước, và đó là sổ nợ "`false` lẫn
// nghĩa" (~44 hàm) chứ không phải việc chen vào một lượt vá. Hậu quả của chúng là nhầm lẫn
// chứ không phải mất mát: người chơi phá cây rồi gõ lại được, giống heo chỉ là chữ hiển thị.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// Chú thích khối phải được thay bằng ĐÚNG số dòng trống của nó, không nén thành một dấu
// cách: nén làm lệch mọi số dòng cổng in ra, và 23/10 nó bắt đúng một lỗi tiền thật nhưng
// báo "database.js:938" — một dòng không hề liên quan — nên mất một lượt đi tìm.
const boCmt = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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

// Ghi CẤU HÌNH — không phải "giá trị" của người chơi, nhưng y hệt một lớp lỗi: `/config` nói
// "đã lưu" khi chưa lưu (`e138e6b`), `/announcement` nói "đã gửi xong" khi bản tin không vào
// DB (`7ae95a6`). Thêm vào đây 23/10 vì `nextConfessionNumber` bỏ trôi đúng lời này — số thứ
// tự được CẤP mà không được LƯU, nên bài sau lấy lại đúng số đó.
const HAM_CAU_HINH = ['setGuildSetting'];

const HAM_GAC = [...HAM_CO_GIA_TRI, ...HAM_CAU_HINH];

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
    'src/events/ready.js': {
        ham: 'setGuildSetting',
        lyDo: 'việc NỀN, không ai được hứa gì: `syncBotStatsToDb` đẩy số server/thành viên lên '
            + '`guild_settings[\'global\']` cho trang web, chạy lại mỗi 30 phút. Ghi hụt nghĩa là '
            + 'web hiện số hơi cũ trong tối đa nửa tiếng rồi tự đúng lại — không có người dùng '
            + 'nào đang đọc một câu "đã xong", và không có gì bị tiêu để đổi lấy nó.',
        // Lý do đứng được nhờ HAI điều: nó vẫn chạy lặp (tự chữa), và vẫn không có đường
        // nào báo kết quả cho người dùng. Mất một trong hai thì phải kiểm kết quả như chỗ khác.
        conDung: (s) => /setInterval\(post, 30 \* 60 \* 1000\)/.test(s)
            && /async function syncBotStatsToDb\(client\) \{/.test(s),
    },
};

// Ba điều phép đo này phải làm được, và BẢN ĐẦU CỦA NÓ KHÔNG LÀM ĐƯỢC CẢ BA — chính vì vậy
// nó bỏ sót `nextConfessionNumber` suốt lượt quét 23/10:
//   · `db.` phải là TUỲ CHỌN. Helper trong `src/database.js` gọi nhau trực tiếp
//     (`await setGuildSetting(...)`, không có tiền tố), nên neo cứng `db\.` làm cả tệp
//     database.js — nơi mọi lời ghi thật sự nằm — vô hình với cổng.
//   · Phải thấy lời gọi NHIỀU DÒNG. Bản đầu đòi `);` cuối cùng một dòng, nên
//     `await db.setGuildSetting('global', 'bot_stats', {` xuống dòng là thoát.
//   · Nhưng `^\s*await` cũng khớp phần TIẾP của một câu đã gán (`const x =` rồi xuống dòng
//     `await ...`). Chỗ đó kết quả KHÔNG bị bỏ trôi, nên phải loại ra bằng cách soi dòng
//     trước: nếu nó kết thúc bằng một toán tử đang chờ toán hạng thì đây là câu tiếp.
const DONG_TRUOC_CON_CHO = /[=([,&|?:+]\s*$/;

test('toàn repo: không chỗ nào ghi thứ có giá trị rồi bỏ trôi kết quả', () => {
    const re = new RegExp(`^[ \\t]*await\\s+(?:db\\.)?(${HAM_GAC.join('|')})\\(`);
    const viPham = [];
    for (const f of duyet(path.join(ROOT, 'src'))) {
        const rel = path.relative(ROOT, f).replace(/\\/g, '/');
        const s = boCmt(fs.readFileSync(f, 'utf8'));
        const dong = s.split(/\r?\n/);
        dong.forEach((l, i) => {
            const m = re.exec(l);
            if (!m) return;
            const truoc = dong.slice(0, i).reverse().find((x) => x.trim() !== '') || '';
            if (DONG_TRUOC_CON_CHO.test(truoc)) return;
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

// =====================================================================
// (4) /sell — thưởng buff `harvest` của thú cưng
//
// Chỗ này do phép quét NỚI RỘNG ngày 23/10 bắt được, và cổng bản trước mù hoàn toàn với nó
// vì nó nằm TRONG `src/database.js` nên lời gọi không có tiền tố `db.`.
// =====================================================================

test('sellItem: chỉ phồng gain khi tiền ĐÃ vào ví', () => {
    const s = docSach('src', 'database.js');

    // `/sell` in "Thu về" từ `r.gain` VÀ "Số dư mới" đọc tươi từ DB. Cộng vô điều kiện thì
    // ghi hụt làm hai con số lệch nhau, mà con số sai mới là con số người chơi tin.
    assert.match(s, /if \(\(await addMoney\(userId, bonus, 'wallet'\)\) !== false\) \{\s*data\.gain = Number\(data\.gain\) \+ bonus;/,
        'Phép cộng `data.gain` phải nằm TRONG nhánh thành công của `addMoney`.');

    // `!== false` chứ không phải `=== true`: addMoney trả `data !== null`, tức boolean thật,
    // nhưng viết `!== false` thì một ngày helper trả giá trị khác cũng không biến thành "hụt".
    assert.match(s, /\[PAYOUT FAIL\] sell-harvest-bonus user=\$\{userId\} bonus=\$\{bonus\}/,
        'Thiếu log để truy vụ hụt thưởng buff harvest.');

    // Không được cộng bù: `false` có thể là timeout SAU khi DB đã cộng -> cộng hai lần.
    assert.doesNotMatch(s, /\[PAYOUT FAIL\] sell-harvest-bonus[\s\S]{0,200}?await addMoney\(/,
        'Đang cộng lại sau khi hụt -> nguy cơ cộng hai lần.');
});

// =====================================================================
// (5) /confession — số thứ tự phải do DB cấp, và hụt thì DỪNG
// =====================================================================

test('nextConfessionNumber: nguyên tử trong DB, không đọc-sửa-ghi trong JS', () => {
    const s = docSach('src', 'database.js');
    const than = s.slice(s.indexOf('async function nextConfessionNumber'));
    // `\r?\n` chứ không phải `\n`: `src/database.js` là CRLF, nên neo `'\n}\n'` khớp 0 lần và
    // khối trích ra rỗng — cổng đỏ oan. Bẫy này đã cắn nhiều lần, kể cả trong chính test.
    const het = /\r?\n\}\r?\n/.exec(than);
    const khoi = than.slice(0, het ? het.index + het[0].length : than.length);

    assert.match(khoi, /supabase\.rpc\('next_confession_number', \{ p_guild: guildId \}\)/,
        'Phải gọi RPC nguyên tử `next_confession_number` (migration 0159).');

    // Ba lỗi của bản cũ, mỗi lỗi một phép chặn:
    //  (A) đua tranh — hai bài cùng lúc trùng số;
    //  (B) `getGuildSettings` trả `{}` khi đọc hỏng -> số tụt về 1 VÀ counter bị ghi đè về 1,
    //      tức mất cả dãy số của server chỉ vì một lượt đọc chập;
    //  (C) kết quả `setGuildSetting` bị bỏ trôi -> bài sau lấy lại đúng số đó.
    assert.doesNotMatch(khoi, /getGuildSettings\(/,
        'Đọc rồi tự cộng trong JS là đúng lỗi cũ: `getGuildSettings` trả `{}` khi lỗi nên số\n'
        + 'tụt về 1 và ghi đè counter về 1 — mất cả dãy số của server.');
    assert.doesNotMatch(khoi, /setGuildSetting\(/,
        'Không được quay lại đường `setGuildSetting`: nó tách CẤP số khỏi LƯU số, nên ghi hụt\n'
        + 'là bài sau trùng số.');

    assert.match(khoi, /return Number\.isInteger\(n\) && n > 0 \? n : null;/,
        'Phải trả `null` khi không cấp được số — nơi gọi cần phân biệt được để mà dừng.');
    assert.match(khoi, /return null;/, 'Nhánh catch phải trả `null`, không phải một con số đoán.');
});

test('confession: không cấp được số thì DỪNG, và nói rõ bài chưa đăng', () => {
    const s = docSach('src', 'commands', 'fun', 'confession.js');

    const iSo = s.indexOf('const num = await db.nextConfessionNumber(gid);');
    const iLog = s.indexOf('db.logConfession(');
    const iGui = s.indexOf('await channel.send(');
    assert.ok(iSo > -1 && iLog > -1 && iGui > -1, 'thiếu một trong các mốc.');

    // Nhánh dừng phải nằm GIỮA lúc lấy số và lúc dùng số. Ngưỡng 1400 vì hai câu nói-thật
    // viết thẳng hai ngôn ngữ tại chỗ nên dài sẵn — đặt chật là cổng đỏ oan khi sửa câu chữ.
    const sauSo = s.slice(iSo);
    assert.match(sauSo.slice(0, 1400), /if \(num === null\) \{[\s\S]*?return interaction\.editReply/,
        'Phải DỪNG khi `num === null`. Đăng bài với số đoán thì bài sau sẽ trùng số, mà\n'
        + 'confession KHÔNG có dòng số dư nào để người ta đối chiếu ra sự thật.');
    assert.ok(s.indexOf('if (num === null)') < iLog && s.indexOf('if (num === null)') < iGui,
        'Nhánh dừng phải nằm TRƯỚC lúc ghi log và lúc gửi bài.');

    assert.match(s, /\[CONFESSION FAIL\] khong cap duoc so thu tu guild=\$\{gid\}/,
        'Thiếu log để truy vụ không cấp được số.');

    // `err_send_failed` nêu đích danh "quyền ở kênh vừa bị đổi" — dán vào lỗi DB là nói sai
    // lần nữa. Nên hai câu này viết thẳng tại chỗ, và phải có ĐỦ hai ngôn ngữ.
    for (const [nn, dau] of [['en', 'could not reserve a number'], ['vi', 'chưa lấy được số thứ tự']]) {
        assert.ok(s.includes(dau),
            `Thiếu câu nói thật bản ${nn}. Viết thẳng tại chỗ (vì \`err_send_failed\` nêu sai\n`
            + 'nguyên nhân), nên thiếu một bản là người dùng ngôn ngữ đó không được báo gì.');
    }
    // Phải nói rõ là CHƯA đăng — người gửi confession không có cách nào tự kiểm.
    for (const dau of ['did **not** post', 'chưa đăng gì cả']) {
        assert.ok(s.includes(dau), `Câu nói thật phải khẳng định bài CHƯA đăng: thiếu "${dau}"`);
    }
});
