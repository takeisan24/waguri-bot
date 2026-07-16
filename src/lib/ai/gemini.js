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

    const model = ai.getGenerativeModel({
        model: options.model || config.AI.GEMINI_MODEL, // tôn trọng model do tầng trên chọn (Premium / fallback)
        systemInstruction: systemPrompt,
        safetySettings,
        generationConfig: {
            maxOutputTokens: options.maxOutputTokens || config.AI.MAX_OUTPUT_TOKENS,
            temperature: options.temperature || 0.9,
            // Tắt "thinking" của Gemini 2.5 (nếu không, thinking ăn hết token -> câu trả lời bị cụt)
            thinkingConfig: { thinkingBudget: 0 },
        },
    });

    const geminiHistory = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    const session = model.startChat({ history: geminiHistory });
    // Timeout: nếu Gemini treo quá lâu -> ném lỗi để tầng trên xử lý nhẹ nhàng.
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Gemini timeout')), REQUEST_TIMEOUT_MS); });
    try {
        const result = await Promise.race([session.sendMessage(userText), timeout]);
        return result.response.text();
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { chat };
