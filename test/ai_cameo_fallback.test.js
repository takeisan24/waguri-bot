const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const db = require('../src/database');
const gemini = require('../src/lib/ai/gemini');
const { chatWithWaguri, clearUserContexts } = require('../src/lib/ai');

test('AI Upgrades: Premium model fallback to Flash on failure', async () => {
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;

    let modelsAttempted = [];

    // Mock consumeAiQuota for premium user
    db.consumeAiQuota = async () => ({
        allowed: true,
        used: 1,
        cap: 150,
        premium: true
    });

    // Mock gemini chat to fail on the premium model, but succeed on the base model
    gemini.chat = async (prompt, history, text, options) => {
        const model = options?.model;
        modelsAttempted.push(model);
        if (model === config.AI.GEMINI_PREMIUM_MODEL) {
            throw new Error('Pro model rate limit/quota error');
        }
        return 'Fallback success response';
    };

    try {
        const res = await chatWithWaguri('channelFallback', 'userFallback', 'Tester', 'Hello', 'vi');
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.reply, 'Fallback success response');
        // Assert that both models were called in order: Premium, then Base
        assert.deepStrictEqual(modelsAttempted, [config.AI.GEMINI_PREMIUM_MODEL, config.AI.GEMINI_MODEL]);
    } finally {
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
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
