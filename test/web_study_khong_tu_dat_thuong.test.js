// ============================================================
// test/web_study_khong_tu_dat_thuong.test.js
//
// VÌ SAO CÓ: trang /study trên web nay ghi phiên học vào DB và trả xu/EXP/điểm thật. Hai thứ
// trong đó rất dễ trôi mà không ai thấy, nên chốt lại bằng cổng:
//
//   1) TẦNG WEB KHÔNG ĐƯỢC TỰ ĐẶT SỐ TIỀN THƯỞNG.
//      RPC cũ `complete_study_session` nhận p_earned_coins/p_earned_exp/p_study_points từ bên
//      gọi và KHÔNG kiểm đã hết giờ hay chưa. Với bot thì chấp nhận được (chỉ tiến trình bot
//      gọi), nhưng nếu tầng web gọi nó thì ai chạm được đường gọi là tự chọn số xu cho mình,
//      và bấm "xong" ở giây đầu vẫn ăn đủ thưởng phiên 120 phút. Web PHẢI dùng bộ `*_web_*`
//      nơi DB tự tính thưởng và tự so `now()` với `ends_at`.
//
//   2) CÔNG THỨC THƯỞNG PHẢI GIỐNG NHAU GIỮA HAI CỬA.
//      Cùng một việc "học 25 phút" mà web trả khác bot là tự mở đường kiếm lời bằng cách chọn
//      cửa. Đây đúng lớp lỗi của vụ `data/pets.js` vs `web/src/lib/game.ts` — hai bản chép tay
//      của cùng một bảng số, không cổng nào canh, và web đã trôi thật.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const GOC = path.join(__dirname, '..');
const ACTIONS = path.join(GOC, 'web', 'src', 'app', 'study', 'actions.ts');
const SQL = path.join(GOC, 'supabase', 'migrations', '0143_web_study_session.sql');
const LIB_BOT = path.join(GOC, 'src', 'lib', 'study.js');

const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
const boCmtSql = s => s.replace(/^\s*--.*$/gm, ' ');

test('các tệp mà cổng này canh đều còn tồn tại', () => {
    for (const p of [ACTIONS, SQL, LIB_BOT]) {
        assert.ok(fs.existsSync(p), `Không thấy ${path.relative(GOC, p)} — đổi đường dẫn thì phải sửa cổng này.`);
    }
});

test('Server Action của /study KHÔNG gọi RPC tin-số-tiền-bên-gọi', () => {
    const s = boCmt(fs.readFileSync(ACTIONS, 'utf8'));

    assert.ok(
        !/["']complete_study_session["']/.test(s),
        'actions.ts gọi `complete_study_session` — RPC này nhận số tiền thưởng từ bên gọi và '
        + 'KHÔNG kiểm đã hết giờ chưa. Dùng `complete_web_study_session` (DB tự tính, tự so giờ).'
    );

    for (const cam of ['p_earned_coins', 'p_earned_exp', 'p_study_points']) {
        assert.ok(
            !s.includes(cam),
            `actions.ts truyền \`${cam}\` xuống DB. Tầng web không được nêu tên số tiền thưởng — `
            + 'để DB tự tính từ `duration_minutes` đã chốt lúc bắt đầu.'
        );
    }
});

test('Server Action của /study lấy danh tính từ PHIÊN ĐĂNG NHẬP, không nhận từ client', () => {
    const s = boCmt(fs.readFileSync(ACTIONS, 'utf8'));

    // Mọi hàm `export async function` công khai đều không được có tham số kiểu userId/discordId:
    // nhận danh tính từ client = ai cũng học hộ/nhận thưởng hộ người khác.
    const thamSoXau = [];
    for (const m of s.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g)) {
        const [, ten, thamSo] = m;
        if (/\b(userId|user_id|discordId|discord_id|p_user_id)\b/.test(thamSo)) thamSoXau.push(ten);
    }
    assert.deepStrictEqual(thamSoXau, [],
        'Các Server Action sau nhận Discord ID làm tham số: ' + thamSoXau.join(', ')
        + '. Client tự khai mình là ai = nhận thưởng hộ người khác. Chỉ được lấy qua '
        + '`getDiscordIdentity` từ cookie phiên đăng nhập.');

    assert.ok(/getDiscordIdentity/.test(s),
        'actions.ts không dùng `getDiscordIdentity` — đó là chỗ duy nhất đọc Discord ID an toàn '
        + '(từ `identities[]`, client không sửa được).');
});

