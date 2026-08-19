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

test('hạn mức toàn cục: có trần cho CẢ DỰ ÁN, không chỉ theo đầu người', () => {
    const config = require('../src/config');
    assert.ok(Number.isInteger(config.AI.GLOBAL_DAILY) && config.AI.GLOBAL_DAILY > 0,
        'Thiếu AI.GLOBAL_DAILY — giới hạn theo đầu người KHÔNG bảo vệ được một khoá API dùng chung');
    assert.ok(config.AI.GLOBAL_DAILY >= config.AI.FREE_DAILY,
        'Trần chung phải >= trần một người, nếu không người đầu tiên đã chặn hết cả server');

    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'ai', 'index.js'), 'utf8');
    const iQuota = src.indexOf('consumeAiQuota');
    const iGlobal = src.indexOf('GLOBAL_DAILY');
    assert.ok(iQuota !== -1 && iGlobal !== -1, 'Không tìm thấy hai lớp kiểm quota');
    assert.ok(iQuota < iGlobal,
        'Phải kiểm quota CÁ NHÂN trước quota CHUNG — người đã hết lượt riêng không được tiêu lẹm ngân sách chung');
    assert.ok(/quota_global/.test(src), 'Thiếu lý do trả về riêng cho hết ngân sách chung');
    assert.ok(/refundAiQuota/.test(src.slice(iGlobal, iGlobal + 800)),
        'Chặn vì ngân sách chung thì phải HOÀN lượt cá nhân — chưa gọi API mà vẫn trừ là oan người dùng');
});

test('hạn mức toàn cục: thông điệp KHÔNG đổ lỗi cho người dùng', () => {
    for (const [ten, loc] of [['vi', vi], ['en', en]]) {
        const s = loc.common?.ai_quota_global;
        assert.ok(s && s.trim(), `${ten}.json thiếu common.ai_quota_global`);
    }
    // Ngân sách chung cạn không phải lỗi của người đang nhắn -> không được nói "cậu hết lượt".
    assert.ok(!/cậu đã dùng hết|cậu hết lượt/i.test(vi.common.ai_quota_global),
        'Thông điệp ngân sách CHUNG đang đổ lỗi cho người dùng — họ có thể chưa dùng lượt nào');
    assert.ok(!chuaTu(vi.common.ai_quota_global, ['tớ', 'tôi']), 'Sai xưng hô canon');
});

test('đo lường: cột đếm ngày tồn tại trong migration và có backfill', () => {
    const thuMuc = path.join(__dirname, '..', 'supabase', 'migrations');
    const file = fs.readdirSync(thuMuc).find(f => f.includes('affection_days'));
    assert.ok(file, 'Thiếu migration thêm affection_days');
    const sql = fs.readFileSync(path.join(thuMuc, file), 'utf8');
    assert.ok(/ADD COLUMN IF NOT EXISTS affection_days/i.test(sql), 'Thiếu lệnh thêm cột');
    assert.ok(/UPDATE users/i.test(sql) && /affection_days = 1/.test(sql),
        'Thiếu backfill — người đã có thiện cảm phải được tính ít nhất 1 ngày');
    assert.ok(/v_ngay_moi/.test(sql), 'Phải chốt cờ ngày-mới TRƯỚC khi reset v_date');
});

// Test này sinh ra từ một lỗi THẬT vừa mắc: bản đầu gọi `claimDailyCounter`, mà hàm đó trả
// -1 cho CẢ "hết hạn mức" LẪN "DB lỗi". Nơi gọi không phân biệt được, nên mỗi lần Supabase
// chập chờn là chặn hết người dùng — fail-CLOSED, trong khi comment ngay bên cạnh ghi
// "fail-open có chủ ý". Cùng lớp lỗi với getJailForAck đã sửa ở 6d67389.
test('hạn mức toàn cục: DB lỗi thì VẪN cho chat (fail-open)', async () => {
    const db = require('../src/database');
    const gemini = require('../src/lib/ai/gemini');
    const { chatWithWaguri } = require('../src/lib/ai');

    const goc = {
        quota: db.consumeAiQuota, global: db.claimAiGlobalQuota,
        chat: gemini.chat, aff: db.incrAffection, user: db.getUser,
    };
    try {
        db.consumeAiQuota = async () => ({ allowed: true, used: 1, cap: 15, premium: false });
        db.getUser = async () => null;
        db.incrAffection = async () => null;
        gemini.chat = async () => 'Chào cậu~';

        // null = KHÔNG đếm được (DB lỗi) -> phải cho qua
        db.claimAiGlobalQuota = async () => null;
        let res = await chatWithWaguri('c1', 'u_failopen', 'Tester', 'hi', 'vi');
        assert.strictEqual(res.ok, true, 'DB đếm lỗi mà lại chặn người dùng — phải fail-OPEN');

        // -1 = thật sự hết ngân sách chung -> phải chặn
        db.claimAiGlobalQuota = async () => -1;
        res = await chatWithWaguri('c2', 'u_failopen2', 'Tester', 'hi', 'vi');
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.reason, 'quota_global', 'Hết ngân sách chung phải có lý do riêng');
    } finally {
        db.consumeAiQuota = goc.quota; db.claimAiGlobalQuota = goc.global;
        gemini.chat = goc.chat; db.incrAffection = goc.aff; db.getUser = goc.user;
    }
});

