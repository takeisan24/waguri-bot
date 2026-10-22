// ============================================================
// test/work_noi_dung_du_nghe.test.js — mọi nghề THẬT phải có kịch bản riêng ở CẢ hai ngôn ngữ.
//
// CHUYỆN ĐÃ XẢY RA: `pickLine()` trong `commands/economy/work.js` rơi về `scripts.default[category]`
// khi thiếu nghề hay thiếu nhóm. `default` là kịch bản TIỆM BÁNH. Nên:
//   · `nong_dan` không có bản Việt -> người Việt làm *nông dân* đọc "phụ Rintaro nướng bánh dâu tây"
//   · `phu_ho` / `sinh_vien` / `tho_sua_xe` thiếu nhóm `jackpot` ở CẢ vi lẫn en -> trúng lớn mà
//     đọc câu tiệm bánh
// Không có gì báo đỏ, vì rơi về default là hành vi HỢP LỆ của hàm. Chỉ nội dung là sai.
//
// `/work` là lệnh đông nhất bot (1.416 lượt lúc đo 29/08), nên đây là chỗ nội dung sai bị đọc
// nhiều nhất. Cổng này khoá cả hai chiều: thiếu nghề/nhóm -> đỏ, và thêm nghề KHÔNG có trong
// bảng `jobs` -> cũng đỏ (dữ liệu chết không ai đọc tới, từng có `tiem_net` ở bản EN).
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const vi = require('../src/data/workScripts');
const en = require('../src/data/workScripts_en');

const NHOM = ['success', 'fail', 'jackpot'];

// Nguồn sự thật về nghề: KHỐI SEED, không phải danh sách viết tay trong test này —
// thêm nghề mới vào DB mà quên kịch bản thì cổng phải tự đỏ.
function nghToTuSeed() {
    const sql = fs.readFileSync(
        path.join(__dirname, '..', 'supabase', 'migrations', '0043_seed_catalog.sql'), 'utf8');
    const i = sql.indexOf('INSERT INTO jobs');
    assert.ok(i >= 0, 'không thấy khối INSERT INTO jobs trong 0043_seed_catalog.sql');
    const khoi = sql.slice(i, sql.indexOf('ON CONFLICT', i));
    return [...khoi.matchAll(/^\s*\('([a-z_]+)'/gm)].map((m) => m[1]);
}

const JOBS = nghToTuSeed();

test('khối seed vẫn đọc được — nếu 0 nghề thì mọi phép kiểm dưới đây vô nghĩa', () => {
    assert.ok(JOBS.length >= 13, `chỉ đọc được ${JOBS.length} nghề từ seed`);
});

for (const [ten, bo] of [['vi', vi], ['en', en]]) {
    test(`[${ten}] mọi nghề thật có đủ ${NHOM.length} nhóm, không rơi về default`, () => {
        const thieu = [];
        for (const job of JOBS) {
            for (const nhom of NHOM) {
                const set = bo[job] && bo[job][nhom];
                if (!Array.isArray(set) || set.length === 0) thieu.push(`${job}.${nhom}`);
            }
        }
        assert.deepStrictEqual(thieu, [],
            `${thieu.length} chỗ rơi về kịch bản TIỆM BÁNH của default: ${thieu.join(', ')}`);
    });

    test(`[${ten}] không có nghề nào ngoài bảng jobs (dữ liệu chết)`, () => {
        const thua = Object.keys(bo).filter((k) => k !== 'default' && !JOBS.includes(k));
        assert.deepStrictEqual(thua, [],
            `nghề không tồn tại trong bảng jobs nên không ai đọc tới: ${thua.join(', ')}`);
    });

    test(`[${ten}] không có khoá nhóm lạc — pickLine chỉ đọc success/fail/jackpot`, () => {
        const lac = [];
        for (const [job, o] of Object.entries(bo)) {
            if (!o || typeof o !== 'object') continue;
            for (const g of Object.keys(o)) if (!NHOM.includes(g)) lac.push(`${job}.${g}`);
        }
        assert.deepStrictEqual(lac, [],
            `khoá này không bao giờ được đọc (từng có nhat_ve_chai.join_success): ${lac.join(', ')}`);
    });
}

test('câu đố /trivia: bản Việt và bản Anh cùng số câu', () => {
    const qvi = require('../src/data/quiz');
    const qen = require('../src/data/quiz_en');
    assert.strictEqual(qvi.length, qen.length,
        `vi ${qvi.length} câu ≠ en ${qen.length} câu — người dùng tiếng Anh chơi bộ đề hụt`);
});

test('câu đố: mọi câu đều có đề bài và ít nhất một đáp án', () => {
    for (const [ten, bo] of [['vi', require('../src/data/quiz')], ['en', require('../src/data/quiz_en')]]) {
        bo.forEach((c, i) => {
            assert.ok(c && typeof c.q === 'string' && c.q.trim(), `${ten}[${i}] thiếu đề bài`);
            assert.ok(Array.isArray(c.a) && c.a.length && c.a.every((x) => typeof x === 'string' && x.trim()),
                `${ten}[${i}] thiếu đáp án`);
        });
    }
});
