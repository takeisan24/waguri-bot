// ============================================================
// lib/banBuild.js — Danh tính BẢN DỰNG đang chạy: phiên bản, commit, mốc khởi động.
//
// VÌ SAO CÓ. Ngày 24-08-2026 prod chạy **44 commit CŨ** suốt nhiều ngày mà không ai biết:
// `git reset --hard && git pull` trong lệnh khởi động trượt im lặng vì còn sót
// `.git/index.lock`, và `&&` khiến cả chuỗi dừng ở đó. Bot vẫn chạy, vẫn trả lời, vẫn
// "OK 🌸" ở health check — chỉ là chạy mã cũ.
//
// Nó chỉ lộ ra khi đối chiếu TAY một chuỗi log khởi động với mã trong repo. Nghĩa là câu
// hỏi "prod có đang chạy bản mình vừa push không" trước nay **không trả lời được từ xa**.
// Sau bản này thì trả lời được bằng một lệnh `curl`.
//
// TÍNH MỘT LẦN lúc nạp module. `git rev-parse` là một lời gọi tiến trình con — nó tuyệt
// đối không được nằm trên đường phục vụ HTTP, nơi mỗi mili-giây đều thuộc về người dùng.
//
// KHÔNG CÓ GIT thì trả `null` chứ không ném lỗi: bản dựng đóng gói sẵn (Docker gọn, tải
// zip) không mang theo thư mục `.git`. Lúc đó `version` vẫn còn, và vẫn hơn không có gì.
// ============================================================
const { execSync } = require('node:child_process');
const path = require('node:path');

const KHOI_DONG = new Date();
const VERSION = require('../../package.json').version;

/**
 * Mã commit ngắn của bản đang chạy, hoặc `null` nếu không xác định được.
 *
 * Ưu tiên biến môi trường trước `git`: nền tảng nào build sẵn rồi mới đẩy lên (Docker, CI)
 * thì thư mục `.git` không còn ở đó, nhưng chúng thường bơm sẵn mã commit vào env.
 */
function docCommit() {
    const tuEnv = process.env.GIT_COMMIT
        || process.env.SOURCE_COMMIT
        || process.env.RAILWAY_GIT_COMMIT_SHA
        || process.env.VERCEL_GIT_COMMIT_SHA;
    if (tuEnv) return String(tuEnv).trim().slice(0, 7) || null;

    try {
        const ra = execSync('git rev-parse --short HEAD', {
            cwd: path.join(__dirname, '..', '..'),
            encoding: 'utf8',
            // Nuốt stderr: repo không phải git thì `git` in ra lời than dài, không cần thấy.
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3000,
        }).trim();
        return ra || null;
    } catch {
        return null;
    }
}

const COMMIT = docCommit();

/**
 * Danh tính bản dựng, dạng object để nhét thẳng vào JSON trả về.
 *
 * `startedAt` + `uptimeSec` cùng có mặt là CỐ Ý và là nửa quan trọng của cả tệp này: biết
 * "đang chạy commit nào" mới trả lời được nửa câu. Nửa còn lại là "đã khởi động lại chưa" —
 * nếu vừa bấm restart mà `uptimeSec` vẫn là 40.000 thì lần restart đó không hề xảy ra.
 */
function banBuild() {
    return {
        version: VERSION,
        commit: COMMIT,
        startedAt: KHOI_DONG.toISOString(),
        uptimeSec: Math.floor((Date.now() - KHOI_DONG.getTime()) / 1000),
    };
}

module.exports = { banBuild, VERSION, COMMIT, KHOI_DONG };