// ── Chỉ đường khi @mention sai kênh ──────────────────────────────────────────────────────
// Đo 2026-08-19: 59% lượt tham gia server nằm ở server AI bị TẮT, 20% ở server giới hạn AI
// vào một kênh. Nhóm thứ hai @mention Waguri ở kênh thường và trước đây không nhận được GÌ —
// ba lệnh `return` im lặng liên tiếp trong messageCreate. Im lặng đọc như bot hỏng.
test('sai kênh: chỉ đường thay vì im lặng, và KHÔNG đụng nhánh AI tắt', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'events', 'messageCreate.js'), 'utf8');

    const iTat = src.indexOf("gs.ai_enabled === '0'");
    const iKenh = src.indexOf('gs.ai_channel && gs.ai_channel !== message.channelId');
    assert.ok(iTat !== -1 && iKenh !== -1, 'Không tìm thấy hai chốt chặn AI theo server');

    // AI bị admin TẮT -> phải im lặng. Bot đáp "tớ không được nói ở đây" chính là đang nói.
    const nhanhTat = src.slice(iTat, iKenh);
    assert.ok(/return;/.test(nhanhTat), 'Nhánh AI-tắt phải return');
    assert.ok(!/message.reply/.test(nhanhTat),
        'Nhánh AI-tắt KHÔNG được trả lời — đó là quyết định có chủ ý của admin');

    // Sai kênh -> phải chỉ đường
    const nhanhKenh = src.slice(iKenh, iKenh + 1400);
    assert.ok(/ai_wrong_channel/.test(nhanhKenh), 'Sai kênh phải dùng chuỗi chỉ đường trong locale');
    assert.ok(/nhacKenhCD/.test(nhanhKenh), 'Phải có tiết chế — không thì @mention liên tục sẽ bị dội lại liên tục');
    assert.ok(/channels.cache.get/.test(nhanhKenh),
        'Phải kiểm kênh còn tồn tại — kênh đã xoá thì chỉ đường ra link hỏng, thà im lặng');
    assert.ok(/allowedMentions/.test(nhanhKenh), 'Phải chặn mention để không bị mồi tag hàng loạt');
});

test('sai kênh: chuỗi chỉ đường có chỗ chèn kênh và đúng xưng hô', () => {
    for (const [ten, loc] of [['vi', vi], ['en', en]]) {
        const s = loc.common?.ai_wrong_channel;
        assert.ok(s && s.trim(), `${ten}.json thiếu common.ai_wrong_channel`);
        assert.ok(s.includes('{channel}'), `${ten}: thiếu {channel} thì người ta không biết đi đâu`);
    }
    assert.ok(!chuaTu(vi.common.ai_wrong_channel, ['tớ', 'tôi']), 'Sai xưng hô canon');
    // Dùng chuaTu (đã xử lý đúng tiếng Việt + không phân biệt hoa thường) thay cho regex tay:
    // bản đầu viết /mình/ THIẾU cờ i nên không khớp chữ "Mình" viết hoa.
    assert.ok(chuaTu(vi.common.ai_wrong_channel, ['mình']), 'Phải xưng "mình"');
});

// ── Bảng theo dõi AI cho chủ dự án ───────────────────────────────────────────────────────
// Server lớn nhất (193 người) TẮT AI suốt 5 ngày mà không ai biết — chỉ lộ khi có người ngồi
// chạy SQL tay. Thứ không ai NHÌN THẤY thì không ai sửa. Đó là lý do khối này tồn tại.
test('tổng quan AI: RPC có trong migration và khoá quyền đúng', () => {
    const thuMuc = path.join(__dirname, '..', 'supabase', 'migrations');
    const file = fs.readdirSync(thuMuc).find(f => f.includes('ai_overview'));
    assert.ok(file, 'Thiếu migration ai_overview');
    const sql = fs.readFileSync(path.join(thuMuc, file), 'utf8');

    assert.ok(/security definer/i.test(sql), 'Phải SECURITY DEFINER để đọc được xuyên RLS');
    assert.ok(/set search_path/i.test(sql), 'SECURITY DEFINER phải ghim search_path');
    assert.ok(/revoke all on function public\.ai_overview\(\) from public, anon, authenticated/i.test(sql),
        'Hàm này lộ số liệu toàn hệ thống — phải REVOKE khỏi anon/authenticated');
    assert.ok(/grant execute on function public\.ai_overview\(\) to service_role/i.test(sql),
        'Phải GRANT cho service_role');
    assert.ok(/\bstable\b/i.test(sql), 'Chỉ đọc thì nên khai STABLE');
    assert.ok(/server_tat_ai/.test(sql), 'Thiếu mục quan trọng nhất: server đang TẮT AI');
});

