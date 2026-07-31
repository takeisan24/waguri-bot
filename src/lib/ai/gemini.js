// Provider AI: Google Gemini (free tier). SDK: @google/generative-ai
const config = require('../../config');

let genAI = null;
function getClient() {
    if (!process.env.GEMINI_API_KEY) return null;
    if (!genAI) {
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

/**
 * @param {string} systemPrompt
 * @param {{role:'user'|'assistant', content:string}[]} history
 * @param {string} userText
 * @param {object} [options]
 * @returns {Promise<string>}
 */
const REQUEST_TIMEOUT_MS = 20000; // chặn treo -> tránh interaction Discord hết hạn

async function chat(systemPrompt, history, userText, options = {}) {
    const ai = getClient();
    if (!ai) throw new Error('Thiếu GEMINI_API_KEY');

    // Lọc an toàn rõ ràng (lenient — persona đã giữ trong sáng; chỉ chặn nội dung độc hại rõ rệt).
    const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
    const safetySettings = [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const primaryModel = options.model || config.AI.GEMINI_MODEL;
    const candidates = [
        primaryModel,
        'gemini-3.6-flash',
        'gemini-3.1-pro-preview',
        'gemini-3.5-flash',
        'gemini-1.5-flash'
    ].filter((m, i, self) => m && self.indexOf(m) === i);

    let lastError = null;

    for (let rawModelName of candidates) {
        let modelName = rawModelName;
        if (typeof modelName === 'string') {
            if (modelName === 'gemini-2.5-flash') modelName = 'gemini-3.6-flash';
            else if (modelName === 'gemini-2.5-pro') modelName = 'gemini-3.1-pro-preview';
            else if (modelName === 'gemini-2.5-flash-lite') modelName = 'gemini-3.5-flash-lite';
            else if (modelName.includes('2.5')) modelName = modelName.replace('2.5', '3.6');
        }

        const generationConfig = {
            maxOutputTokens: options.maxOutputTokens || config.AI.MAX_OUTPUT_TOKENS,
            temperature: options.temperature || 0.9,
        };

        try {
            const model = ai.getGenerativeModel({
                model: modelName,
                systemInstruction: systemPrompt,
                safetySettings,
                generationConfig,
            });

            const geminiHistory = history.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            }));

            const session = model.startChat({ history: geminiHistory });
            let timer;
            const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Gemini timeout')), REQUEST_TIMEOUT_MS);
            });

            try {
                const result = await Promise.race([session.sendMessage(userText), timeout]);
                return result.response.text();
            } finally {
                clearTimeout(timer);
            }
        } catch (err) {
            lastError = err;
            const errMsg = String(err?.message || '');
            const isModelError = err?.status === 404 || err?.status === 400 || 
                                 errMsg.includes('404') || errMsg.includes('400') ||
                                 errMsg.includes('not found') || errMsg.includes('not available') || 
                                 errMsg.includes('invalid argument');
            if (isModelError) {
                console.warn(`[GEMINI MODEL FALLBACK] Model '${modelName}' gặp lỗi (${err?.status || 'Model error'}), tự động thử model dự phòng tiếp theo...`);
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('Không thể kết nối với bất kỳ Gemini model nào');
}

module.exports = { chat };
