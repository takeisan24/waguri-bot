// ============================================================
// lib/canhAck.js — Bắt lệnh KHÔNG ACK, nguồn gốc của "The application did not respond".
//
// VÌ SAO ĐO LÚC CHẠY CHỨ KHÔNG QUÉT MÃ: ngày 21-08-2026 tôi thử quét tĩnh luồng ack của
// 81 lệnh. Máy quét ra 15 báo, quá nửa là SAI:
//   · `jobs.js` báo "không ack" — thật ra có deferReply() ở dòng 45
//   · `action.js` báo "không ack" — nó `return runCouple(interaction, …)`, UỶ THÁC ack
//     cho hàm khác ở file khác
//   · `market.js` báo "return trước ack" — đó là `return` trong callback .map() dựng chuỗi
//   · `config.js` báo "return trước ack" — dòng đó CHÍNH LÀ `return interaction.reply(…)`
//
// Gốc rễ: ack hay nằm trong hàm được gọi lồng nhau, và nhánh nào chạy còn tuỳ dữ liệu lúc
// chạy. Quét tĩnh không kết luận được. Một máy quét cho 15 báo mà quá nửa sai thì tệ hơn
// không có — người ta sẽ học cách bỏ qua nó.
//
// Cách này quan sát THỰC TẾ nên không có dương tính giả, và bắt được thứ mã tĩnh không bao
// giờ thấy: DB chậm lúc cao điểm, nhánh hiếm, lệnh chỉ vỡ khi túi đồ đầy.
// ============================================================
const { logError } = require('./logger');
const { dongTomTat } = require('./canhRest');

// Dưới hạn cứng 3 giây của Discord, để còn kịp ghi nhận trước khi interaction chết.
const NGUONG_ACK_MS = 2500;

const daAck = (it) => Boolean(it && (it.replied || it.deferred));

/**
 * Theo dõi một interaction cho tới khi lệnh chạy xong.
 *
 * @param {object} interaction
 * @param {string} nhan tên hiển thị trong kênh log, vd '/daily'
 * @returns {{xong: (daNem?: boolean) => void}} gọi `xong()` khi execute() kết thúc
 */
