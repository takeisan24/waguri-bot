// ============================================================
// lib/antinuke/queue.js — Hàng đợi thao tác Discord API theo từng server.
//
// VÌ SAO CÓ: dọn dẹp sau một vụ nuke là hàng chục lệnh API liên tiếp (xoá kênh spam,
// gỡ quyền từng role...). Bắn song song thì ăn 429 và discord.js sẽ tự chờ — nhưng
// chờ ở chỗ ta không kiểm soát được và có thể kéo dài nhiều phút, chặn cả các đường
// khác của bot. Xếp hàng tuần tự có giãn cách thì chậm hơn một chút nhưng ĐOÁN ĐƯỢC.
//
// Trần `QUEUE_MAX_PER_INCIDENT`: thà báo "còn N mục chưa xử lý" còn hơn treo bot 10
// phút vì một kẻ tấn công tạo 500 kênh.
//
// ⚠️ Hàng đợi này KHÔNG dành cho đòn quyết định (tước quyền kẻ tấn công) — đòn đó
// chạy thẳng, không qua hàng đợi, vì mỗi 100 ms đều đáng.
// ============================================================
const { ANTINUKE } = require('../../config');
const { logError } = require('../logger');

const chuoi = new Map(); // guildId -> Promise (đuôi hàng đợi hiện tại)

const nghi = ms => new Promise(r => setTimeout(r, ms));

/**
 * Xếp một thao tác vào hàng của guild. Trả promise kết quả.
 * Thao tác lỗi KHÔNG làm đứt hàng đợi (nuốt lỗi, ghi log) — dọn dẹp là việc "cố gắng
 * hết sức", một kênh không xoá được không được phép chặn 20 kênh còn lại.
 */
function xepHang(guildId, nhan, fn) {
    const truoc = chuoi.get(guildId) || Promise.resolve();
    const ketQua = truoc.then(async () => {
        try {
            return await fn();
        } catch (e) {
            logError('antinuke_queue', e, { guild: guildId, command: nhan });
            return null;
        } finally {
            await nghi(ANTINUKE.QUEUE_SPACING_MS);
        }
    });
    // Đuôi hàng đợi không bao giờ ở trạng thái rejected -> lần xếp sau luôn chạy tiếp.
    chuoi.set(guildId, ketQua.then(() => {}, () => {}));
    return ketQua;
}

/**
 * Bộ đếm trần cho một sự cố. `.con()` trả false khi đã chạm trần, `.bo` là số mục
 * đã bị bỏ (để báo cho chủ server biết phần chưa làm).
 */
function taoTran(max = ANTINUKE.QUEUE_MAX_PER_INCIDENT) {
    let dung = 0, bo = 0;
    return {
        con() {
            if (dung >= max) { bo++; return false; }
            dung++;
            return true;
        },
        get daDung() { return dung; },
        get daBo() { return bo; },
    };
}

module.exports = { xepHang, taoTran };
