// ============================================================
// test/ma_qua_noi_that.test.js — mã quà không được khoe thứ chưa xảy ra.
//
// VÌ SAO CỔNG NÀY TỒN TẠI. Hệ mã quà có ĐÚNG hình dạng của ba thứ đã hỏng trong repo này:
// `/worldevent claim`, `/achievements`, `/cosmetic badge-buy` — cả ba đều "đánh dấu đã nhận"
// rồi mới "trao thưởng" ở hai lời gọi rời nhau, và cả ba đều mất thưởng vĩnh viễn khi bước
// hai hỏng (vá ở 0141/0144). Mã quà mà đi lại đường đó thì hỏng nặng hơn, vì mã thường
// được phát cho nhiều người cùng lúc.
//
// SUY DANH SÁCH TRẠNG THÁI TỪ SQL, KHÔNG GHI CỨNG. Bài học `/deletedata`: RPC có 4 lý do
// chặn, lệnh chỉ xử 2, và người vướng lý do thứ 3 đọc được câu "có lỗi, thử lại sau" — sai
// hai lần. Ghi cứng 9 tên ở đây thì trạng thái thứ 10 sẽ lặp lại y nguyên vết xe đó mà cổng
// vẫn xanh. Đọc thẳng từ migration thì hôm thêm trạng thái là hôm cổng đỏ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'supabase', 'migrations');

const doc = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

/** Thân bản định nghĩa CUỐI CÙNG của một hàm, theo thứ tự số hiệu migration.
 *  (Hàm có thể bị `CREATE OR REPLACE` nhiều lần — đọc bản cũ là kết luận sai.) */
