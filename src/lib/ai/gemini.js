// Provider AI: Google Gemini. Modern SDK: @google/genai
const config = require('../../config');

let aiClient = null;
function getClient() {
    if (!process.env.GEMINI_API_KEY) return null;
    if (!aiClient) {
        const { GoogleGenAI } = require('@google/genai');
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    return aiClient;
}

const REQUEST_TIMEOUT_MS = 20000;

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
            systemInstruction: systemPrompt,
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
            return result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } catch (err) {
            lastError = err;
            const errMsg = String(err?.message || '');
            const isModelError = err?.status === 404 || err?.status === 400 ||
                                 errMsg.includes('404') || errMsg.includes('400') ||
                                 errMsg.includes('not found') || errMsg.includes('not available') ||
                                 errMsg.includes('invalid argument');
            if (isModelError) {
                console.warn(`[GEMINI MODEL FALLBACK] Model '${modelName}' gặp lỗi (${err?.status || 'Model error'}), thử model tiếp theo...`);
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
