// ============================================================
// test/deletedata_noi_dung_ly_do.test.js — `/deletedata` phải nói ĐÚNG lý do bị chặn.
//
// CHUYỆN ĐÃ XẢY RA. `delete_user_data()` ra đời ở `0075` với HAI điều kiện chặn (còn nợ,
// đang làm chủ bang). Sau đó `0086_advanced_auctions` định nghĩa lại hàm bằng
// `CREATE OR REPLACE` và thêm HAI điều kiện nữa — đang rao đấu giá, đang giữ giá cao nhất.
// RPC được cập nhật, còn `deletedata.js` thì không.
//
// Hệ quả: ai vướng đấu giá rơi thẳng vào nhánh `else` và đọc "Hơ, có lỗi khi xoá dữ liệu,
// thử lại sau nhé~". Câu đó SAI hai lần — không có lỗi nào cả, và thử lại bao nhiêu lần
// cũng y hệt. Họ chỉ cần huỷ phiên đấu giá, nhưng không có gì nói cho họ biết.
//
// VÌ SAO CỔNG NÀY SUY RA DANH SÁCH TỪ SQL, KHÔNG GHI CỨNG 4 TÊN:
// ghi cứng thì cổng chỉ chốt lại đúng cái hôm nay đã biết. Điều kiện chặn thứ NĂM sẽ lặp
// lại y nguyên vết xe cũ mà cổng vẫn xanh. Đọc thẳng từ migration thì hôm thêm điều kiện
// mới là hôm cổng đỏ.
//
// BẪY KHI ĐỌC SQL — đã mắc một lần trong audit lệnh 21-08: hàm này bị `CREATE OR REPLACE`
// nhiều lần ở nhiều migration. Phải lấy bản ĐỊNH NGHĨA CUỐI CÙNG theo thứ tự số hiệu, chứ
// đọc `0075` sẽ thấy 2 điều kiện và kết luận sai rằng lệnh đã phủ đủ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MIG = path.join(ROOT, 'supabase', 'migrations');

/** Thân bản định nghĩa CUỐI CÙNG của một hàm, theo thứ tự số hiệu migration. */
function thanHamMoiNhat(tenHam) {
    const tep = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
    let than = null, nguon = null;
    for (const f of tep) {
        const s = fs.readFileSync(path.join(MIG, f), 'utf8');
        // Bắt cả `public.ten(` lẫn `ten(`, không phân biệt hoa thường.
        const rx = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${tenHam}\\s*\\(`, 'i');
        const m = rx.exec(s);
        if (!m) continue;
        // Cắt từ chỗ khai báo tới cuối tệp là đủ: mỗi migration ở repo này khai báo hàm
        // rồi mới tới REVOKE/GRANT/VERIFY, không có hàm thứ hai chen giữa.
        than = s.slice(m.index);
        nguon = f;
    }
    return { than, nguon };
}

test('lệnh phải có nhánh cho MỌI lý do chặn mà RPC có thể trả về', () => {
    const { than, nguon } = thanHamMoiNhat('delete_user_data');
    assert.ok(than, 'Không tìm thấy migration nào định nghĩa delete_user_data.');

    const lyDo = [...new Set((than.match(/RETURN\s+'(blocked_[a-z_]+)'/gi) || [])
        .map(x => /'(blocked_[a-z_]+)'/i.exec(x)[1]))].sort();

    assert.ok(lyDo.length >= 4,
        `Chỉ thấy ${lyDo.length} lý do chặn trong ${nguon}: ${lyDo.join(', ')}.\n`
        + 'Kỳ vọng >= 4. Nếu con số tụt xuống thì nhiều khả năng đang đọc nhầm một bản\n'
        + '`CREATE OR REPLACE` CŨ — xem lại hàm `thanHamMoiNhat`.');

    const js = fs.readFileSync(path.join(ROOT, 'src', 'commands', 'utility', 'deletedata.js'), 'utf8');
    const thieu = lyDo.filter(k => !js.includes(`res === '${k}'`));

    assert.deepStrictEqual(thieu, [],
        `RPC (${nguon}) trả về ${lyDo.length} lý do chặn nhưng deletedata.js chỉ xử lý\n`
        + `${lyDo.length - thieu.length}. Thiếu: ${thieu.join(', ')}.\n`
        + 'Lý do nào không có nhánh riêng sẽ rơi vào `else` và người dùng đọc "có lỗi xảy\n'
        + 'ra, thử lại sau" — một câu vừa sai vừa khiến họ thử lại vô ích.');
});

test('mỗi lý do chặn phải có chuỗi RIÊNG ở cả hai ngôn ngữ', () => {
    const { than } = thanHamMoiNhat('delete_user_data');
    const lyDo = [...new Set((than.match(/RETURN\s+'(blocked_[a-z_]+)'/gi) || [])
        .map(x => /'(blocked_[a-z_]+)'/i.exec(x)[1]))];

    for (const ngu of ['vi', 'en']) {
        const d = require(`../src/locales/${ngu}.json`).commands.deletedata;
        const thay = new Map();
        for (const k of lyDo) {
            const khoa = `${k}_desc`;
            assert.ok(d[khoa], `${ngu}: thiếu commands.deletedata.${khoa}`);
            // Dùng lại chuỗi của lý do khác cũng vô dụng như rơi vào `else`.
            const truoc = thay.get(d[khoa]);
            assert.ok(!truoc, `${ngu}: ${khoa} dùng y hệt chuỗi của ${truoc} — không nói được gì mới.`);
            thay.set(d[khoa], khoa);
        }
    }
});

test('lời cảnh báo ban đầu phải nêu ĐỦ các điều kiện, không chỉ hai cái cũ', () => {
    // Nói trước thì người dùng không phải chạm vào cửa chặn mới biết. Bản cũ chỉ nhắc
    // khoản vay và bang hội — đúng hai cái có từ `0075`, bỏ quên hai cái `0086` thêm vào.
    for (const ngu of ['vi', 'en']) {
        const d = require(`../src/locales/${ngu}.json`).commands.deletedata;
        const dauGia = ngu === 'vi' ? /đấu giá/i : /auction/i;
        assert.match(d.warning_desc, dauGia,
            `${ngu}: warning_desc chưa nhắc tới đấu giá. Người dùng chỉ biết mình bị chặn\n`
            + 'sau khi đã bấm nút xác nhận xoá — đúng lúc không nên có bất ngờ nào.');
    }
});

test('phần GIỮ LẠI phải được nói ra, vì nó là ngoại lệ của chữ "toàn bộ"', () => {
    // RPC cố ý giữ `premium_orders` (đối soát) và `confession_logs` (điều tra quấy rối).
    // Đó là quyết định hợp lý — nhưng chỉ hợp lý KHI có nói ra. Cổng này giữ cho câu đó
    // không bị ai rút gọn mất trong lúc biên tập lại lời thoại.
    for (const ngu of ['vi', 'en']) {
        const d = require(`../src/locales/${ngu}.json`).commands.deletedata;
        const giuLai = ngu === 'vi' ? /giữ lại/i : /kept/i;
        assert.match(d.warning_desc, giuLai,
            `${ngu}: warning_desc không còn nói phần dữ liệu được GIỮ LẠI. Thiếu câu đó thì\n`
            + '"xoá toàn bộ" thành lời hứa sai.');
    }
});
