// Provider AI: Google Gemini. Modern SDK: @google/genai
const config = require('../../config');

// Lịch sử con số này:
//   20s -> 35s (2026-08-17): `gemini-3.6-flash` là model dòng "thinking", đo được 4,8s–39,5s;
//                            mốc 20s cắt ngang cả những lượt đang chạy bình thường.
//   35s -> 15s (2026-08-18): chuyển sang flash-lite, đo được ~1,4s và KHÔNG có pha suy nghĩ.
//   15s -> 25s (2026-09-23): nâng lên 25s (hỗ trợ GEMINI_TIMEOUT_MS) để chống chịu tốt khi
//                            mạng VPS/Container bị jitter hoặc TCP retransmission rớt gói.
const REQUEST_TIMEOUT_MS = config.AI?.REQUEST_TIMEOUT_MS || Number(process.env.GEMINI_TIMEOUT_MS) || 25000;

let aiClient = null;
function getClient() {
    const rawKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
    if (!rawKey) return null;
    const { GoogleGenAI } = require('@google/genai');
    return new GoogleGenAI({
        apiKey: rawKey,
        httpOptions: { timeout: REQUEST_TIMEOUT_MS }
    });
}

/**
 * Đọc kết quả từ Gemini — cẩn thận hơn `result.text || parts[0].text` cũ.
 *
 * Hai vấn đề của cách cũ:
 *  1. `parts[0]` có thể là phần SUY NGHĨ (`part.thought === true`) chứ không phải câu trả
 *     lời, và khi có nhiều part thì nó bỏ mất các part sau.
 *  2. Không hề kiểm `finishReason`. Model dòng thinking tiêu token suy nghĩ TRONG CÙNG
 *     ngân sách `maxOutputTokens`, nên khi nghĩ nhiều là câu trả lời bị cắt NGANG TỪ.
 *     Đo thật với trần 600: nghĩ 521–574 token -> chỉ còn 22 token cho câu trả lời,
 *     **2/3 lượt bị cắt**. Người dùng thấy "Ôi, nghe cậu nói muốn học" rồi hết.
 *
 * Trần đã nâng lên 2000 (config.AI.MAX_OUTPUT_TOKENS) nên chuyện này hiếm đi nhiều, nhưng
 * vẫn phải xử lý: thà cắt về câu hoàn chỉnh cuối còn hơn để lửng giữa từ.
 */
function docKetQua(result, modelName) {
    const cand = result?.candidates?.[0];
    const parts = cand?.content?.parts || [];

    // Ghép MỌI part không phải suy nghĩ, thay vì chỉ lấy part đầu.
    const ghep = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
    let text = result?.text || ghep || '';

    if (cand?.finishReason === 'MAX_TOKENS') {
        const u = result?.usageMetadata || {};
        console.warn(`[GEMINI] Câu trả lời bị cắt vì hết ngân sách token ` +
            `(model ${modelName}, nghĩ ${u.thoughtsTokenCount ?? '?'} + trả lời ${u.candidatesTokenCount ?? '?'} token). ` +
            `Cân nhắc nâng config.AI.MAX_OUTPUT_TOKENS.`);
        text = catVeCauHoanChinh(text);
    }
    return text;
}

/** Cắt về dấu kết câu cuối cùng để không bỏ lửng giữa từ. Giữ nguyên nếu không tìm thấy. */
function catVeCauHoanChinh(text) {
    if (!text) return text;
    const cat = Math.max(text.lastIndexOf('.'), text.lastIndexOf('!'), text.lastIndexOf('?'),
                         text.lastIndexOf('~'), text.lastIndexOf('…'));
    // Chỉ cắt khi phần giữ lại vẫn đủ dài — tránh biến câu trả lời thành một chữ.
    if (cat > 40) return text.slice(0, cat + 1);
    return text.replace(/\s+\S*$/, '') + '…';
}

/**
 * @param {string} systemPrompt
 * @param {{role:'user'|'assistant', content:string}[]} history
 * @param {string} userText
 * @param {object} [options]
 * @returns {Promise<string>}
 */
