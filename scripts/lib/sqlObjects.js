// Bóc tên object mà một file migration KHAI BÁO, để đối chiếu với schema thật.
//
// Vì sao không tin sổ `supabase_migrations.schema_migrations`: sổ đó CHỈ ghi thứ áp qua
// CLI/MCP. Migration áp tay bằng SQL editor không để lại dấu. Đã kiểm chứng: đối chiếu
// theo tên cho 17 file "chưa áp", soi tay thì 14 là BÁO ĐỘNG GIẢ (object có thật, chỉ khác
// tên: `inventory.durability` chứ không phải `items.durability`, `claim_support_gift` chứ
// không phải `claim_support`...).
// => Sự thật duy nhất đáng tin: object mà migration khai báo có TỒN TẠI trong DB không.

/** Bỏ comment SQL — nếu không, dòng ROLLBACK trong ghi chú bị đọc như DDL thật. */
function boComment(sql) {
    return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/**
 * Bỏ THÂN của mọi khối dollar-quote ($$ … $$, $function$ … $function$).
 * Bài học từ Đợt 2: `check-sql` từng báo nhầm `0112` "CREATE TABLE thiếu IF NOT EXISTS"
 * chỉ vì thân hàm chứa chuỗi `command_tag IN ('CREATE TABLE', ...)` — một CHUỖI VĂN BẢN.
 * DDL cấp cao nhất không bao giờ nằm trong thân hàm.
 */
function boThanHam(sql) {
    return sql.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, ' ');
}

const bo = s => s.replace(/^public\./i, '').replace(/["']/g, '').toLowerCase();

/**
 * @param {string} sqlThô nội dung file .sql
 * @returns {{loai:string, ten:string, bang?:string, xoa:boolean}[]}
 *   loai: 'table' | 'column' | 'function' | 'index' | 'event_trigger'
 *   xoa : true nếu câu lệnh là DROP (kỳ vọng object VẮNG mặt)
 */
function bocObject(sqlThô) {
    const sql = boThanHam(boComment(sqlThô));
    const ra = [];
    // GIỮ VỊ TRÍ trong file rồi sắp xếp lại ở cuối. Nếu gom theo từng regex thì thứ tự
    // câu lệnh bị mất: `0037_ticket_lottery.sql` viết `DROP TABLE lottery_state CASCADE;`
    // RỒI `CREATE TABLE lottery_state (...)` — gom kiểu cũ khiến DROP luôn là lần nhắc
    // cuối, và gate báo nhầm "đáng lẽ đã xoá nhưng vẫn còn".
    const them = (pos, loai, ten, xoa = false, extra = {}) => {
        if (ten) ra.push({ pos, loai, ten: bo(ten), xoa, ...extra });
    };

    for (const m of sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) them(m.index, 'table', m[1]);
    for (const m of sql.matchAll(/\bdrop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/gi)) them(m.index, 'table', m[1], true);

    for (const m of sql.matchAll(/\bcreate\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(/gi)) them(m.index, 'function', m[1]);
    for (const m of sql.matchAll(/\bdrop\s+function\s+(?:if\s+exists\s+)?([\w."]+)/gi)) them(m.index, 'function', m[1], true);

    // Bắt luôn BẢNG mà index thuộc về: xoá bảng thì index đi theo, không thì gate báo nhầm
    // `idx_market_history_item` "thiếu" sau khi `0111` xoá bảng `market_history`.
    for (const m of sql.matchAll(/\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([\w."]+)\s+on\s+([\w."]+)/gi)) {
        them(m.index, 'index', m[1], false, { bangCha: bo(m[2]) });
    }
    for (const m of sql.matchAll(/\bdrop\s+index\s+(?:if\s+exists\s+)?([\w."]+)/gi)) them(m.index, 'index', m[1], true);

    for (const m of sql.matchAll(/\bcreate\s+event\s+trigger\s+([\w."]+)/gi)) them(m.index, 'event_trigger', m[1]);
    for (const m of sql.matchAll(/\bdrop\s+event\s+trigger\s+(?:if\s+exists\s+)?([\w."]+)/gi)) them(m.index, 'event_trigger', m[1], true);

    // ALTER TABLE t ADD COLUMN [IF NOT EXISTS] c ... (có thể nhiều ADD COLUMN trong một câu)
    for (const m of sql.matchAll(/\balter\s+table\s+(?:if\s+exists\s+)?([\w."]+)([\s\S]*?);/gi)) {
        const bang = bo(m[1]), than = m[2];
        for (const c of than.matchAll(/\badd\s+column\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) them(m.index + c.index, 'column', c[1], false, { bang });
        for (const c of than.matchAll(/\bdrop\s+column\s+(?:if\s+exists\s+)?([\w."]+)/gi)) them(m.index + c.index, 'column', c[1], true, { bang });
    }

    return ra.sort((a, b) => a.pos - b.pos);
}

/** Khoá định danh duy nhất của một object (để "lần nhắc cuối cùng thắng"). */
function khoa(o) {
    return o.loai === 'column' ? `column:${o.bang}.${o.ten}` : `${o.loai}:${o.ten}`;
}

module.exports = { bocObject, khoa, boComment, boThanHam };
