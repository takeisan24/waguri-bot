// ============================================================
// scripts/check-sql-policy.js — Gate TĨNH cho tầng DB.
//
// LÝ DO TỒN TẠI: các luật ở AGENTS.md §2 (nguyên tử, least-privilege, idempotent,
// migration đánh số tăng) trước nay chỉ là VĂN XUÔI. Chúng đã bị vi phạm lặp lại:
//   • thiếu FOR UPDATE  -> vá ở 0087 (sell_item), 0089 (auction_create),
//                          0095_audit (market_list) rồi TÁI PHÁT ở 0095_market.
//   • GRANT cho anon    -> 0054 viết hẳn cảnh báo, 18 migration sau vi phạm y hệt.
//   • số migration trùng-> luật ghi "đánh số tăng dần", thực tế trùng 6 cặp.
// Luật nào đã bị vi phạm 2 lần thì phải thành `exit 1`, không phải thành đoạn văn dài hơn.
//
// CƠ CHẾ RATCHET (giống test/i18n-known-missing.json): vi phạm CŨ được ghi vào
// scripts/sql-policy-allowlist.json để gate xanh ngay hôm nay mà không phải sửa 97 file
// di sản. Gate CHỈ chặn vi phạm MỚI. Muốn trả nợ dần: xoá bớt dòng trong allowlist.
//
// Dùng:  node scripts/check-sql-policy.js
//        node scripts/check-sql-policy.js --update-allowlist   (ghi lại baseline)
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const ALLOW_PATH = path.join(__dirname, 'sql-policy-allowlist.json');

// Bảng mà thao tác đọc-rồi-ghi KHÔNG nguyên tử sẽ gây dupe tiền/vật phẩm.
const CRITICAL_TABLES = new Set([
    'users', 'inventory', 'market_listings', 'auctions', 'battle_pass_users',
    'user_pets', 'clans', 'quest_progress', 'pigs', 'plants', 'bakeries',
    'loans', 'game_stakes', 'lottery_tickets', 'xoso_bets', 'daily_counters',
]);

const MUTATING_RE = /\b(insert\s+into|update\s+\w|delete\s+from)\b/i;

// --- Tiện ích ------------------------------------------------

/** Bỏ comment SQL để không quét nhầm luật nằm trong ghi chú (vd dòng ROLLBACK ở 0054). */
function stripComments(sql) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--[^\n]*/g, ' ');
}

/**
 * Bỏ phần THÂN của mọi khối dollar-quote ($$ … $$, $function$ … $function$).
 *
 * Chỉ dùng cho R5 (DDL idempotent): luật đó nói về DDL ở CẤP CAO NHẤT của migration,
 * còn chữ nằm trong thân hàm thì không phải DDL. Không có bước này, `0112` bị báo
 * "CREATE TABLE thiếu IF NOT EXISTS" chỉ vì thân hàm có chuỗi
 * `command_tag IN ('CREATE TABLE', ...)` — một CHUỖI VĂN BẢN, không tạo bảng nào.
 *
 * Cùng lớp lỗi với vụ `check-rpc-status.js` từng đếm nhầm status nằm trong comment:
 * gate đọc văn bản thô thì phải loại bỏ mọi vùng "chỉ là chữ" trước khi kết luận.
 */
function stripDollarQuotedBodies(sql) {
    return sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ');
}

/**
 * Tách các định nghĩa hàm theo dollar-quote ($$ … $$ hoặc $function$ … $function$).
 * Trả [{ name, args, header, body }] — header là phần trước dollar-quote (chứa
 * SECURITY DEFINER / SET search_path), body là thân hàm.
 */
function extractFunctions(sql) {
    const out = [];
    const re = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(([^)]*)\)/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
        const name = m[1].replace(/^public\./i, '');
        const rest = sql.slice(m.index);
        const open = rest.match(/\$([\w]*)\$/);
        if (!open) continue;
        const tag = open[0];
        const bodyStart = rest.indexOf(tag) + tag.length;
        const bodyEnd = rest.indexOf(tag, bodyStart);
        if (bodyEnd === -1) continue;
        out.push({
            name,
            args: m[2].trim(),
            header: rest.slice(0, rest.indexOf(tag)),
            body: rest.slice(bodyStart, bodyEnd),
        });
    }
    return out;
}