async function chat(systemPrompt, history, userText, options = {}) {
    const ai = getClient();
    if (!ai) throw new Error('Thiếu GEMINI_API_KEY');

    // Thứ tự dự phòng, xếp theo ĐỘ TIN CẬY ĐO ĐƯỢC trên gói free:
    //   1. model chính (mặc định gemini-3.5-flash-lite — ~1,4s, RPD 500 / RPM 15)
    //   2. gemini-3.1-flash-lite: dòng flash-lite, có túi RPD 500 / RPM 15 ĐỘC LẬP
    //
    // ĐÃ GỠ `gemini-3.6-flash` (2026-09-24):
    // Trên gói free, model dòng flash thông thường (3.6 Flash) chỉ có RPD 20 và RPM 5,
    // lại có pha suy nghĩ (chậm, dễ timeout). Bảng hạn mức thực tế cho thấy nó nhanh chóng
    // bị đỏ ở mức 21/20, làm nhánh dự phòng tê liệt. Thay bằng `gemini-3.1-flash-lite`
    // (RPD 500, RPM 15 riêng biệt) giúp hệ thống bền bỉ tối đa.
    const primaryModel = options.model || config.AI.GEMINI_MODEL;
    const fallbackModel = config.AI?.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite';
    const candidates = [
        primaryModel,
        fallbackModel
    ].filter((m, i, self) => m && self.indexOf(m) === i);

    let lastError = null;

    for (let rawModelName of candidates) {
        let modelName = rawModelName;
        if (typeof modelName === 'string') {
            if (modelName === 'gemini-2.5-flash') modelName = 'gemini-3.5-flash-lite';
            else if (modelName === 'gemini-2.5-pro') modelName = 'gemini-3.5-flash-lite';
            else if (modelName.includes('2.5')) modelName = 'gemini-3.5-flash-lite';
            else if (modelName === 'gemini-3.6-flash') modelName = 'gemini-3.1-flash-lite';
        }

        const contents = history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        // Ảnh (nếu có) đứng TRƯỚC chữ: model đọc theo thứ tự, nhìn ảnh rồi mới đọc câu hỏi
        // về nó thì bám sát hơn là ngược lại.
        //
        // `options.anh` là {mimeType, data} đã qua src/lib/ai/taiAnh.js. Không truyền thì
        // parts y hệt bản cũ — announcement.js:108 và mọi lời gọi cũ không suy suyển.
        const partsNguoiDung = [];
        if (options.anh?.data && options.anh?.mimeType) {
            partsNguoiDung.push({ inlineData: { mimeType: options.anh.mimeType, data: options.anh.data } });
        }
        partsNguoiDung.push({ text: userText });
        contents.push({ role: 'user', parts: partsNguoiDung });

        const safetySettings = [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
        ];

        const reqConfig = {
            systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
            maxOutputTokens: options.maxOutputTokens || config.AI.MAX_OUTPUT_TOKENS,
            temperature: options.temperature || 0.9,
            safetySettings,
        };

        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Gemini timeout (sau ${REQUEST_TIMEOUT_MS}ms)`)), REQUEST_TIMEOUT_MS);
        });

        try {
            const apiCall = ai.models.generateContent({
                model: modelName,
                contents: contents,
                config: reqConfig
            });

            const result = await Promise.race([apiCall, timeout]);
            return docKetQua(result, modelName);
        } catch (err) {
            lastError = err;
            const errMsg = String(err?.message || '');
            if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('API key not valid')) {
                console.error('[GEMINI FATAL ERROR] GEMINI_API_KEY không hợp lệ hoặc đã bị hết hạn/thu hồi!');
                throw err;
            }

            const isModelError = err?.status === 404 || err?.status === 503 || err?.status === 429 ||
                                 errMsg.includes('404') || errMsg.includes('503') || errMsg.includes('429') ||
                                 errMsg.includes('UNAVAILABLE') || errMsg.includes('high demand') ||
                                 errMsg.includes('RESOURCE_EXHAUSTED') ||
                                 errMsg.includes('not found') || errMsg.includes('not available');

            // CẠN HẠN MỨC thì đừng lui sang model khác.
            //
            // Đo 2026-08-23 trên bảng hạn mức thật: model chính `gemini-3.5-flash-lite` có
            // RPD 500, còn `gemini-3.6-flash` chỉ có RPD **20** — nhỏ hơn 25 lần, và đã vượt
            // trần (24/20). Lui sang nó lúc cạn hạn mức là đổi một lỗi 429 lấy một lỗi 429
            // khác, cộng 1,5 giây chờ vô ích, cộng việc đốt nốt hạn mức tí hon của nó.
            //
            // Đúng cái bẫy chú thích ở đầu hàm đã tự cảnh báo, chỉ khác con số: bản cũ có
            // model `limit: 0` ở bậc cuối. Hạn mức 20 không bằng 0 nhưng gần như vậy.
            //
            // 503/404 thì lui vẫn có lý — đó là model trục trặc, không phải ta hết lượt.
            const canHanMuc = err?.status === 429 || errMsg.includes('429') ||
                              errMsg.includes('RESOURCE_EXHAUSTED');
            if (canHanMuc) {
                console.warn(`[GEMINI HẠN MỨC] '${modelName}' cạn hạn mức — không lui sang model khác vì model dự phòng có hạn mức nhỏ hơn nhiều.`);
                throw err;
            }

            if (isModelError) {
                console.warn(`[GEMINI MODEL FALLBACK] Model '${modelName}' gặp lỗi quá tải/tạm dừng (${err?.status || '503/404'}), tự động thử lại sau 1.5s...`);
                await new Promise(r => setTimeout(r, 1500));
                continue;
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    throw lastError || new Error('Không thể kết nối với bất kỳ Gemini model nào');
}

module.exports = { chat };
