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
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-2.0-flash-exp'
    ].filter((m, i, self) => m && self.indexOf(m) === i);

    let lastError = null;

    for (let rawModelName of candidates) {
        let modelName = rawModelName;
        if (typeof modelName === 'string' && modelName.includes('2.5')) {
            modelName = modelName.replace('2.5', '1.5');
        }

        const generationConfig = {
            maxOutputTokens: options.maxOutputTokens || config.AI.MAX_OUTPUT_TOKENS,
            temperature: options.temperature || 0.9,
        };

        // Chỉ đặt thinkingConfig cho các model 2.5/3.x hỗ trợ thinking và không phải bản Pro
        if (typeof modelName === 'string' && /2\.5|3\./i.test(modelName) && !/pro/i.test(modelName)) {
            generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }

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
            if (err?.status === 404 || errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('not available')) {
                console.warn(`[GEMINI MODEL FALLBACK] Model '${modelName}' gặp lỗi 404, tự động thử model dự phòng tiếp theo...`);
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('Không thể kết nối với bất kỳ Gemini model nào');
}

module.exports = { chat };