test('4 RPC web-study đều bị thu quyền của anon/authenticated', () => {
    const sql = fs.readFileSync(SQL, 'utf8');
    const ham = [
        'start_web_study_session',
        'extend_web_study_session',
        'complete_web_study_session',
        'cancel_web_study_session',
    ];
    for (const h of ham) {
        const reRevoke = new RegExp(`REVOKE ALL ON FUNCTION public\\.${h}\\(`, 'i');
        const reGrant = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${h}\\([^)]*\\) TO service_role`, 'i');
        assert.ok(reRevoke.test(sql),
            `${h} thiếu REVOKE. Postgres TỰ cấp EXECUTE cho PUBLIC, không thu hồi tường minh thì `
            + 'gọi được bằng khoá công khai = ai cũng tự bơm xu cho mình (bài học 0137/0138).');
        assert.ok(reGrant.test(sql), `${h} thiếu GRANT cho service_role.`);
    }
});

test('RPC hoàn thành có chốt thời gian theo đồng hồ MÁY CHỦ', () => {
    const sql = boCmtSql(fs.readFileSync(SQL, 'utf8'));
    assert.ok(/now\(\)\s*<\s*v_session\.ends_at/.test(sql),
        'complete_web_study_session không so `now()` với `ends_at`. Thiếu chốt này thì client '
        + 'bấm xong ngay giây đầu vẫn ăn đủ thưởng — sửa Date.now trên trình duyệt là xong.');
    assert.ok(/too_early/.test(sql), 'Thiếu nhánh trả về `too_early`.');
});

test('công thức thưởng của web GIỐNG HỆT bot', () => {
    const botSrc = boCmt(fs.readFileSync(LIB_BOT, 'utf8'));
    const sql = boCmtSql(fs.readFileSync(SQL, 'utf8'));

    // Bot: earnedCoins = BigInt(minutes * 50); earnedExp = BigInt(minutes * 20);
    //      studyPoints = Math.floor(minutes / 5);
    const botXu = botSrc.match(/earnedCoins\s*=\s*BigInt\(\s*minutes\s*\*\s*(\d+)\s*\)/);
    const botExp = botSrc.match(/earnedExp\s*=\s*BigInt\(\s*minutes\s*\*\s*(\d+)\s*\)/);
    const botDiem = botSrc.match(/studyPoints\s*=\s*Math\.floor\(\s*minutes\s*\/\s*(\d+)\s*\)/);
    assert.ok(botXu && botExp && botDiem,
        'Không đọc được công thức thưởng trong src/lib/study.js — bot đổi cách viết thì phải sửa cổng này.');

    // SQL: v_coins := ... * 50; v_exp := ... * 20; v_points := FLOOR(... / 5.0)
    const sqlXu = sql.match(/v_coins\s*:=\s*v_session\.duration_minutes::BIGINT\s*\*\s*(\d+)/i);
    const sqlExp = sql.match(/v_exp\s*:=\s*v_session\.duration_minutes::BIGINT\s*\*\s*(\d+)/i);
    const sqlDiem = sql.match(/v_points\s*:=\s*FLOOR\(v_session\.duration_minutes\s*\/\s*([\d.]+)\)/i);
    assert.ok(sqlXu && sqlExp && sqlDiem,
        'Không đọc được công thức thưởng trong 0143 — đổi cách viết thì phải sửa cổng này.');

    assert.equal(sqlXu[1], botXu[1], `Hệ số XU lệch: web ${sqlXu[1]} vs bot ${botXu[1]}.`);
    assert.equal(sqlExp[1], botExp[1], `Hệ số EXP lệch: web ${sqlExp[1]} vs bot ${botExp[1]}.`);
    assert.equal(parseFloat(sqlDiem[1]), parseFloat(botDiem[1]),
        `Ước số ĐIỂM HỌC TẬP lệch: web ${sqlDiem[1]} vs bot ${botDiem[1]}.`);
});

test('biên số phút của web trùng biên của lệnh /study bên bot', () => {
    const sql = boCmtSql(fs.readFileSync(SQL, 'utf8'));
    const botSrc = boCmt(fs.readFileSync(LIB_BOT, 'utf8'));

    const sqlKep = sql.match(/LEAST\((\d+),\s*GREATEST\((\d+),\s*COALESCE\(p_duration_minutes/i);
    const botKep = botSrc.match(/Math\.max\((\d+),\s*Math\.min\((\d+),\s*durationMinutes/);
    assert.ok(sqlKep, 'Không thấy chỗ kẹp biên số phút trong 0143.');
    assert.ok(botKep, 'Không thấy chỗ kẹp biên số phút trong src/lib/study.js.');

    assert.equal(sqlKep[2], botKep[1], `Biên DƯỚI lệch: web ${sqlKep[2]} vs bot ${botKep[1]} phút.`);
    assert.equal(sqlKep[1], botKep[2], `Biên TRÊN lệch: web ${sqlKep[1]} vs bot ${botKep[2]} phút.`);
});

// ============================================================
// MỘT CỬA DUY NHẤT (0145). Ba chốt dưới đây canh ba thứ đã ĐO ĐƯỢC là hỏng trước khi vá:
// bot mở song song phiên thứ hai (2 dòng ACTIVE -> nhân đôi thưởng 1500 xu cho 15 phút),
// và 10 lời gọi đồng thời tạo được 2 dòng (2/3 lượt).
// ============================================================
const SQL145 = path.join(GOC, 'supabase', 'migrations', '0145_study_mot_cua_duy_nhat.sql');

test('bot KHÔNG được chèn thẳng vào user_study_sessions, phải qua cửa chung', () => {
    const s = boCmt(fs.readFileSync(path.join(GOC, 'src', 'database.js'), 'utf8'));

    // `.from('user_study_sessions').insert(` = vòng qua cửa chung -> mất cả chốt trùng phiên
    // lẫn chỗ đặt nhịp tim ban đầu.
    const chenThang = /from\(\s*['"]user_study_sessions['"]\s*\)[\s\S]{0,200}?\.insert\(/.test(s);
    assert.ok(!chenThang,
        'src/database.js chèn thẳng vào `user_study_sessions`. Phải gọi RPC '
        + '`start_study_session_guarded` — chốt chống trùng phiên nằm ở đó, chèn thẳng là đi vòng '
        + 'qua nó (đã đo: mở được phiên bot + phiên web song song -> 1500 xu cho 15 phút).');

    assert.ok(/start_study_session_guarded/.test(s),
        'src/database.js không gọi `start_study_session_guarded` — cửa chung của cả bot lẫn web.');
});

test('có chỉ mục duy nhất một phần — thứ duy nhất bịt được đua tranh', () => {
    assert.ok(fs.existsSync(SQL145), 'Không thấy 0145 — đổi tên thì phải sửa cổng này.');
    const sql = boCmtSql(fs.readFileSync(SQL145, 'utf8'));

    const re = /CREATE UNIQUE INDEX[\s\S]{0,120}?ON public\.user_study_sessions\s*\(\s*user_id\s*\)\s*WHERE\s+status\s*=\s*'ACTIVE'/i;
    assert.ok(re.test(sql),
        'Thiếu chỉ mục duy nhất một phần trên (user_id) WHERE status=\'ACTIVE\'. Kiểm-rồi-mới-chèn '
        + 'KHÔNG đủ: READ COMMITTED không khoá gì lúc SELECT vì chưa có dòng nào để khoá. Đã đo: '
        + '10 lời gọi đồng thời -> 2/3 lượt tạo được 2 dòng ACTIVE.');

    assert.ok(/unique_violation/i.test(sql),
        'Cửa vào không bắt `unique_violation`. Không bắt thì lời gọi thua cuộc nhận lỗi SQL thô '
        + 'thay vì câu trả lời "đang có phiên khác".');
});

test('nhịp tim phải đập TRƯỚC nhánh thoát sớm khi tạm dừng', () => {
    const s = boCmt(fs.readFileSync(LIB_BOT, 'utf8'));

    const than = s.match(/setInterval\(async \(\) => \{([\s\S]*?)\n {4}\}, 30_000\)/);
    assert.ok(than, 'Không tìm thấy vòng lặp 30 giây trong src/lib/study.js — đổi cách viết thì phải sửa cổng này.');

    const viTriNhip = than[1].indexOf('beatStudySession');
    const viTriThoat = than[1].search(/if\s*\(\s*session\.isPaused\s*\)\s*return/);
    assert.ok(viTriNhip !== -1, 'Vòng lặp 30 giây không đập nhịp — phiên đang chạy sẽ bị coi là bỏ hoang sau 5 phút.');
    assert.ok(viTriThoat !== -1, 'Không thấy nhánh thoát sớm khi tạm dừng.');
    assert.ok(viTriNhip < viTriThoat,
        'Nhịp tim đặt SAU `if (session.isPaused) return`. Ai tạm dừng quá 5 phút sẽ bị cửa vào '
        + 'coi là bỏ hoang và huỷ mất phiên — tạm dừng vẫn là đang giữ phiên.');
});

test('phòng học bài không còn dùng nhạc của easter egg HVL', () => {
    // Bỏ chú thích trước khi quét: khối chú thích trong page.tsx CÓ nhắc tên `hvl_audio` để
    // giải thích vì sao đã thay nhạc. Quét cả chú thích thì cổng tự báo đỏ trên chính bản đã vá
    // (đúng cái bẫy "công cụ đo hỏng theo code" của lần trước).
    const page = boCmt(fs.readFileSync(path.join(GOC, 'web', 'src', 'app', 'study', 'page.tsx'), 'utf8'));
    assert.ok(!/hvl_audio/.test(page),
        'page.tsx vẫn trỏ vào bucket `hvl_audio` — đó là album rap của easter egg HVL/MCK, '
        + 'sai không khí phòng học. Nhạc lofi nằm ở bucket `study_lofi`.');
});
