// scripts/lib/viWord.js — Dò TỪ NGUYÊN VẸN trong tiếng Việt.
//
// VÌ SAO CÓ: `\b` của JS dựa trên [A-Za-z0-9_], nên với tiếng Việt nó sai CẢ HAI CHIỀU.
// Đo thật trên /\btớ\b/ — 5/6 trường hợp sai:
//     "tới lúc"  -> KHỚP        (báo nhầm: "ớ" không thuộc \w nên sinh ranh giới giả giữa ớ|i)
//     "tớ đi"    -> KHÔNG khớp  (BỎ LỌT lỗi thật: "ớ" và " " đều không thuộc \w -> không ranh giới)
//     "của tớ."  -> KHÔNG khớp  (bỏ lọt)
//     "tớ"       -> KHÔNG khớp  (bỏ lọt)
//
// Chiều BỎ LỌT mới nguy hiểm: phép kiểm xưng hô trông như "đạt" trong khi lỗi vẫn còn nguyên.
// Đây là lần thứ hai `\b` + tiếng Việt đánh lừa dự án này — lần trước câu bình luận
// "…giữ FOR UPDATE nên về lý thuyết" bị đọc thành `update n` trong gate dò bảng ma.

// Chữ cái tiếng Việt nằm rải trong Latin-1 Supplement + Latin Extended-A/B + Latin Extended
// Additional; À(U+00C0)–ỹ(U+1EF9) phủ trọn bộ ký tự tổ hợp sẵn của tiếng Việt.
const CHU = 'a-zA-ZÀ-ỹ0-9_';

/**
 * Regex khớp `tu` như một TỪ NGUYÊN VẸN (không nằm lọt trong một từ dài hơn).
 * Dùng lookaround với lớp ký tự tiếng Việt thay cho `\b`.
 */
function tuNguyenVen(tu, co = 'i') {
    // Thoát ký tự đặc biệt của regex. Danh sách ký tự cần thoát viết bằng mảng cho dễ đọc
    // và tránh bẫy escape lồng nhau.
    const DAC_BIET = ['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']'];
    const thoat = String(tu).split('').map(c => (DAC_BIET.includes(c) ? '\\' + c : c)).join('');
    return new RegExp('(?<![' + CHU + '])' + thoat + '(?![' + CHU + '])', co);
}

/** True nếu `chuoi` chứa BẤT KỲ từ nào trong `danhSach` như một từ nguyên vẹn. */
function chuaTu(chuoi, danhSach) {
    if (!chuoi) return false;
    return danhSach.some(tu => tuNguyenVen(tu).test(chuoi));
}

module.exports = { tuNguyenVen, chuaTu, CHU };
