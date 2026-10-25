// ============================================================
// lib/canhRest.js — Đo xem REST ra Discord có bị XẾP HÀNG không.
//
// VÌ SAO CÓ. Nhóm lỗi lớn nhất còn lại của bot là ack/10062: đo trên toàn bộ kênh log
// 25-10-2026, 164/439 tin (37%) thuộc nhóm này. Nhưng dữ liệu log hiện có đã cạn khả năng
// giải thích, và ba phép đo sau đã LOẠI được ba nghi phạm:
//
//   · KHÔNG phải độ trễ gateway vào: `canhAck` đo từ `interaction.createdTimestamp` và báo
//     "đã trôi 120–320ms TRƯỚC khi đồng hồ được bấm" — mà mốc bấm đồng hồ nằm SAU cả lượt
//     tra ngôn ngữ (dòng 154 so với dòng 99 của `interactionCreate.js`). Tức cả đoạn
//     gateway + tra DB ngôn ngữ chỉ tốn ~0,2s trong ngân sách 3 giây.
//   · KHÔNG phải việc nền định kỳ: phân bố theo phút-trong-giờ gần như phẳng, không có
//     đỉnh nào ra dáng cron. Theo giờ thì nó trùng đúng giờ cao điểm người chơi.
//   · KHÔNG phải tiến trình bị đứng: 164 sự kiện gom thành 107 CỤM RỜI RẠC; chỉ 3 cụm có
//     từ 2 lệnh khác nhau cùng vỡ, và 2 trong 3 cụm đó từ 19/08. Event loop bị chặn sẽ làm
//     mọi lệnh đang bay cùng vỡ một lúc — không thấy dấu đó.
//
// Còn lại đúng một nghi phạm: lời gọi `deferReply()` — một POST ra Discord — mất hơn 2,3
// giây. Hai cách giải thích là REST bị XẾP HÀNG (chạm hạn mức, nhất là hạn mức TOÀN CỤC)
// hoặc jitter mạng từ host. Cả hai đều dự đoán "vỡ lẻ tẻ", nên dữ liệu cũ không phân biệt
// được. Module này phân biệt: nếu chạm hạn mức thì `client.rest` PHÁT SỰ KIỆN, còn jitter
// mạng thì không phát gì.
//
// ĐỌC KẾT QUẢ Ở ĐÂU: `canhAck` nhúng `tomTat()` vào ngay tin cảnh báo ack. Nên lần vỡ tiếp
// theo TỰ NÓI nguyên nhân, thay vì ta lại đoán. `gan60s > 0` ở đúng lúc vỡ = xếp hàng;
// `gan60s = 0` suốt mà vẫn vỡ = jitter mạng, và khi đó bản vá phải đi hướng khác (ack sớm
// hơn / chịu đựng, chứ không phải giảm số lời gọi REST).
//
// KHÔNG gửi gì thêm vào kênh log cho hạn mức theo-route: chính kênh đó đang có 42% là cảnh
// báo ANTI-NUKE, thêm nhiễu nữa thì phép đo sau lại khó đọc. Route thì ghi console; chỉ
// hạn mức TOÀN CỤC mới đáng gửi kênh (nó hiếm và nó chặn MỌI request, kể cả ack).
// ============================================================
const { logError } = require('./logger');

// Mốc thời gian của các lần chạm hạn mức gần đây. Chặn trần để không phình vô hạn.
const GIU_TOI_DA = 400;
const moc = [];
let tongCong = 0;
let tongToanCuc = 0;
// Đường (route) bị chạm nhiều nhất -> gợi ý chỗ gây xếp hàng.
const demTheoDuong = new Map();
// Chống spam: hạn mức toàn cục chỉ gửi kênh nhiều nhất 1 lần / 10 phút.
let lanGuiToanCuc = 0;
const CACH_GUI_MS = 10 * 60 * 1000;

function ghiNhan(info) {
    const now = Date.now();
    tongCong++;
    moc.push(now);
    if (moc.length > GIU_TOI_DA) moc.splice(0, moc.length - GIU_TOI_DA);

    const duong = String(info?.route || info?.url || '?').slice(0, 120);
    demTheoDuong.set(duong, (demTheoDuong.get(duong) || 0) + 1);

    if (info?.global) {
        tongToanCuc++;
        console.warn(`[REST] Hạn mức TOÀN CỤC — chờ ${info.timeToReset}ms · ${info.method} ${duong}`);
        // Hạn mức toàn cục chặn cả lời ack, nên nó là nguyên nhân trực tiếp của 10062.
        if (now - lanGuiToanCuc > CACH_GUI_MS) {
            lanGuiToanCuc = now;
            logError('REST hạn mức TOÀN CỤC',
                new Error(`Chờ ${info.timeToReset}ms · ${info.method} ${duong} · toàn cục lần thứ ${tongToanCuc}`),
                { command: 'rest:global' });
        }
    } else {
        console.warn(`[REST] Hạn mức route — chờ ${info?.timeToReset}ms · ${info?.method} ${duong}`);
    }
}

/** Gắn phép đo vào client. Gọi một lần lúc khởi động. An toàn khi gọi lại. */
let daGan = false;
function theoDoiRest(client) {
    if (daGan || !client?.rest?.on) return;
    daGan = true;
    // Không dùng hằng `RESTEvents.RateLimited` để không phải require thêm: giá trị là
    // 'rateLimited' (đã kiểm trên discord.js 14.27).
    client.rest.on('rateLimited', (info) => {
        try { ghiNhan(info); } catch (_) { /* phép đo không được làm chết thứ nó đang đo */ }
    });
}

/**
 * Ảnh chụp để nhúng vào cảnh báo ack.
 * @returns {{tong:number,toanCuc:number,gan60s:number,duongHay:string|null}}
 */
function tomTat() {
    const nguong = Date.now() - 60_000;
    let gan60s = 0;
    for (let i = moc.length - 1; i >= 0; i--) {
        if (moc[i] < nguong) break;
        gan60s++;
    }
    let duongHay = null, cao = 0;
    for (const [d, n] of demTheoDuong) if (n > cao) { cao = n; duongHay = d; }
    return { tong: tongCong, toanCuc: tongToanCuc, gan60s, duongHay };
}

/** Dòng ngắn để nhúng vào meta của tin cảnh báo. */
function dongTomTat() {
    const t = tomTat();
    if (!t.tong) return 'REST: chưa chạm hạn mức lần nào';
    return `REST: ${t.gan60s} lần/60s cuối · tổng ${t.tong} (toàn cục ${t.toanCuc})`
        + (t.duongHay ? ` · hay chạm: ${t.duongHay}` : '');
}

module.exports = { theoDoiRest, tomTat, dongTomTat };