/** Cắt thân hàm thành từng câu lệnh (thô, theo dấu ;) để soi từng SELECT … INTO. */
function statements(body) {
    return body.split(';').map(s => s.trim()).filter(Boolean);
}

// --- Thu thập vi phạm ----------------------------------------

const files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql')).sort();
const violations = [];
const add = (file, rule, detail) => violations.push({ file, rule, detail });

// Chỉ mục toàn cục: tên hàm -> có ghi dữ liệu không (gộp mọi phiên bản định nghĩa).
const mutatingFns = new Set();
const parsed = new Map();
for (const f of files) {
    const sql = stripComments(fs.readFileSync(path.join(MIG_DIR, f), 'utf8'));
    const fns = extractFunctions(sql);
    parsed.set(f, { sql, fns });
    for (const fn of fns) {
        if (MUTATING_RE.test(fn.body)) mutatingFns.add(fn.name.toLowerCase());
    }
}

// ---------- R1: số migration trùng ----------
// `supabase db reset` apply theo THỨ TỰ TÊN FILE. Trùng số => thứ tự tái tạo DB
// không còn khớp thứ tự đã apply lên prod => rebuild-from-scratch không tin cậy.
const byNumber = new Map();
for (const f of files) {
    const m = f.match(/^(\d{4}[a-z]?)_/);
    if (!m) { add(f, 'R1_bad_filename', 'tên file không theo dạng 00NN_mo_ta.sql'); continue; }
    if (!byNumber.has(m[1])) byNumber.set(m[1], []);
    byNumber.get(m[1]).push(f);
}
for (const [num, group] of byNumber) {
    if (group.length > 1) {
        for (const f of group) add(f, 'R1_duplicate_number', `số ${num} dùng bởi: ${group.join(', ')}`);
    }
}

