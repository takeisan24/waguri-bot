// Định nghĩa nhiệm vụ hằng ngày. key phải khớp với loại sự kiện được quest_incr cộng.
// Loại: 'work' (số lần làm), 'earn' (tổng tiền kiếm), 'daily' (điểm danh), 'gamble_win' (số ván thắng).
module.exports = [
    { id: 'work3',    name: 'Chăm chỉ: đi làm 3 lần', key: 'work',       required: 3,    reward: 500 },
    { id: 'earn3k',   name: 'Kiếm được 3.000 VNĐ',     key: 'earn',       required: 3000, reward: 800 },
    { id: 'daily',    name: 'Điểm danh hôm nay',        key: 'daily',      required: 1,    reward: 500 },
    { id: 'gamble2',  name: 'Thắng minigame may rủi 2 ván', key: 'gamble_win', required: 2, reward: 1000 },
];
