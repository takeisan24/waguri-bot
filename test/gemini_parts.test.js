// ============================================================
// test/gemini_parts.test.js — thêm đường cho ảnh mà KHÔNG phá lời gọi cũ.
//
// `gemini.chat` có ba nơi gọi: ai/index.js hai chỗ (chat thường + lưới lui Premium) và
// announcement.js:108 (sinh bản tin phát hành). Chỗ thứ ba không bao giờ truyền ảnh, và nếu
// hình dạng `parts` đổi cho cả nó thì bản tin gửi tới 19 server có thể vỡ mà không ai thử lại.
//
// Cổng này chốt: có ảnh -> hai phần đúng thứ tự; không có ảnh -> y hệt bản cũ.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const DUONG = require.resolve('../src/lib/ai/gemini');

/**
 * Gọi gemini.chat với một SDK giả, trả về đối số ĐÃ gửi lên API.
 *
 * Bản vá require phải sống SUỐT lời gọi chứ không chỉ lúc nạp module: `gemini.js` gọi
 * `require('@google/genai')` LƯỜI, bên trong `getClient()`, nên nếu gỡ vá ngay sau khi nạp
 * thì lúc chat() chạy nó lấy đúng SDK thật và bắn request ra ngoài — đã xảy ra thật ở bản
 * đầu của test này, lộ ra vì API trả "API key not valid".
 */
async function goiVoiSdkGia(sys, history, text, options) {
    // gemini.js chặn sớm nếu không có khoá. SDK đã là đồ giả nên chuỗi này không đi đâu cả.
    const khoaCu = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'khoa-gia-cho-test';

    const lanGoi = [];
    const goc = Module.prototype.require;
    Module.prototype.require = function (ten) {
        if (ten === '@google/genai') {
            return {
                GoogleGenAI: class {
                    constructor() {
                        this.models = {
                            generateContent: async (arg) => {
                                lanGoi.push(arg);
                                return { text: 'ok', usageMetadata: { promptTokenCount: 1 } };
                            }
                        };
                    }
                }
            };
        }
        return goc.apply(this, arguments);
    };

    delete require.cache[DUONG];
    try {
        const mod = require('../src/lib/ai/gemini');
        await mod.chat(sys, history, text, options);
    } finally {
        Module.prototype.require = goc;
        delete require.cache[DUONG];
        if (khoaCu === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = khoaCu;
    }

    assert.ok(lanGoi.length, 'SDK giả không được gọi — nghĩa là test đã bắn request THẬT ra ngoài.');
    return lanGoi[0];
}

const ANH = { mimeType: 'image/png', data: 'AAAA' };

test('KHÔNG có ảnh -> parts y hệt bản cũ, đúng một phần chữ', async () => {
    const goi = await goiVoiSdkGia('sys', [], 'chào cậu', {});
    const parts = goi.contents.at(-1).parts;

    assert.deepStrictEqual(parts, [{ text: 'chào cậu' }],
        'Lời gọi không truyền ảnh phải giữ nguyên hình dạng cũ — announcement.js:108 phụ thuộc vào nó.');
});

test('CÓ ảnh -> ảnh đứng TRƯỚC chữ', async () => {
    const goi = await goiVoiSdkGia('sys', [], 'cái này là gì', { anh: ANH });
    const parts = goi.contents.at(-1).parts;

    assert.strictEqual(parts.length, 2);
    assert.deepStrictEqual(parts[0], { inlineData: { mimeType: 'image/png', data: 'AAAA' } },
        'Model đọc theo thứ tự: nhìn ảnh rồi mới đọc câu hỏi về nó thì bám sát hơn.');
    assert.deepStrictEqual(parts[1], { text: 'cái này là gì' });
});

test('ảnh thiếu data hoặc mimeType -> bỏ qua, không gửi phần rỗng', async () => {
    for (const xau of [{ mimeType: 'image/png' }, { data: 'AAAA' }, {}, null]) {
        const goi = await goiVoiSdkGia('sys', [], 'hi', { anh: xau });
        const parts = goi.contents.at(-1).parts;
        assert.deepStrictEqual(parts, [{ text: 'hi' }],
            `Ảnh hỏng (${JSON.stringify(xau)}) phải bị bỏ chứ không tạo phần inlineData rỗng.`);
    }
});

test('lịch sử hội thoại vẫn thuần chữ, ảnh chỉ nằm ở lượt hiện tại', async () => {
    const goi = await goiVoiSdkGia('sys', [
        { role: 'user', content: 'tấm ảnh lúc nãy' },
        { role: 'assistant', content: 'ừ mình nhớ' },
    ], 'còn tấm này', { anh: ANH });

    const contents = goi.contents;
    for (const c of contents.slice(0, -1)) {
        assert.ok(c.parts.every(p => 'text' in p),
            'Lịch sử phải thuần chữ — gửi lại ảnh cũ mỗi lượt là nhân ~1090 token lên nhiều lần.');
    }
});
