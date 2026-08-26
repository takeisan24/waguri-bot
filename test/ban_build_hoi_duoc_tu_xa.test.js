// ============================================================
// test/ban_build_hoi_duoc_tu_xa.test.js — phải hỏi được từ xa "prod đang chạy mã nào".
//
// VÌ SAO CÓ. Ngày 24-08-2026 prod chạy **44 commit CŨ** suốt nhiều ngày mà không ai biết.
// Lệnh khởi động có `git reset --hard && git pull`, nhưng còn sót `.git/index.lock` nên
// bước đầu ném lỗi và `&&` làm cả chuỗi dừng lại. Bot vẫn chạy, vẫn trả lời, health check
// vẫn "OK 🌸" — chỉ là chạy mã cũ.
//
// Nó chỉ lộ ra khi đối chiếu TAY một chuỗi log khởi động với mã trong repo. Cổng này giữ
// cho `/stats` luôn trả lời được câu đó bằng một lệnh `curl`.
//
// HAI NỬA CỦA CÂU TRẢ LỜI, cần cả hai:
//   · `commit`    — đang chạy MÃ NÀO
//   · `uptimeSec` — đã KHỞI ĐỘNG LẠI CHƯA. Vừa bấm restart mà uptime vẫn 40.000 giây thì
//                   lần restart đó không hề xảy ra — đúng kiểu hỏng của vụ 24-08.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const boCmt = s => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('banBuild trả đủ bốn mảnh, đúng kiểu', () => {
    const { banBuild } = require('../src/lib/banBuild');
    const b = banBuild();

    assert.strictEqual(typeof b.version, 'string', 'thiếu version');
    assert.match(b.version, /^\d+\.\d+\.\d+/, `version không đúng dạng semver: ${b.version}`);
    assert.ok(b.commit === null || /^[0-9a-f]{7,40}$/.test(b.commit),
        `commit phải là hex ngắn hoặc null, đang là: ${JSON.stringify(b.commit)}`);
    assert.ok(!Number.isNaN(Date.parse(b.startedAt)), 'startedAt phải parse được thành ngày');
    assert.strictEqual(typeof b.uptimeSec, 'number');
    assert.ok(b.uptimeSec >= 0, 'uptimeSec không được âm');
});

test('version khớp package.json, commit khớp git thật', () => {
    const { banBuild } = require('../src/lib/banBuild');
    const b = banBuild();

    assert.strictEqual(b.version, require('../package.json').version,
        'version phải lấy thẳng từ package.json, đừng chép tay số ở đâu khác.');

    let gitThat = null;
    try {
        gitThat = execSync('git rev-parse --short HEAD',
            { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    } catch { /* môi trường không có git (CI tải zip) -> bỏ qua nhánh này */ }

    if (gitThat) {
        assert.strictEqual(b.commit, gitThat,
            'commit báo ra không khớp HEAD thật — cả cổng này lẫn tính năng đều vô nghĩa nếu\n'
            + 'con số nó trả về không phải mã đang chạy.');
    }
});

test('KHÔNG gọi git trên đường phục vụ HTTP', () => {
    // `execSync` chặn cả event loop. Đặt nó trong `banBuild()` nghĩa là mỗi lượt gọi
    // `/stats` sẽ đẻ một tiến trình con — và `/stats` chính là thứ dịch vụ uptime gọi
    // liên tục. Phải tính MỘT LẦN lúc nạp module.
    const s = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'banBuild.js'), 'utf8'));

    assert.match(s, /const COMMIT = docCommit\(\);/,
        'Mã commit phải được tính một lần ở cấp module (`const COMMIT = docCommit()`).');

    const than = s.slice(s.indexOf('function banBuild()'));
    assert.doesNotMatch(than, /docCommit\(|execSync\(/,
        '`banBuild()` đang gọi git mỗi lượt. Nó nằm trên đường phục vụ HTTP — mỗi lượt\n'
        + '`/stats` sẽ đẻ một tiến trình con và chặn event loop.');
});

test('thiếu git thì trả null, tuyệt đối không ném lỗi', () => {
    // Bản dựng đóng gói sẵn (Docker gọn, tải zip) không mang theo thư mục `.git`. Ném lỗi
    // ở đây sẽ làm sập cả tiến trình lúc nạp module — đổi một tiện ích chẩn đoán lấy việc
    // bot không khởi động nổi là đánh đổi tệ nhất có thể.
    const s = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'banBuild.js'), 'utf8'));
    assert.match(s, /catch \{[\s\S]{0,60}return null;/,
        'docCommit() phải bọc try/catch và trả null khi không có git.');
    assert.match(s, /process\.env\.GIT_COMMIT/,
        'Phải ưu tiên biến môi trường trước git: nền tảng build sẵn không còn thư mục .git\n'
        + 'nhưng thường bơm mã commit vào env.');
});

test('/stats thật sự trả danh tính bản dựng ra ngoài', () => {
    const s = boCmt(fs.readFileSync(path.join(ROOT, 'src', 'lib', 'voteServer.js'), 'utf8'));

    assert.match(s, /require\('\.\/banBuild'\)/, 'voteServer.js phải nạp banBuild.');
    assert.match(s, /JSON\.stringify\(\{ servers, users, gatewayPing, \.\.\.banBuild\(\) \}\)/,
        '`/stats` phải trải `banBuild()` vào JSON trả về. Không có nó thì không còn đường nào\n'
        + 'hỏi prod đang chạy mã gì — đúng tình trạng đã để lọt 44 commit cũ.');
});