test('tổng quan AI: được nối vào /eco-admin report (không cần lệnh mới)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'admin', 'eco-admin.js'), 'utf8');
    assert.ok(/db\.aiOverview\(\)/.test(src), 'report chưa gọi db.aiOverview()');
    assert.ok(/server_tat_ai/.test(src), 'report chưa hiện danh sách server tắt AI');
    assert.ok(/GLOBAL_DAILY/.test(src), 'report chưa hiện ngân sách chung đã dùng');

    // Phải chịu được aiOverview trả null (DB lỗi) mà không làm vỡ cả report.
    assert.ok(/if \(ai\) \{/.test(src),
        'Phải bọc trong nhánh if (ai) — aiOverview trả null khi DB lỗi, không được làm hỏng report');

    const dbSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'database.js'), 'utf8');
    assert.ok(/^\s{4}aiOverview,$/m.test(dbSrc), 'database.js chưa export aiOverview');
});

// ── Ngôn ngữ trên đường @mention ─────────────────────────────────────────────────────────
// Lỗi thật quan sát được 2026-08-19 (ảnh chụp từ người dùng): cả cuộc trò chuyện tiếng Việt
// nhưng dòng lên bậc ra TIẾNG ANH, và dòng đánh dấu lẫn lộn "Closeness with Waguri: Quen biết".
//
// Gốc: đường @mention không có `interaction.locale` (chỉ slash command mới có), nên quyết định
// rơi xuống `guild.preferredLocale` — thứ Discord mặc định en-US cho gần như mọi server.
// 298/306 người có `users.locale` rỗng nên hầu hết đều dính.
test('ngôn ngữ: nhận diện tiếng Việt từ chính chữ người dùng gõ', () => {
    const { detectVietnamese } = require('../src/lib/i18n');
    // Có dấu -> khẳng định tiếng Việt
    assert.strictEqual(detectVietnamese('Hướng dẫn lam bùa yêu'), 'vi');
    assert.strictEqual(detectVietnamese('Cứ hướng dân ik t có bỏ bùa m đâu'), 'vi');
    // Không dấu -> KHÔNG kết luận (người Việt hay gõ không dấu) -> để bậc khác quyết
    assert.strictEqual(detectVietnamese('hello how are you'), null);
    assert.strictEqual(detectVietnamese('chao ban'), null);
    assert.strictEqual(detectVietnamese(''), null);
    assert.strictEqual(detectVietnamese(null), null);
});

test('ngôn ngữ: đường @mention truyền tín hiệu ngôn ngữ từ nội dung tin nhắn', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'events', 'messageCreate.js'), 'utf8');
    const iMention = src.indexOf('Trò chuyện AI khi @mention');
    assert.ok(iMention !== -1, 'Không tìm thấy nhánh @mention');
    // Neo tới đúng lời gọi chatWithWaguri thay vì đếm ký tự — khối 'chỉ đường sai kênh'
    // thêm sau đã đẩy dòng này ra xa và làm cửa sổ cố định trượt mất.
    const iChat = src.indexOf('chatWithWaguri(message.channelId', iMention);
    assert.ok(iChat !== -1, 'Không tìm thấy lời gọi chatWithWaguri trong nhánh @mention');
    const nhanh = src.slice(iMention, iChat);
    assert.ok(/detectVietnamese\(text\)/.test(nhanh),
        'Nhánh @mention phải suy ngôn ngữ từ CHỮ người dùng gõ — guild.preferredLocale mặc định en-US nên vô nghĩa');
});

test('ngôn ngữ: tên bậc có bản dịch, không viết cứng tiếng Việt', () => {
    for (const b of AFFECTION_TIERS) {
        for (const [ten, loc] of [['vi', vi], ['en', en]]) {
            const s = loc.lib?.ai?.tier_name?.[b.key];
            assert.ok(s && s.trim(), ten + '.json thiếu lib.ai.tier_name.' + b.key);
        }
    }
    // Bản EN không được lẫn tên tiếng Việt — đây chính là lỗi trong ảnh chụp.
    for (const b of AFFECTION_TIERS) {
        const enTen = en.lib.ai.tier_name[b.key];
        assert.ok(!chuaTu(enTen, ['Quen', 'Thân', 'Người', 'Bạn', 'Tri']),
            'Tên bậc EN còn tiếng Việt: ' + enTen);
    }
    // Nơi hiển thị phải TRA locale chứ không dùng thẳng .name
    const aiSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'ai', 'index.js'), 'utf8');
    assert.ok(/lib\.ai\.tier_name\./.test(aiSrc), 'ai/index.js chưa tra tên bậc qua locale');
    const profileSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'commands', 'economy', 'profile.js'), 'utf8');
    assert.ok(/lib\.ai\.tier_name\./.test(profileSrc), '/profile chưa tra tên bậc qua locale');
});
