// lib/timeout.js — Chặn trần thời gian cho các lời gọi nằm trên ĐƯỜNG TRƯỚC ACK.
//
// VÌ SAO CẦN: Discord huỷ một interaction nếu bot không ack trong 3 GIÂY. Nhưng
// `database.js` đặt `SUPABASE_TIMEOUT_MS = 10_000` — một lời gọi DB chậm có thể ngốn 10
// giây, gấp hơn ba lần hạn. Khi đó lệnh chưa kịp `deferReply()` thì interaction đã chết,
// người dùng thấy "This interaction failed" mà log không có gì bất thường.
//
// Hàm này vốn nằm riêng tư trong `src/lib/i18n.js`. Nó được viết ra để bọc đúng một chỗ
// (tra ngôn ngữ), rồi hai lời gọi DB khác trên CÙNG đường đó — `getJail` và `getUser` —
// bị bỏ sót suốt vì không ai với tới được hàm này. Tách ra đây để chỗ nào cũng dùng được.
//
// Xem thêm `getJailForAck` trong `src/lib/jail.js` — ví dụ áp dụng kèm chính sách fail-open.

/**
 * Chạy `promise` với trần thời gian `ms`.
 * @returns giá trị của promise, hoặc `undefined` nếu quá hạn HOẶC promise ném lỗi.
 *
 * Cố ý KHÔNG ném lỗi: nơi gọi nằm trên đường trước ack, ném ra chỉ làm chết thêm
 * interaction. Trả `undefined` để nơi gọi tự quyết định rơi về giá trị nào — và vì
 * `undefined` khác `null`, nơi gọi vẫn phân biệt được "hết giờ" với "DB trả về không có".
 */
function withTimeout(promise, ms) {
    let timer;
    const guard = new Promise((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
        // unref: đồng hồ này không được giữ tiến trình sống (quan trọng khi chạy test).
        if (typeof timer?.unref === 'function') timer.unref();
    });
    return Promise.race([
        Promise.resolve(promise).catch(() => undefined),
        guard,
    ]).finally(() => clearTimeout(timer));
}

// Trần dùng chung cho mọi lời tra DB trên đường trước ack. 800ms cho ngân sách 3s: đủ rộng
// cho một truy vấn có chỉ mục ở điều kiện bình thường (<100ms), vẫn chừa chỗ cho phần việc
// còn lại của handler.
const ACK_LOOKUP_TIMEOUT = 800;

module.exports = { withTimeout, ACK_LOOKUP_TIMEOUT };
