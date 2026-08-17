// Provider AI: Google Gemini. Modern SDK: @google/genai
const config = require('../../config');

let aiClient = null;
function getClient() {
    const rawKey = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : '';
    if (!rawKey) return null;
    const { GoogleGenAI } = require('@google/genai');
    return new GoogleGenAI({ apiKey: rawKey });
}

// Đo thật 2026-08-17 trên `gemini-3.6-flash`: độ trễ dao động 4,8s – 39,5s (model dòng
// "thinking" nghĩ càng nhiều càng lâu). Mốc 20s cũ cắt ngang khá nhiều lượt đang chạy bình
// thường -> người dùng nhận lỗi thay vì câu trả lời chậm. Trả lời chậm vẫn hơn không có.
const REQUEST_TIMEOUT_MS = 35000;

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

    const primaryModel = options.model || config.AI.GEMINI_MODEL;
    const candidates = [
        primaryModel,
        'gemini-3.6-flash',
        'gemini-3.1-pro-preview'
    ].filter((m, i, self) => m && self.indexOf(m) === i);

    let lastError = null;

    for (let rawModelName of candidates) {
        let modelName = rawModelName;
        if (typeof modelName === 'string') {
            if (modelName === 'gemini-2.5-flash') modelName = 'gemini-3.6-flash';
            else if (modelName === 'gemini-2.5-pro') modelName = 'gemini-3.1-pro-preview';
            else if (modelName.includes('2.5')) modelName = 'gemini-3.6-flash';
        }

        const contents = history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));
        contents.push({ role: 'user', parts: [{ text: userText }] });

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
            timer = setTimeout(() => reject(new Error('Gemini timeout')), REQUEST_TIMEOUT_MS);
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