function thanHamMoiNhat(tenHam) {
    const tep = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
    let than = null, nguon = null;
    for (const f of tep) {
        const s = fs.readFileSync(path.join(MIG, f), 'utf8');
        const rx = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${tenHam}\\s*\\(`, 'i');
        const m = rx.exec(s);
        if (!m) continue;
        than = s.slice(m.index);
        nguon = f;
    }
    return { than, nguon };
}

/** Mọi trạng thái mà `jsonb_build_object('status', '...')` có thể trả về. */
function trangThaiDoiMa() {
    const { than, nguon } = thanHamMoiNhat('redeem_code_atomic');
    assert.ok(than, 'Không thấy migration nào định nghĩa redeem_code_atomic.');
    // Cắt tới hàm kế tiếp để không nuốt nhầm trạng thái của hàm khác.
    const ke = than.slice(200).search(/create\s+or\s+replace\s+function/i);
    const body = ke >= 0 ? than.slice(0, ke + 200) : than;
    const ds = [...new Set((body.match(/'status'\s*,\s*'([a-z_]+)'/gi) || [])
        .map(x => /'status'\s*,\s*'([a-z_]+)'/i.exec(x)[1]))].sort();
    return { ds, nguon };
}

// ── 1. Hợp đồng: mọi trạng thái đều có nhánh riêng ──────────────────────────────────
test('mọi trạng thái RPC trả về đều có nhánh riêng trong /redeem', () => {
    const { ds, nguon } = trangThaiDoiMa();
    assert.ok(ds.length >= 8,
        `Chỉ thấy ${ds.length} trạng thái trong ${nguon}: ${ds.join(', ')}. Kỳ vọng >= 8.\n`
        + 'Tụt số thường nghĩa là đang đọc nhầm một bản CREATE OR REPLACE cũ.');

    const js = doc('src', 'commands', 'economy', 'redeem.js');
    const thieu = ds.filter(s => s !== 'ok' && !new RegExp(`\\b${s}\\s*:`).test(js));
    assert.deepStrictEqual(thieu, [],
        `Trạng thái có trong SQL nhưng KHÔNG có nhánh trong redeem.js: ${thieu.join(', ')}.\n`
        + 'Thiếu nhánh nghĩa là người chơi rơi vào câu chung chung, sai lý do — đúng lỗi /deletedata.');

    // Trạng thái thứ 9 KHÔNG đến từ SQL: `error` là lúc chính DB chết, nên RPC không trả về
    // được gì cả. Nó vẫn phải có nhánh riêng, và câu chữ phải nói rõ "chưa bị trừ lượt" —
    // nếu không người chơi sẽ tưởng mất mã và đi kêu.
    assert.match(js, /\berror\s*:/, 'thiếu nhánh error — lúc DB chết lệnh sẽ nói gì?');
});

// ── 2. Mỗi nhánh phải có chữ, cả vi lẫn en ─────────────────────────────────────────
test('mọi trạng thái đều có bản dịch vi + en, không nhánh nào lộ raw key', () => {
    const { ds } = trangThaiDoiMa();
    const vi = JSON.parse(doc('src', 'locales', 'vi.json'));
    const en = JSON.parse(doc('src', 'locales', 'en.json'));
    for (const s of ds) {
        if (s === 'ok') continue;
        assert.ok(vi.commands?.redeem?.[s], `vi.json thiếu commands.redeem.${s}`);
        assert.ok(en.commands?.redeem?.[s], `en.json thiếu commands.redeem.${s}`);
    }
    assert.ok(vi.commands?.redeem?.ok && en.commands?.redeem?.ok, 'thiếu chuỗi thành công');
});

// ── 3. Trạng thái của đường TẠO mã cũng phải được nói đúng ─────────────────────────
test('mọi trạng thái của create_redeem_code đều có chữ trong /eco-admin', () => {
    const { than, nguon } = thanHamMoiNhat('create_redeem_code');
    assert.ok(than, 'Không thấy migration nào định nghĩa create_redeem_code.');
    const ke = than.slice(200).search(/create\s+or\s+replace\s+function/i);
    const body = ke >= 0 ? than.slice(0, ke + 200) : than;
    const ds = [...new Set((body.match(/RETURN\s+'([a-z_]+)'/gi) || [])
        .map(x => /'([a-z_]+)'/i.exec(x)[1]))].filter(s => s !== 'ok').sort();

    assert.ok(ds.length >= 7,
        `Chỉ thấy ${ds.length} trạng thái lỗi trong ${nguon}: ${ds.join(', ')}. Kỳ vọng >= 7.`);

    const vi = JSON.parse(doc('src', 'locales', 'vi.json'));
    const en = JSON.parse(doc('src', 'locales', 'en.json'));
    const thieu = ds.filter(s => !vi.commands?.['eco-admin']?.code?.[`err_${s}`]
                              || !en.commands?.['eco-admin']?.code?.[`err_${s}`]);
    assert.deepStrictEqual(thieu, [],
        `Thiếu chuỗi err_* cho: ${thieu.join(', ')}. Chủ bot sẽ đọc câu chung chung và\n`
        + 'không biết vì sao mã không tạo được.');
});

// ── 4. Trần thưởng phải nằm trong DB, không phải trong lệnh ────────────────────────
test('trần thưởng canh dưới DB (lệnh thì bỏ qua được, DB thì không)', () => {
    const { than } = thanHamMoiNhat('create_redeem_code');

    // Đọc CHÍNH con số của từng hằng, không dùng includes(): chuỗi '500000' chứa '50000',
    // nên `includes('50000')` vẫn xanh sau khi trần mỗi mã bị nới gấp 20 lần. Bẫy này đã
    // bắt được đúng bằng phép bẻ ngược, không phải bằng đọc lại code.
    const tran = (ten) => {
        const m = new RegExp(`${ten}\\s+CONSTANT\\s+\\w+\\s*:=\\s*(\\d+)`, 'i').exec(than);
        assert.ok(m, `Không thấy hằng ${ten} trong create_redeem_code.`);
        return Number(m[1]);
    };

    // Ngưỡng đã chốt ở docs/spec-ma-qua.md §4.1. Cổng canh chiều NỚI RA — siết chặt hơn thì
    // vẫn xanh, vì siết không bao giờ là tai nạn. Nới thì phải sửa cả spec lẫn cổng.
    assert.ok(tran('c_max_coins_per_code') <= 50000,
        `Trần xu mỗi mã đã bị nới lên ${tran('c_max_coins_per_code')} (đã chốt: <= 50.000).`);
    assert.ok(tran('c_max_coins_total') <= 500000,
        `Trần xu tổng đã bị nới lên ${tran('c_max_coins_total')} (đã chốt: <= 500.000).\n`
        + 'Cung tiền toàn bot ngày dựng tính năng này là 907.554 xu.');
    assert.ok(tran('c_max_premium_days') <= 90,
        `Trần ngày Premium đã bị nới lên ${tran('c_max_premium_days')} (đã chốt: <= 90).`);
    assert.match(than, /over_cap_coins/, 'thiếu chặn trần xu mỗi mã');
    assert.match(than, /over_cap_total/, 'thiếu chặn trần xu tổng');
    assert.match(than, /over_cap_premium/, 'thiếu chặn trần ngày Premium');
});

// ── 5. Nguyên tử: ghi nhận và trao KHÔNG được tách ra JS ───────────────────────────
test('ghi nhận đã-nhận và trao thưởng nằm trong CÙNG một hàm SQL', () => {
    const { than } = thanHamMoiNhat('redeem_code_atomic');
    const ke = than.slice(200).search(/create\s+or\s+replace\s+function/i);
    const body = ke >= 0 ? than.slice(0, ke + 200) : than;

    const iKhoa = body.search(/FOR\s+UPDATE/i);
    const iGhi = body.search(/INSERT\s+INTO\s+redeem_claims/i);
    const iTrao = body.search(/UPDATE\s+users\s+SET\s+wallet/i);
    assert.ok(iKhoa >= 0, 'thiếu FOR UPDATE — hai người đổi lượt cuối cùng có thể cùng qua');
    assert.ok(iGhi >= 0 && iTrao >= 0, 'không thấy cả bước ghi nhận lẫn bước trao trong cùng hàm');
    assert.ok(iKhoa < iGhi && iGhi < iTrao,
        'Thứ tự phải là: khoá -> ghi nhận -> trao, trong cùng một giao dịch.');

    // JS tuyệt đối không được tự ghép hai bước — đó chính là lỗi đã vá ba lần.
    const db = doc('src', 'database.js');
    assert.ok(!/from\(\s*['"]redeem_claims['"]\s*\)[\s\S]{0,200}insert/i.test(db),
        'database.js đang tự ghi redeem_claims — phải để RPC làm, nếu không sẽ tách giao dịch.');
    assert.ok(!/rpc\(\s*['"]redeem_code_atomic['"][\s\S]{0,400}rpc\(/.test(db),
        'database.js gọi thêm RPC sau redeem_code_atomic — đường trao thưởng đang bị tách.');
});

// ── 6. Cửa phải khoá (chốt chặn hồi quy; sự thật lấy từ DB đã kiểm riêng) ──────────
test('bốn hàm mới đều bị REVOKE khỏi khoá công khai', () => {
    const sql = doc('supabase', 'migrations', '0146_ma_qua.sql');
    for (const h of ['create_redeem_code', 'redeem_code_atomic', 'revoke_redeem_code', 'discord_account_created']) {
        const rx = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${h}[\\s\\S]{0,200}?FROM\\s+PUBLIC`, 'i');
        assert.match(sql, rx, `${h} chưa bị REVOKE khỏi PUBLIC — Postgres mặc định CHO PHÉP.`);
        assert.match(sql, new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${h}[\\s\\S]{0,200}?service_role`, 'i'),
            `${h} chưa được GRANT cho service_role — bot sẽ không gọi được.`);
    }
    assert.match(sql, /set_config\(\s*'app\.ledger_source'\s*,\s*'redeem'/i,
        'thiếu nhãn ledger — cú nhảy cung tiền sau này sẽ bị đọc nhầm thành exploit');
});

// ── 7-9. Chạy THẬT handler: không nhánh nào được khoe hão ──────────────────────────
const { makeInteraction, textOf, stubDb } = require('./helpers/mockInteraction');
const db = require('../src/database.js');
const { t } = require('../src/lib/i18n');

function chayRedeem(status, { userId = '300000000000000001', rewards } = {}) {
    const lenh = require('../src/commands/economy/redeem.js');
    const { interaction, calls } = makeInteraction({
        sub: null, options: { code: 'ABCD-1234' }, userId, locale: 'vi',
    });
    const hoan = stubDb(db, {
        redeemCode: async () => (status === 'ok' ? { status, rewards } : { status }),
        getItems: async () => [{ id: 'ca_chep', name: 'Cá Chép' }],
        getUser: async () => ({ user_id: userId, locale: 'vi' }),
        getGuildSettings: async () => ({}),
    });
    return lenh.execute(interaction).then(() => { hoan(); return { calls, text: textOf(calls) }; },
        e => { hoan(); throw e; });
}

test('tám nhánh hỏng: không nhánh nào nói thành công, và mỗi nhánh một câu khác nhau', async () => {
    const { ds } = trangThaiDoiMa();
    // 7 trạng thái từ chối do SQL báo + 1 trạng thái `error` chỉ sinh ra ở JS khi DB chết.
    const hong = [...ds.filter(s => s !== 'ok'), 'error'];
    assert.ok(hong.length >= 8, `chỉ có ${hong.length} nhánh hỏng, kỳ vọng >= 8`);

    const chuThanhCong = t('vi', 'commands.redeem.ok', { code: 'ABCD-1234' });
    const daThay = new Map();
    let i = 0;
    for (const s of hong) {
        // user id riêng cho từng ca: bộ đếm dò mã là theo người, không được lây sang ca khác.
        const { text } = await chayRedeem(s, { userId: `40000000000000000${i++}` });
        assert.ok(text.length > 0, `nhánh ${s} không trả lời gì cả`);
        assert.ok(!text.includes(chuThanhCong), `nhánh ${s} lại khoe câu thành công`);
        assert.ok(!/\+\d/.test(text), `nhánh ${s} có vẻ đang khoe phần thưởng: ${text}`);
        assert.ok(!daThay.has(text),
            `nhánh ${s} nói y hệt nhánh ${daThay.get(text)} — người chơi không biết lý do thật.`);
        daThay.set(text, s);
    }
});

test('nhánh ok: khoe đúng thứ RPC xác nhận đã trao, không thừa không thiếu', async () => {
    const { text } = await chayRedeem('ok', {
        userId: '500000000000000001',
        rewards: { coins: 1234, items: [{ id: 'ca_chep', qty: 2 }], premium_days: 7 },
    });
    assert.match(text, /1[.,]234/, 'không thấy số xu đã trao');
    assert.match(text, /Cá Chép/, 'không thấy tên vật phẩm đã trao');
    assert.match(text, /7/, 'không thấy số ngày Premium đã trao');
});

test('không khoe phần thưởng mà RPC không trả về', async () => {
    const { text } = await chayRedeem('ok', { userId: '500000000000000002', rewards: { coins: 500 } });
    assert.ok(!/Premium/i.test(text), 'khoe Premium trong khi mã không cho Premium');
    assert.ok(!/Cá Chép/.test(text), 'khoe vật phẩm trong khi mã không cho vật phẩm');
});

test('defer chạy TRƯỚC khi chạm DB (18/81 lệnh từng phạm lỗi này)', async () => {
    const js = doc('src', 'commands', 'economy', 'redeem.js');
    const iDefer = js.indexOf('deferReply');
    const iDb = js.search(/await\s+db\./);
    assert.ok(iDefer >= 0 && iDb >= 0, 'không thấy defer hoặc lời gọi db');
    assert.ok(iDefer < iDb, 'có await db.* TRƯỚC deferReply — lệnh sẽ hết hạn 3 giây.');

    const { calls } = await chayRedeem('not_found', { userId: '500000000000000003' });
    assert.strictEqual(calls[0].kind, 'deferReply', 'lời gọi đầu tiên phải là deferReply');
});

test('dò mã bằng máy bị chặn sau 5 lần sai', async () => {
    const u = '600000000000000001';
    for (let i = 0; i < 5; i++) await chayRedeem('not_found', { userId: u });
    const { text } = await chayRedeem('not_found', { userId: u });
    assert.strictEqual(text, t('vi', 'commands.redeem.too_many_tries'),
        'lần thứ 6 vẫn cho thử — bộ đếm dò mã không có tác dụng');

    // Người khác KHÔNG bị vạ lây.
    const khac = await chayRedeem('not_found', { userId: '600000000000000002' });
    assert.notStrictEqual(khac.text, t('vi', 'commands.redeem.too_many_tries'),
        'bộ đếm đang chặn nhầm người khác');
});
