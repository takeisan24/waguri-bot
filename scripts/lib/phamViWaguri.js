// ============================================================
// scripts/lib/phamViWaguri.js — "Đối tượng này có phải của Waguri không?"
//
// VÌ SAO CÓ: DB `waguri-test` dùng chung với một app khác của chủ dự án (bảng
// `invitations` của app thiệp hẹn, tạo 02/10/2026). Các cổng so lệch vì thế báo đỏ vĩnh
// viễn vì một thứ KHÔNG thuộc Waguri và không được phép xoá.
//
// Đây KHÔNG phải allowlist. Allowlist là liệt kê ngoại lệ bằng tay rồi quên dần (xem lời
// cảnh báo trong check-db-drift.js). Đây là ĐỊNH NGHĨA PHẠM VI, suy ra từ chính các file
// migration: "của Waguri" = có tên trong ít nhất một migration của repo. Cùng tinh thần với
// migration 0115 `fingerprint_only_our_objects` — vân tay schema chỉ soi đối tượng của mình.
//
// Hệ quả phải biết: một bảng/hàm do Waguri tạo TAY trên DB mà KHÔNG viết vào migration sẽ
// bị coi là ngoài phạm vi. Vì vậy các cổng in nó ra dưới dạng CẢNH BÁO chứ không im lặng —
// thấy tên lạ trong danh sách đó mà biết là của mình thì việc phải làm là viết migration.
// ============================================================
const fs = require('fs');
const path = require('path');
const { bocObject } = require('./sqlObjects');

const MIG_DIR = path.join(__dirname, '..', '..', 'supabase', 'migrations');

const chuanHoa = s => String(s).replace(/^public\./i, '').replace(/["']/g, '').toLowerCase();

let cache = null;

/**
 * Tập tên đối tượng mà các migration của Waguri có nhắc tới (tạo HOẶC xoá).
 * Tính cả lệnh xoá là CỐ Ý: bảng ta đã drop ở prod mà test vẫn còn thì vẫn là độ lệch
 * THẬT của Waguri, phải chặn — không được rơi ra ngoài phạm vi.
 * @returns {{table:Set<string>, function:Set<string>, index:Set<string>, event_trigger:Set<string>}}
 */
function phamViWaguri() {
    if (cache) return cache;
    const ra = { table: new Set(), function: new Set(), index: new Set(), event_trigger: new Set() };
    let files = [];
    try {
        files = fs.readdirSync(MIG_DIR).filter(f => f.endsWith('.sql'));
    } catch {
        return ra; // không đọc được thư mục migration -> phạm vi rỗng, mọi thứ "ngoài phạm vi"
    }
    for (const f of files) {
        let sql = '';
        try { sql = fs.readFileSync(path.join(MIG_DIR, f), 'utf8'); } catch { continue; }
        for (const o of bocObject(sql)) {
            if (ra[o.loai]) ra[o.loai].add(chuanHoa(o.ten));
        }
    }
    cache = ra;
    return ra;
}

/**
 * @param {'table'|'function'|'index'|'event_trigger'} loai
 * @param {string} ten tên thô; với hàm có thể kèm chữ ký `ten(a, b)` — sẽ tự cắt.
 * @returns {boolean} true nếu thuộc phạm vi Waguri (hoặc không rõ loại -> mặc định true để
 *   cổng vẫn chặn, an toàn hơn là bỏ qua).
 */
function trongPhamVi(loai, ten) {
    const pv = phamViWaguri();
    if (!pv[loai]) return true;
    const sach = loai === 'function' ? chuanHoa(String(ten).split('(')[0]) : chuanHoa(ten);
    return pv[loai].has(sach);
}

module.exports = { phamViWaguri, trongPhamVi, chuanHoa };
