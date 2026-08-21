// Ngân hàng câu đố.
//
// `a[0]` PHẢI là dạng hiển thị đẹp, có dấu đầy đủ — vì `dovui.js` dùng chính nó để in ra
// "Đáp án đúng là **...**" khi hết giờ. Trước đây cả 25 câu đều lưu dạng đã bỏ dấu (dùng cho
// so khớp), rồi `item.a[0]` bị dùng lại luôn làm chuỗi hiển thị, nên Waguri nói
// "Đáp án đúng là **trai dat**" — một nhân vật Nhật nói tiếng Việt mất dấu thì hỏng vai.
//
// An toàn khi thêm dấu: `dovui.js` chạy `item.a.map(norm)` trước khi so, mà `norm` bỏ dấu +
// thường hoá. Nên "Trái Đất", "trái đất", "TRAI DAT" đều khớp như nhau.
//
// Các phần tử SAU `a[0]` là biến thể chấp nhận được (viết tắt, tên gọi khác, tiếng Anh).
// Không cần thêm biến thể "không dấu" của chính `a[0]` — `norm` đã lo việc đó.
//
// Gate `test/quiz_dau.test.js` chặn `a[0]` mất dấu quay lại.
module.exports = [
    { q: 'Thủ đô của Việt Nam là thành phố nào?', a: ['Hà Nội', 'hanoi'] },
    { q: 'Việt Nam có bao nhiêu tỉnh thành (trước sáp nhập 2025)?', a: ['63'] },
    { q: 'Biển nào lớn nhất giáp Việt Nam?', a: ['Biển Đông', 'đông'] },
    { q: 'Ngọn núi cao nhất Việt Nam tên là gì?', a: ['Fansipan', 'phan xi păng', 'phanxipang'] },
    { q: 'Sông nào dài nhất chảy qua Việt Nam?', a: ['Sông Mekong', 'mekong', 'me kong', 'cửu long', 'sông cửu long'] },
    { q: '1 + 1 x 2 = ?', a: ['3'] },
    { q: 'Một năm có bao nhiêu ngày (năm thường)?', a: ['365'] },
    { q: 'Hành tinh nào gần Mặt Trời nhất?', a: ['Sao Thủy', 'thủy'] },
    { q: 'Nước nào đông dân nhất thế giới (2024)?', a: ['Ấn Độ', 'india'] },
    { q: 'Tác giả "Truyện Kiều" là ai?', a: ['Nguyễn Du'] },
    { q: 'Đơn vị tiền tệ của Nhật Bản là gì?', a: ['Yên Nhật', 'yen', 'đồng yên'] },
    { q: 'Con vật nào là biểu tượng năm 2024 (âm lịch)?', a: ['Rồng', 'con rồng', 'thìn'] },
    { q: 'Thành phố nào được gọi là "thành phố ngàn hoa" của Việt Nam?', a: ['Đà Lạt', 'dalat'] },
    { q: 'Bao nhiêu giây trong 1 giờ?', a: ['3600'] },
    { q: 'Nguyên tố hoá học có ký hiệu "O" là gì?', a: ['Oxy', 'oxi', 'oxygen'] },
    { q: 'Đội tuyển nào vô địch World Cup 2022?', a: ['Argentina'] },
    { q: 'Thủ đô của Hàn Quốc là gì?', a: ['Seoul', 'xê-un', 'xeon'] },
    { q: 'Hình có 3 cạnh gọi là hình gì?', a: ['Tam giác', 'hình tam giác'] },
    { q: '10 x 10 = ?', a: ['100'] },
    { q: 'Loài vật trên cạn lớn nhất hiện nay là gì?', a: ['Voi', 'con voi'] },
    { q: 'Mặt Trăng quay quanh hành tinh nào?', a: ['Trái Đất', 'địa cầu', 'earth'] },
    { q: 'Quốc kỳ Việt Nam có ngôi sao mấy cánh?', a: ['5', 'năm'] },
    { q: 'Ai là vị vua đầu tiên của nước Việt (truyền thuyết)?', a: ['Hùng Vương', 'vua hùng'] },
    { q: 'Phương tiện nào bay trên trời chở khách?', a: ['Máy bay', 'phi cơ', 'tàu bay'] },
    { q: 'Nước sôi ở bao nhiêu độ C (áp suất thường)?', a: ['100'] },
];
