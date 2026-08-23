// ============================================================
// dauVao.js — biến một tin nhắn Discord thành thứ model đọc được.
//
// VÌ SAO CÓ: trước 2026-08-23, nhánh AI chỉ lấy `message.content` rồi bỏ hết phần còn lại.
// Bốn triệu chứng người dùng thật gặp:
//
//   1. Gửi mỗi ảnh kèm tag  -> `if (!text) return`, bot IM LẶNG TUYỆT ĐỐI. Người dùng không
//      phân biệt được "bot phớt lờ mình" với "bot hỏng".
//   2. Gửi link             -> vào dạng chữ, model không mở được nên nó BỊA nội dung. Tệ hơn
//      im lặng, vì tự tin và sai.
//   3. Emoji tuỳ chỉnh      -> `<:ten:123456>` tới model nguyên si, thành chuỗi số vô nghĩa.
//   4. Trả lời tin khác     -> tin được trích không hề được đưa vào, mất sạch ngữ cảnh.
//
// Emoji unicode 😊 thì vốn đã chạy tốt, không đụng tới.
//
// Cách chữa chung cho cả bốn: gắn NHÃN mô tả những gì model không tự thấy được. Nhãn tốn
// chừng 15–40 token, và nó cũng là thứ làm câu trả lời khá lên — model biết mình đang nhìn
// gì thì trả lời trúng hơn.
// ============================================================

/** Cắt chuỗi cho gọn mà không chặt ngang từ. */
function catGon(s, max) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cat = t.slice(0, max);
    const kho = cat.lastIndexOf(' ');
    return (kho > max * 0.6 ? cat.slice(0, kho) : cat) + '…';
}

/**
 * Emoji tuỳ chỉnh của Discord `<:ten:123>` / `<a:ten:123>` -> `:ten:`.
 * Giữ lại phần TÊN vì đó là thứ duy nhất mang nghĩa; con số chỉ là ID.
 */
function doiEmoji(text) {
    return String(text || '').replace(/<(a?):([a-zA-Z0-9_]+):\d+>/g, ':$2:');
}

