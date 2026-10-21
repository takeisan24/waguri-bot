// Mọi tên gõ tắt `w!` phải dẫn tới lệnh ĐANG đăng ký — test HỒI QUY.
//
// Bối cảnh (2026-10-21): đợt đổi 72 lệnh sang tên tiếng Anh để lại `ngu: 'nghingoi'`,
// `trano: { cmd: 'vay' }`… trong bảng gõ tắt. Bộ định tuyến tra `client.commands` theo tên
// tiếng Anh nên các tên này trả về `undefined` và `messageCreate` `return` IM LẶNG — người
// chơi gõ `w!tiembanh` không nhận được gì, trong khi AGENTS.md vẫn ghi "giữ alias gõ tắt".

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { PREFIX_ALIASES, TEN_RIENG } = require('../src/lib/prefixTen');

function soLenh() {
    const goc = path.join(__dirname, '..', 'src', 'commands');
    const so = new Map();
    for (const nhom of fs.readdirSync(goc)) {
        const thuMuc = path.join(goc, nhom);
        if (!fs.statSync(thuMuc).isDirectory()) continue;
        for (const tep of fs.readdirSync(thuMuc).filter(f => f.endsWith('.js'))) {
            const lenh = require(path.join(thuMuc, tep));
            if (!lenh.data) continue;
            const json = lenh.data.toJSON();
            so.set(json.name, new Set((json.options || []).filter(o => o.type === 1 || o.type === 2).map(o => o.name)));
        }
    }
    return so;
}

test('prefix — mọi alias trỏ tới lệnh và lệnh con có thật', () => {
    const so = soLenh();
    const loi = [];
    for (const [tat, dich] of Object.entries(PREFIX_ALIASES)) {
        const cmd = typeof dich === 'string' ? dich : dich.cmd;
        const subs = so.get(cmd);
        if (!subs) { loi.push(`w!${tat} -> /${cmd} không tồn tại`); continue; }
        // `sub` chỉ là "token chèn thêm": với lệnh KHÔNG có subcommand (vd /image) nó là
        // giá trị option, nên chỉ kiểm khi lệnh có subcommand.
        if (typeof dich !== 'string' && subs.size > 0 && !subs.has(dich.sub)) {
            loi.push(`w!${tat} -> /${cmd} ${dich.sub}: lệnh con không tồn tại`);
        }
    }
    assert.deepStrictEqual(loi, []);
});

test('prefix — tên tiếng Việt cũ của các lệnh đã đổi tên vẫn chạy', () => {
    const mong = { tiembanh: 'bakery', vay: 'loan', dovui: 'trivia', nghingoi: 'rest', noitu: 'wordchain', thoitiet: 'weather' };
    for (const [cu, moi] of Object.entries(mong)) {
        assert.strictEqual(PREFIX_ALIASES[cu], moi, `w!${cu} phải dẫn tới /${moi}`);
    }
});

test('prefix — khoá TEN_RIENG là lệnh slash thật hoặc tên prefix-only có chủ đích', () => {
    const so = soLenh();
    // heo/loto/bingo: chỉ có đường prefix (bingo đã cất nhưng handler prefix còn).
    const PREFIX_ONLY = new Set(['heo', 'loto', 'bingo']);
    for (const k of Object.keys(TEN_RIENG)) {
        assert.ok(so.has(k) || PREFIX_ONLY.has(k), `TEN_RIENG.${k} không ứng với lệnh nào — /help ${k} sẽ không thấy`);
    }
});
