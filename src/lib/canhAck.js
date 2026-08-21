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

    // Nhánh 1 — lệnh CHẠY QUÁ LÂU mà chưa ack. Người dùng đã thấy "did not respond"
    // trước khi execute() kịp xong, nên phải báo ngay tại mốc chứ không đợi.
    const hen = setTimeout(() => {
        if (ketThuc || daAck(interaction)) return;
        // Tên lệnh nằm trong TIÊU ĐỀ chứ không trong nội dung lỗi: logger gộp trùng theo
        // (tiêu đề + dòng đầu của lỗi), nên để chung tiêu đề thì mọi lệnh sẽ dồn vào MỘT
        // khoá và chỉ lệnh đầu tiên được báo.
        logError(`Chưa ack sau ${NGUONG_ACK_MS}ms: ${nhan}`,
            new Error('Người dùng đã thấy "The application did not respond".'), {
                command: nhan,
                user: interaction?.user ? `<@${interaction.user.id}>` : undefined,
                guild: interaction?.guildId,
            });
    }, NGUONG_ACK_MS);
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
