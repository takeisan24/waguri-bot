// ============================================================
// test/interaction_khong_bo_ket_qua_ghi.test.js — mọi lời gọi GHI trong `interactionCreate.js`
// phải giữ kết quả, hoặc được MIỄN TRỪ có tên và có lý do.
//
// VÌ SAO CÓ — và vì sao nó quét TOÀN TỆP thay vì chốt vài dòng đã biết.
//
// Tôi đã đọc đủ 692 dòng của tệp này trong một lượt, và vẫn bỏ sót BA chỗ cùng một lớp lỗi.
// Chúng chỉ lộ ra khi chủ repo hỏi lại "thật sự đọc hết chưa" và tôi ngồi liệt kê từng lời
// gọi `db.*` rồi đối chiếu từng cái:
//
//   · `closeTicket`      — xoá kênh vô điều kiện -> khoá người dùng vĩnh viễn khỏi ticket
//   · `setVoteReminder`  — hàm bọc còn KHÔNG TRẢ GÌ CẢ, nơi gọi vẫn báo "đã tắt nhắc"
//   · `setProfilePublic` — công tắc RIÊNG TƯ, báo "đã ẩn hồ sơ" khi DB từ chối
//
// Đọc kỹ không thắng được một danh sách kiểm chạy máy. Nên cổng này KHÔNG liệt kê ba chỗ
// đó — nó liệt kê MỌI lời gọi ghi, và bắt bất cứ chỗ nào bỏ kết quả. Lời gọi thứ tư thêm
// sau này sẽ làm nó đỏ ngay, kể cả khi không ai nhớ tới tệp test này.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NGUON = path.join(ROOT, 'src', 'events', 'interactionCreate.js');

// Hàm CHỈ ĐỌC — bỏ kết quả của chúng là vô nghĩa chứ không nguy hiểm.
const CHI_DOC = new Set([
    'getUser', 'getGuildSettings', 'getActiveTicket', 'getTicketByChannel',
]);

// Miễn trừ phải có TÊN và LÝ DO. Thêm mục vào đây là một quyết định, không phải cách làm
// cổng im đi — người thêm phải viết được vì sao bỏ kết quả ở đó là an toàn.
const MIEN_TRU = {
    syncProfile: 'Đồng bộ tên/avatar cho BXH — việc phụ, chạy nền, KHÔNG có câu nào khoe với '
        + 'người dùng nên không thể nói sai. Hàm bọc có try/catch bên trong nên không bao giờ '
        + 'reject, tức bỏ `await` cũng không sinh unhandledRejection.',
};

function quet() {
    const s = fs.readFileSync(NGUON, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    const ra = [];
    s.split('\n').forEach((dong, i) => {
        const m = dong.match(/db\.([a-zA-Z]+)\(/);
        if (!m) return;
        const ten = m[1];
        if (CHI_DOC.has(ten)) return;
        // "Giữ kết quả" = gán vào biến, hoặc dùng thẳng trong điều kiện, hoặc nối .then/.catch.
        const giu = /const \w+ = await db\.|let \w+ = await db\.|if \(!?await db\.|\.then\(|\.catch\(/.test(dong);
        ra.push({ dong: i + 1, ten, giu });
    });
    return ra;
}

test('mọi lời gọi GHI đều giữ kết quả (hoặc được miễn trừ có lý do)', () => {
    const boSot = quet().filter(x => !x.giu && !MIEN_TRU[x.ten]);

    assert.deepStrictEqual(boSot.map(x => `${x.ten} @${x.dong}`), [],
        'Có lời gọi GHI bỏ kết quả. Hàm bọc trong `database.js` trả `false`/`null` khi DB lỗi,\n'
        + 'nên bỏ kết quả nghĩa là nhánh sau đó chạy tiếp như thể mọi việc đã xong — rồi báo\n'
        + 'thành công cho người dùng.\n\n'
        + 'Hoặc giữ kết quả và rẽ nhánh, hoặc thêm vào MIEN_TRU ở đầu tệp này KÈM LÝ DO nói\n'
        + 'được vì sao ở đó bỏ kết quả là an toàn.');
});

test('phép quét thật sự nhìn thấy tệp (không tự xanh vì quét trượt)', () => {
    // Một cổng quét mà không tìm thấy gì thì luôn xanh — đúng kiểu cổng vô dụng nguy hiểm
    // nhất. Chốt một sàn để nếu regex hỏng hay tệp đổi tên, cổng đỏ chứ không im.
    const tatCa = quet();
    assert.ok(tatCa.length >= 7,
        `Chỉ thấy ${tatCa.length} lời gọi ghi trong interactionCreate.js — kỳ vọng >= 7.\n`
        + 'Con số tụt mạnh nghĩa là phép quét đang trượt (đổi cách gọi db, đổi tên tệp),\n'
        + 'chứ không phải mã bỗng sạch hơn.');
});

test('mỗi miễn trừ phải THẬT SỰ còn được dùng', () => {
    // Miễn trừ mồ côi là nợ: nó nói "chỗ này an toàn" về một chỗ không còn tồn tại, và làm
    // người đọc sau tưởng cổng lỏng hơn thực tế.
    const dangDung = new Set(quet().map(x => x.ten));
    const moCoi = Object.keys(MIEN_TRU).filter(t => !dangDung.has(t));
    assert.deepStrictEqual(moCoi, [],
        `Miễn trừ mồ côi (không còn lời gọi nào): ${moCoi.join(', ')}. Gỡ khỏi MIEN_TRU.`);
});

test('miễn trừ phải kèm lý do đủ dài để là một lập luận', () => {
    for (const [ten, lyDo] of Object.entries(MIEN_TRU)) {
        assert.ok(typeof lyDo === 'string' && lyDo.length >= 80,
            `Miễn trừ \`${ten}\` có lý do quá ngắn. Miễn trừ là một QUYẾT ĐỊNH — phải nói được\n`
            + 'vì sao bỏ kết quả ở đó không thể dẫn tới việc bot nói sai với người dùng.');
    }
});