function theoDoiAck(interaction, nhan) {
    let ketThuc = false;

    // MỐC ĐO LÀ LÚC DISCORD TẠO INTERACTION, không phải lúc hàm này được gọi.
    //
    // Bản cũ `setTimeout(..., 2500)` kể từ lời gọi — mà lời gọi nằm ở
    // `interactionCreate.js:139`, SAU `await getInteractionLanguage` (dòng 97, trần 800ms).
    // Nên khi nó nổ, thời gian thật đã trôi là 2500ms + phần trước đó ≈ 3,3s: ĐÃ QUÁ hạn 3
    // giây của Discord. Nó không bao giờ cảnh báo kịp, và con số nó in ra thấp hơn thực tế.
    // Đo trên log prod 2026-10-22: 149/318 tin thuộc nhóm ack/10062 mà không tin nào cho
    // biết thời gian thật — nên không truy được chậm nằm ở đâu.
    //
    // Nay tính ngược: còn lại = NGUONG − đã_trôi. Vị trí bấm đồng hồ vì thế gần như không
    // còn quan trọng, và log in ra CẢ hai số: tổng thời gian thật, và bao nhiêu đã trôi
    // TRƯỚC khi đồng hồ được bấm — chính con số cần để biết chậm ở trước hay trong handler.
    const moc = Number(interaction?.createdTimestamp) || Date.now();
    const daTroiKhiBam = Math.max(0, Date.now() - moc);
    const conLai = Math.max(0, NGUONG_ACK_MS - daTroiKhiBam);

    // Nhánh 1 — lệnh CHẠY QUÁ LÂU mà chưa ack. Người dùng đã thấy "did not respond"
    // trước khi execute() kịp xong, nên phải báo ngay tại mốc chứ không đợi.
    const hen = setTimeout(() => {
        if (ketThuc || daAck(interaction)) return;
        const tong = Date.now() - moc;
        // Tên lệnh nằm trong TIÊU ĐỀ chứ không trong nội dung lỗi: logger gộp trùng theo
        // (tiêu đề + dòng đầu của lỗi), nên để chung tiêu đề thì mọi lệnh sẽ dồn vào MỘT
        // khoá và chỉ lệnh đầu tiên được báo.
        // Nhúng trạng thái MẠNG + REST vào đúng tin cảnh báo.
        //
        // Vì sao cần: tới 25-10-2026 nhóm ack/10062 là 164/439 tin kênh log (37%) mà không
        // tin nào cho biết thời gian đã đi đâu. Ba phép đo đã loại gateway, cron và event
        // loop bị chặn (xem đầu `lib/canhRest.js`), chỉ còn "POST deferReply mất >2,3s" —
        // do REST bị XẾP HÀNG, hay do jitter mạng? Hai thứ đó đòi hai bản vá khác nhau,
        // nên đoán sai là vá sai. `gan60s > 0` đúng lúc vỡ = xếp hàng; luôn 0 mà vẫn vỡ =
        // jitter. Lần vỡ tiếp theo vì thế TỰ NÓI nguyên nhân.
        //
        // `ws.ping` là NaN khi chưa kết nối xong, nên phải canh trước khi làm tròn.
        const ping = Number(interaction?.client?.ws?.ping);
        logError(`Chưa ack sau ${tong}ms: ${nhan}`,
            new Error('Người dùng đã thấy "The application did not respond". '
                + `Đã trôi ${daTroiKhiBam}ms TRƯỚC khi đồng hồ được bấm `
                + `(tức chậm nằm ở phần ${daTroiKhiBam >= NGUONG_ACK_MS ? 'TRƯỚC' : 'SAU'} mốc đó).`), {
                command: nhan,
                user: interaction?.user ? `<@${interaction.user.id}>` : undefined,
                guild: interaction?.guildId,
                // MỘT trường `note`, không phải hai khoá riêng: `logError` chỉ render
                // command/user/guild/note — khoá lạ bị NUỐT IM LẶNG, tức phép đo sẽ không
                // đo gì mà vẫn trông như đã làm. (Tôi đã suýt deploy đúng lỗi đó.)
                note: `ping ${Number.isFinite(ping) ? Math.round(ping) + 'ms' : 'chưa có'} · ${dongTomTat()}`,
            });
    }, conLai);
    if (typeof hen.unref === 'function') hen.unref();

    return {
        /** @param {boolean} daNem execute() có ném lỗi không (lỗi đó đã được log riêng) */
        xong(daNem = false) {
            ketThuc = true;
            clearTimeout(hen);
            // Nhánh 2 — chạy xong SỚM mà vẫn không ack: có nhánh `return` quên trả lời.
            // Bỏ qua khi đã ném lỗi, vì handler bên ngoài tự trả lời và tự log rồi.
            if (daNem || daAck(interaction)) return;
            logError(`Chạy xong mà KHÔNG ack: ${nhan}`,
                new Error('execute() kết thúc nhưng chưa reply/defer — có nhánh return quên trả lời.'), {
                    command: nhan,
                    user: interaction?.user ? `<@${interaction.user.id}>` : undefined,
                    guild: interaction?.guildId,
                });
        },
    };
}

/**
 * Autocomplete có hạn 3 giây riêng và ack bằng `respond()`, không phải reply/defer.
 * Không respond thì Discord treo bảng gợi ý — người dùng thấy "Loading options…" mãi.
 */
function kiemAutocomplete(interaction, nhan) {
    if (interaction?.responded) return;
    logError(`Autocomplete không respond(): ${nhan}`,
        new Error('Bảng gợi ý treo ở "Loading options…" cho tới khi Discord bỏ cuộc.'), {
            command: nhan,
            user: interaction?.user ? `<@${interaction.user.id}>` : undefined,
            guild: interaction?.guildId,
        });
}

module.exports = { theoDoiAck, kiemAutocomplete, NGUONG_ACK_MS };