/** Bỏ mọi kiểu mention để model không phải đọc chuỗi ID. */
function boMention(text) {
    return String(text || '')
        .replace(/<@[!&]?\d+>/g, '')   // người dùng và role
        .replace(/<#\d+>/g, '')        // kênh
        .trim();
}

/** Danh sách tên miền xuất hiện trong chuỗi, không trùng lặp, tối đa 3. */
function timMien(text) {
    const ra = [];
    const re = /https?:\/\/([^\s/?#]+)/gi;
    let m;
    while ((m = re.exec(String(text || ''))) !== null) {
        const mien = m[1].replace(/^www\./i, '').toLowerCase();
        if (!ra.includes(mien)) ra.push(mien);
        if (ra.length >= 3) break;
    }
    return ra;
}

const DUOI_ANH = /\.(png|jpe?g|webp|gif)$/i;

/** Đính kèm nào là ảnh mà ta xử lý được. Ảnh spoiler bị loại CÓ CHỦ Ý. */
function locAnh(attachments) {
    const ds = attachments && typeof attachments.values === 'function'
        ? [...attachments.values()]
        : Array.isArray(attachments) ? attachments : [];

    return ds.filter(a => {
        if (!a) return false;
        // Người ta đánh dấu spoiler là cố tình che. Bot mô tả toẹt ra là phản bội ý định đó.
        if (String(a.name || '').startsWith('SPOILER_')) return false;
        const ct = String(a.contentType || '');
        // contentType CÓ THỂ null -> phải xét thêm đuôi file, và không đoán bừa khi cả hai đều mù.
        return ct.startsWith('image/') || DUOI_ANH.test(String(a.name || a.url || ''));
    });
}

/**
 * Dựng phần chữ gửi cho model, kèm nhãn mô tả những gì nó không tự thấy.
 *
 * @param {object} tin      tin nhắn hiện tại (hoặc vật giả có content/attachments/stickers)
 * @param {object} [tinTraLoi] tin đang được trả lời, nếu có
 * @returns {{text: string, nhan: string[], anh: object|null, coGiDo: boolean}}
 *   text    — chữ đã dọn (có thể rỗng)
 *   nhan    — các dòng nhãn, đã sẵn sàng nối vào cuối
 *   anh     — MỘT đính kèm ảnh để gửi model, hoặc null
 *   coGiDo  — false nghĩa là tin rỗng hoàn toàn, gọi AI cũng vô nghĩa
 */
function dungDauVao(tin, tinTraLoi = null) {
    const text = doiEmoji(boMention(tin?.content));
    const nhan = [];

    // --- ảnh: tin hiện tại trước, không có thì lấy của tin được trả lời ---
    //
    // Thứ tự này quan trọng. Cách dùng thật phổ biến nhất KHÔNG phải "vừa gửi ảnh vừa tag
    // bot", mà là "ai đó đăng ảnh, người khác trả lời tin đó rồi hỏi cái này là gì". Chỉ
    // nhìn tin hiện tại thì trượt đúng ca đó, và Waguri lại quay về tật đoán bừa.
    const anhCuaTin = locAnh(tin?.attachments);
    const anhCuaTraLoi = locAnh(tinTraLoi?.attachments);
    const anh = anhCuaTin[0] || anhCuaTraLoi[0] || null;

    if (anhCuaTin.length) {
        nhan.push(anhCuaTin.length > 1
            ? `[Người dùng gửi ${anhCuaTin.length} ảnh — Waguri chỉ xem được tấm đầu tiên]`
            : '[Kèm 1 ảnh]');
    } else if (anhCuaTraLoi.length) {
        nhan.push('[Ảnh nằm trong tin nhắn được trả lời]');
    }

    // Có đính kèm nhưng không phải ảnh xem được -> nói thật, đừng lờ đi.
    const tongDinhKem = (tin?.attachments?.size ?? (Array.isArray(tin?.attachments) ? tin.attachments.length : 0));
    if (tongDinhKem > anhCuaTin.length) {
        nhan.push('[Có tệp đính kèm mà Waguri chưa mở được — có thể là ảnh ẩn (spoiler), video hoặc tài liệu]');
    }

    // --- tin được trả lời ---
    if (tinTraLoi) {
        const ten = tinTraLoi.author?.displayName || tinTraLoi.author?.username || 'ai đó';
        const noi = catGon(doiEmoji(boMention(tinTraLoi.content)), 300);
        if (noi) nhan.push(`[Đang trả lời tin của ${ten}: "${noi}"]`);
        else if (anhCuaTraLoi.length) nhan.push(`[Đang trả lời một tin chỉ có ảnh của ${ten}]`);
    }

    // --- sticker: chỉ lấy TÊN, không gửi ảnh sticker (0 token thêm) ---
    const st = tin?.stickers && typeof tin.stickers.values === 'function' ? [...tin.stickers.values()] : [];
    if (st.length) nhan.push(`[Người dùng gửi sticker "${st.map(s => s.name).filter(Boolean).join('", "')}"]`);

    // --- link: KHÔNG mở, chỉ nêu tên miền và nói thật ---
    //
    // Không fetch vì bot đi lấy URL người lạ gửi là mở cửa SSRF. Thà nói thật còn hơn để
    // model bịa nội dung trang.
    const mien = timMien(tin?.content);
    if (mien.length) nhan.push(`[Có link tới ${mien.join(', ')} — Waguri KHÔNG mở được link, đừng đoán nội dung bên trong]`);

    const coGiDo = Boolean(text || anh || st.length || tinTraLoi || tongDinhKem);
    return { text, nhan, anh, coGiDo };
}

/** Ghép chữ và nhãn thành chuỗi cuối cùng gửi model. */
function ghep(text, nhan) {
    const phan = [];
    if (text) phan.push(text);
    if (nhan && nhan.length) phan.push(nhan.join('\n'));
    return phan.join('\n');
}

// Hướng dẫn model đọc nhãn. Gắn CÓ ĐIỀU KIỆN, không nhét vào persona.
//
// Đo 2026-08-23: nhét khối này vào persona làm MỌI lượt chat đắt thêm 222 token (+15,4%),
// kể cả những lượt chỉ có chữ thuần — mà persona vốn đã chiếm 96% chi phí một lượt. Với
// 300 lượt/ngày là +66.600 token mỗi ngày cho một khối chỉ có ích khi tin có nhãn.
//
// Gắn theo nhu cầu thì lượt chữ thuần trả về 0 đồng, còn lượt có ảnh/link/reply mới trả.
const HUONG_DAN_NHAN = [
    '',
    '[Cách đọc các nhãn vuông ở trên: đó là ghi chú hệ thống mô tả thứ bạn không tự nhìn thấy,',
    'KHÔNG phải lời người ta nói. Đừng nhắc lại nhãn, đừng đọc to nó ra.',
    'Nhãn về link: bạn KHÔNG mở được link — nói thật là chưa xem được rồi hỏi họ kể cho nghe,',
    'TUYỆT ĐỐI không đoán nội dung bên trong. Nhãn về tệp chưa mở được: cũng nói thật.',
    'Nhãn về ảnh mà bạn không thực sự nhìn thấy (ảnh ở lượt cũ): nói thật là giờ không còn thấy nữa.',
    'Thà nói "mình chưa xem được" còn hơn đoán bừa rồi nói sai.]'
].join('\n');

/** Chuỗi này có chứa nhãn do dungDauVao sinh ra không? */
function coNhan(text) {
    return /^\[(Kèm \d+ ảnh|Người dùng gửi|Ảnh nằm trong|Có tệp đính kèm|Đang trả lời|Có link tới)/m
        .test(String(text || ''));
}

module.exports = { dungDauVao, ghep, doiEmoji, boMention, timMien, locAnh, catGon, coNhan, HUONG_DAN_NHAN };
