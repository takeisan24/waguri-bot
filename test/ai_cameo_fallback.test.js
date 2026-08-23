const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const db = require('../src/database');
const gemini = require('../src/lib/ai/gemini');
const { chatWithWaguri, clearUserContexts } = require('../src/lib/ai');

// VIẾT LẠI 2026-08-23. Bản cũ tên là "Premium model fallback to Flash on failure" và nó gác
// một tầng lui mà nay không còn: người Premium từng bị định tuyến sang `gemini-3.6-flash`,
// hỏng thì mới lui về model thường.
//
// Tầng lui đó sinh ra để chữa triệu chứng của một quyết định sai. Đối chiếu bảng hạn mức
// thật thì `gemini-3.6-flash` có RPD 20 còn model thường có RPD 500 — người trả tiền bị đẩy
// sang chỗ chật hơn 25 lần, rồi mỗi lượt lại tốn thêm một vòng thử-rồi-lui. Bỏ gốc thì
// không cần tầng lui nữa.
//
// Nay gác điều ngược lại: người Premium phải đi CÙNG một model với người thường, ngay ở
// đường chạy thật. `test/ai_model_premium.test.js` gác ở tầng cấu hình; cái này gác tầng
// định tuyến trong `ai/index.js`.
test('AI: người Premium dùng cùng model với người thường', async () => {
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;

    const modelsAttempted = [];

    db.consumeAiQuota = async () => ({ allowed: true, used: 1, cap: 150, premium: true });

    gemini.chat = async (prompt, history, text, options) => {
        modelsAttempted.push(options?.model);
        return 'Premium reply';
    };

    try {
        const res = await chatWithWaguri('channelFallback', 'userFallback', 'Tester', 'Hello', 'vi');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.reply, 'Premium reply');

        assert.strictEqual(modelsAttempted.length, 1,
            `Người Premium phải gọi ĐÚNG MỘT model, không thử rồi lui. Đã gọi: ${modelsAttempted.join(' -> ')}`);
        assert.strictEqual(modelsAttempted[0], config.AI.GEMINI_MODEL,
            `Người Premium bị đẩy sang '${modelsAttempted[0]}' thay vì model thường `
            + `'${config.AI.GEMINI_MODEL}'. Xem chú thích ở config/index.js — model riêng cho `
            + 'Premium từng có hạn mức nhỏ hơn 25 lần.');
    } finally {
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
    }
});

// Tầng lui cũ vẫn còn trong `ai/index.js` và phải giữ: ai đó đặt GEMINI_PREMIUM_MODEL qua
// biến môi trường thì nó sống lại và là lưới an toàn. Test này gác cái lưới đó.
test('AI: nếu ép GEMINI_PREMIUM_MODEL khác thì vẫn có lưới lui về model thường', async () => {
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;
    const originalPremiumModel = config.AI.GEMINI_PREMIUM_MODEL;

    const modelsAttempted = [];
    config.AI.GEMINI_PREMIUM_MODEL = 'model-gia-de-thu';

    db.consumeAiQuota = async () => ({ allowed: true, used: 1, cap: 150, premium: true });
    gemini.chat = async (prompt, history, text, options) => {
        modelsAttempted.push(options?.model);
        if (options?.model === 'model-gia-de-thu') throw new Error('Model rate limit/quota error');
        return 'Fallback success response';
    };

    try {
        const res = await chatWithWaguri('channelFallback2', 'userFallback2', 'Tester', 'Hello', 'vi');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.reply, 'Fallback success response');
        assert.deepStrictEqual(modelsAttempted, ['model-gia-de-thu', config.AI.GEMINI_MODEL]);
    } finally {
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
        config.AI.GEMINI_PREMIUM_MODEL = originalPremiumModel;
    }
});

test('AI Upgrades: clearUserContexts clears RAM cache on GDPR deletedata', async () => {
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;

    db.consumeAiQuota = async () => ({
        allowed: true,
        used: 1,
        cap: 15,
        premium: false
    });

    gemini.chat = async () => 'Mock reply';

    try {
        // Chat once to populate cache
        await chatWithWaguri('chanGDPR', 'userGDPR', 'Tester', 'Keep this in memory', 'vi');
        
        // Clear contexts
        const cleared = clearUserContexts('userGDPR');
        assert.ok(cleared >= 1);
    } finally {
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
    }
});

test('AI Upgrades: Keyword scanner injects manga lore into prompt', async () => {
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;

    let capturedPrompt = '';

    db.consumeAiQuota = async () => ({
        allowed: true,
        used: 1,
        cap: 15,
        premium: false
    });

    gemini.chat = async (prompt) => {
        capturedPrompt = prompt;
        return 'Mock response';
    };

    try {
        await chatWithWaguri('channelLore', 'userLore', 'Tester', 'Mình muốn ăn bánh su kem ngon quá', 'vi');
        // Verify that the prompt contains the lore string for 'banh_su_kem'
        assert.ok(capturedPrompt.includes('đam mê bánh su kem ở tiệm Gekka'));
    } finally {
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
    }
});
