// ============================================================
// scripts/check-rpc-status.js — Chặn khoảng hở giữa RPC và tầng lệnh.
//
// LỖI ĐÃ XẢY RA: migration `0095_audit` siết `market_list` (thêm FOR UPDATE + guard)
// và thêm status trả về MỚI là `bad_qty`. Không lệnh nào biết status đó — vì đúng lúc
// ấy file lệnh /market đã bị commit baf61de xoá mất. Khi khôi phục lệnh, code rơi
// thẳng xuống embed THÀNH CÔNG ("đã đăng bán ... mã #undefined") dù RPC đã từ chối.
// Đường slash được setMinValue(1) che, nhưng prefix (`w!market list go 500 0`) thì không.
//
// Cùng lớp lỗi cũng làm `/prestige` treo im lặng: RPC trả `no_user`, không nhánh nào
// khớp, callback kết thúc mà không ack -> "This interaction failed".
//
// CÁCH LÀM (tĩnh, KHÔNG cần DB — chạy được trong CI mọi lúc):
//   migration   -> mỗi RPC có thể trả những status nào (định nghĩa sau đè trước)
//   database.js -> helper nào gọi RPC nào
//   commands/lib-> file nào gọi helper nào, và có nhắc tới status đó không
//
// RATCHET: có những mẫu XỬ LÝ HỢP LỆ mà kiểm tra tĩnh không thể thấy —
//   · kiểm phủ định:  `if (r.status !== 'ok')` gom hết mọi status lạ  (vay.js)
//   · cố ý bỏ qua:    chỉ hành động khi 'ok', status khác im lặng     (couple.js)
//   · dùng field khác: luồng dựa trên `res.claimed` chứ không phải status (newbie.js)
// Nên gate KHÔNG đòi mọi status phải xuất hiện; nó chốt hiện trạng vào
// `scripts/rpc-status-allowlist.json` và chỉ chặn khi có status MỚI chưa được biết tới —
// đúng kịch bản `bad_qty`.
//
// Dùng:  node scripts/check-rpc-status.js
//        node scripts/check-rpc-status.js --update
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'supabase', 'migrations');
const ALLOW = path.join(__dirname, 'rpc-status-allowlist.json');

// --- 1) migration -> rpc: [status...] ---
const rpcStatus = new Map();
for (const f of fs.readdirSync(MIG).filter(x => x.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(MIG, f), 'utf8').replace(/--[^\n]*/g, ' ');
    const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi;
    let m;
    while ((m = re.exec(sql)) !== null) {
        const rest = sql.slice(m.index);
        const open = rest.match(/\$(\w*)\$/);
        if (!open) continue;
        const tag = open[0];
        const s = rest.indexOf(tag) + tag.length;
        const e = rest.indexOf(tag, s);
        if (e === -1) continue;
        const statuses = new Set([...rest.slice(s, e).matchAll(/'status'\s*,\s*'([a-z_]+)'/gi)].map(x => x[1]));
        if (statuses.size) rpcStatus.set(m[1], [...statuses].sort());
    }
}

// --- 2) database.js -> helper: rpc ---
const dbSrc = fs.readFileSync(path.join(ROOT, 'src', 'database.js'), 'utf8');
const helperRpc = new Map();
const marks = [];
const fnRe = /async function (\w+)\s*\([^)]*\)\s*\{/g;
let fm;
while ((fm = fnRe.exec(dbSrc)) !== null) marks.push({ name: fm[1], at: fm.index });
for (let i = 0; i < marks.length; i++) {
    const body = dbSrc.slice(marks[i].at, marks[i + 1]?.at ?? dbSrc.length);
    const r = body.match(/\.rpc\(\s*'([a-z_]+)'/);
    if (r) helperRpc.set(marks[i].name, r[1]);
}

// --- 3) file gọi helper -> status nào được nhắc tới ---
function walk(dir, acc = []) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) walk(p, acc);
        else if (f.endsWith('.js')) acc.push(p);
    }
    return acc;
}
const callers = [...walk(path.join(ROOT, 'src', 'commands')), ...walk(path.join(ROOT, 'src', 'lib'))];

// Bỏ COMMENT trước khi quét. Nếu không, chỉ cần nhắc tên status trong một dòng ghi
// chú là gate coi như đã xử lý — chính tôi đã tự làm câm gate kiểu đó khi viết
// "(vd `no_user` từ RPC prestige_user)" vào comment của bản vá prestige.js.
// (^|[^:]) để không nuốt nhầm phần "//" trong URL https://...
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Nhận cả 2 cách viết: chuỗi `'notfound'` và khoá object `notfound:`
const mentions = (src, status) =>
    new RegExp('[\'"`]' + status + '[\'"`]|(^|[^\\w.])' + status + '\\s*:', 'm').test(src);

const found = {};
for (const file of callers) {
    const src = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const [helper, rpc] of helperRpc) {
        if (!new RegExp(`\\bdb\\.${helper}\\s*\\(|\\b${helper}\\s*\\(`).test(src)) continue;
        const statuses = rpcStatus.get(rpc);
        if (!statuses) continue;
        const unhandled = statuses.filter(s => s !== 'ok' && !mentions(src, s));
        if (unhandled.length) found[`${rel}::${rpc}`] = unhandled;
    }
}

// --- Ratchet ---
if (process.argv.includes('--update')) {
    const prev = fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')) : {};
    fs.writeFileSync(ALLOW, JSON.stringify({ note: prev.note || '', known: found }, null, 2) + '\n');
    console.log(`✍️  Đã chốt baseline: ${Object.keys(found).length} cặp (file, rpc).`);
    process.exit(0);
}

if (!fs.existsSync(ALLOW)) {
    console.error('❌ Thiếu baseline — chạy: node scripts/check-rpc-status.js --update');
    process.exit(1);
}
const known = JSON.parse(fs.readFileSync(ALLOW, 'utf8')).known || {};

const fresh = [];
for (const [key, statuses] of Object.entries(found)) {
    const before = new Set(known[key] || []);
    const added = statuses.filter(s => !before.has(s));
    if (added.length) fresh.push({ key, added });
}

console.log(`RPC có status: ${rpcStatus.size} · helper→rpc: ${helperRpc.size} · cặp (file,rpc) đang theo dõi: ${Object.keys(found).length}`);

if (!fresh.length) {
    console.log('✅ Không có status RPC MỚI nào chưa được tầng lệnh biết tới.');
    process.exit(0);
}

console.error('\n❌ RPC có status MỚI mà tầng lệnh chưa xử lý:\n');
for (const { key, added } of fresh) {
    const [file, rpc] = key.split('::');
    console.error(`   · ${file}`);
    console.error(`     [${rpc}] status mới: ${added.join(', ')}`);
}
console.error('\nĐây thường là do một migration mới thêm nhánh RETURN mà lệnh chưa biết.');
console.error('Kiểm tra xem lệnh có rơi xuống nhánh THÀNH CÔNG hay kết thúc mà KHÔNG ack không.');
console.error('Nếu đã xử lý bằng kiểm phủ định (`status !== \'ok\'`) hoặc cố ý bỏ qua:');
console.error('   node scripts/check-rpc-status.js --update');
process.exit(1);