// ---------- R1b: số migration trùng GIỮA CÁC WORKTREE ----------
// R1 ở trên chỉ nhìn thư mục migration của CÂY ĐANG ĐỨNG. Với nhiều phiên làm song song trên
// nhiều worktree, đó là điểm mù có hệ thống: mỗi cây chỉ thấy số của mình nên đều XANH, và
// nó chỉ nổ lúc ai đó rebase — tức người viết sau phải làm lại sau khi đã viết xong.
//
// Đã suýt xảy ra thật (2026-08-24): cây chính có `0141_thanh_tuu_gop_giao_dich.sql` trong khi
// worktree `emdash/pet-update-4o8` có `0141_pet_rarity_ascend_hatch.sql`. Cả hai cổng đều
// xanh. Đây đúng hạng lỗi đã gây sự cố chợ tháng 8 — trùng số làm file không bao giờ được
// áp, kết quả là bán mọi thứ 500 xu.
//
// CÙNG số + CÙNG tên = không sao (chỉ là cùng một migration có mặt ở hai cây).
// CÙNG số + KHÁC tên = va chạm thật, chặn ngay.
//
// Hỏng ở bước nào cũng bỏ qua im lặng: không có git, không có worktree nào, hay CI chạy trong
// bản chép rời — cổng này KHÔNG được cản trở luồng bình thường.
try {
    const { execFileSync } = require('node:child_process');
    const ra = execFileSync('git', ['worktree', 'list', '--porcelain'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    const duongDan = ra.split('\n')
        .filter(l => l.startsWith('worktree '))
        .map(l => l.slice('worktree '.length).trim())
        .filter(Boolean)
        .filter(d => path.resolve(d) !== path.resolve(ROOT));

    for (const cay of duongDan) {
        const thuMuc = path.join(cay, 'supabase', 'migrations');
        let khac;
        try {
            khac = fs.readdirSync(thuMuc).filter(f => f.endsWith('.sql'));
        } catch { continue; }                       // worktree không có thư mục này -> bỏ qua

        const theoSo = new Map();
        for (const f of khac) {
            const m = f.match(/^(\d{4}[a-z]?)_/);
            if (m) theoSo.set(m[1], f);
        }
        for (const [num, group] of byNumber) {
            const kia = theoSo.get(num);
            if (!kia) continue;
            if (group.includes(kia)) continue;      // cùng số CÙNG tên -> cùng một migration
            for (const f of group) {
                add(f, 'R1_duplicate_number_worktree',
                    `số ${num} cũng đang được dùng bởi \`${kia}\` ở worktree ${cay}`);
            }
        }
    }
} catch { /* không có git / lệnh hỏng -> bỏ qua */ }

for (const f of files) {
    const { sql, fns } = parsed.get(f);

    for (const fn of fns) {
        const sig = `${fn.name}(${fn.args.split(',').length} args)`;

        // ---------- R2: SECURITY DEFINER thiếu SET search_path ----------
        // Hàm SECURITY DEFINER chạy bằng quyền chủ sở hữu; không pin search_path thì
        // kẻ tấn công tạo object trùng tên ở schema khác để chiếm quyền (0055 §A).
        if (/security\s+definer/i.test(fn.header) && !/set\s+search_path/i.test(fn.header)) {
            add(f, 'R2_secdef_no_search_path', sig);
        }

        // ---------- R3: đọc-rồi-ghi không khoá hàng ----------
        // SELECT … INTO (không FOR UPDATE) rồi UPDATE/DELETE cùng bảng = TOCTOU:
        // 2 lời gọi song song cùng qua cửa kiểm tra => dupe tiền/vật phẩm.
        const writesTo = new Set();
        for (const t of CRITICAL_TABLES) {
            const w = new RegExp(`\\b(?:update\\s+(?:public\\.)?${t}\\b|delete\\s+from\\s+(?:public\\.)?${t}\\b)`, 'i');
            if (w.test(fn.body)) writesTo.add(t);
        }
        for (const st of statements(fn.body)) {
            if (!/\bselect\b[\s\S]*\binto\b/i.test(st)) continue;
            if (/\bfor\s+update\b/i.test(st)) continue;
            const from = st.match(/\bfrom\s+(?:public\.)?(\w+)/i);
            if (!from) continue;
            const table = from[1].toLowerCase();
            if (writesTo.has(table)) {
                add(f, 'R3_read_then_write_no_lock', `${sig} đọc ${table} không FOR UPDATE rồi ghi lại`);
            }
        }
    }

    // ---------- R4: cấp quyền RPC ghi dữ liệu cho anon/authenticated ----------
    // anon key nằm công khai trong bundle web. RPC SECURITY DEFINER nhận user_id từ
    // tham số => bất kỳ ai cũng thao tác trên tài khoản người khác (đúng lớp lỗ hổng
    // mà 0054 được viết ra để đóng).
    const grantRe = /grant\s+execute\s+on\s+function\s+([\w.]+)\s*\(([^)]*)\)\s*to\s+([^;]+)/gi;
    let g;
    while ((g = grantRe.exec(sql)) !== null) {
        const fname = g[1].replace(/^public\./i, '').toLowerCase();
        const roles = g[3].toLowerCase();
        const exposed = /\banon\b/.test(roles) || /\bauthenticated\b/.test(roles) || /\bpublic\b/.test(roles);
        if (exposed && mutatingFns.has(fname)) {
            add(f, 'R4_grant_write_rpc_to_anon', `${fname} -> ${roles.trim()}`);
        }
    }

    // ---------- R6: cấp quyền GHI trên BẢNG cho anon/authenticated ----------
    // 89 RPC ghi dữ liệu đang cho anon gọi được (mặc định của Postgres: hàm được GRANT
    // cho PUBLIC). Chúng KHÔNG khai thác được — đã thử `SET ROLE anon` rồi gọi
    // increment_balance: "permission denied for table users". Toàn bộ lớp bảo vệ đó
    // nằm ở quyền BẢNG (0055/0103 revoke sạch khỏi anon).
    // => Chỉ cần một migration cấp lại quyền ghi bảng cho anon là 89 hàm kia sống dậy.
    // 0095_market đã từng GRANT SELECT cho anon (đọc thì vô hại), nên rủi ro là thật.
    const tableGrantRe = /grant\s+([\w\s,]+?)\s+on\s+(?:table\s+)?(?:public\.)?(\w+)\s+to\s+([^;]+)/gi;
    let tg;
    while ((tg = tableGrantRe.exec(sql)) !== null) {
        const privs = tg[1].toLowerCase();
        const table = tg[2];
        const roles = tg[3].toLowerCase();
        if (/\bfunction\b/.test(tg[0].toLowerCase())) continue;   // R4 lo phần hàm
        const exposed = /\banon\b|\bauthenticated\b|\bpublic\b/.test(roles);
        const writes = /\ball\b|\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/.test(privs);
        if (exposed && writes) add(f, 'R6_table_write_grant_to_anon', `${table} <- ${privs.trim()} cho ${roles.trim()}`);
    }

    // ---------- R5: DDL không idempotent ----------
    // Luật 3: migration phải chạy lại được mà không lỗi (rebuild / apply lại).
    // Soi trên bản ĐÃ BỎ THÂN HÀM: chữ trong thân hàm là chuỗi văn bản, không phải DDL.
    const ddl = stripDollarQuotedBodies(sql);
    if (/create\s+table\s+(?!if\s+not\s+exists)/i.test(ddl)) add(f, 'R5_not_idempotent', 'CREATE TABLE thiếu IF NOT EXISTS');
    if (/create\s+index\s+(?!if\s+not\s+exists|concurrently)/i.test(ddl)) add(f, 'R5_not_idempotent', 'CREATE INDEX thiếu IF NOT EXISTS');
    if (/create\s+function\s/i.test(ddl)) add(f, 'R5_not_idempotent', 'CREATE FUNCTION thiếu OR REPLACE');
}

// --- Đối chiếu allowlist (ratchet) ---------------------------

const key = v => `${v.file}::${v.rule}::${v.detail}`;
const allow = fs.existsSync(ALLOW_PATH)
    ? JSON.parse(fs.readFileSync(ALLOW_PATH, 'utf8'))
    : { note: '', entries: [] };
const allowSet = new Set(allow.entries || []);

if (process.argv.includes('--update-allowlist')) {
    const entries = [...new Set(violations.map(key))].sort();
    fs.writeFileSync(ALLOW_PATH, JSON.stringify({ note: allow.note, entries }, null, 2) + '\n');
    console.log(`✍️  Đã ghi baseline: ${entries.length} mục vào ${path.relative(ROOT, ALLOW_PATH)}`);
    process.exit(0);
}

const fresh = violations.filter(v => !allowSet.has(key(v)));
const RULE_HINT = {
    R1_duplicate_number: 'Đổi tên file sang số kế tiếp CHƯA dùng (chỉ với migration chưa apply prod).',
    R1_duplicate_number_worktree: 'Hai worktree đang cùng dùng một số migration. Bên nào CHƯA áp lên test/prod thì đổi số — thống nhất với phiên kia trước khi đẩy.',
    R2_secdef_no_search_path: 'Thêm  SET search_path = pg_catalog, public  vào phần khai báo hàm.',
    R3_read_then_write_no_lock: 'Thêm FOR UPDATE vào câu SELECT … INTO + guard row-count sau khi ghi.',
    R4_grant_write_rpc_to_anon: 'REVOKE khỏi public/anon/authenticated, chỉ GRANT cho service_role.',
    R5_not_idempotent: 'Dùng IF NOT EXISTS / CREATE OR REPLACE.',
    R6_table_write_grant_to_anon: 'KHÔNG cấp quyền GHI bảng cho anon/authenticated — đó là lớp duy nhất chặn 89 RPC ghi dữ liệu vốn PUBLIC gọi được.',
};

console.log(`Quét ${files.length} migration · ${violations.length} vi phạm (${allowSet.size} đã ghi nhận trong allowlist)`);

if (!fresh.length) {
    console.log('✅ Không có vi phạm MỚI nào so với baseline.');
    process.exit(0);
}

console.error(`\n❌ ${fresh.length} vi phạm MỚI — không được commit:\n`);
const grouped = new Map();
for (const v of fresh) {
    if (!grouped.has(v.rule)) grouped.set(v.rule, []);
    grouped.get(v.rule).push(v);
}
for (const [rule, list] of grouped) {
    console.error(`  [${rule}]  ${RULE_HINT[rule] || ''}`);
    for (const v of list) console.error(`     · ${v.file} — ${v.detail}`);
    console.error('');
}
console.error('Nếu vi phạm là CỐ Ý và đã cân nhắc: node scripts/check-sql-policy.js --update-allowlist');
process.exit(1);
