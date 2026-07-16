const { test } = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const db = require('../src/database');
const gemini = require('../src/lib/ai/gemini');
const { chatWithWaguri } = require('../src/lib/ai');

test('Hybrid Model Selection: free user uses gemini-2.5-flash', async () => {
    // Save original database and gemini functions
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;

    let requestedModel = null;

    // Mock consumeAiQuota for free user
    db.consumeAiQuota = async () => ({
        allowed: true,
        used: 1,
        cap: 15,
        premium: false
    });

    // Mock gemini chat to capture the requested model
    gemini.chat = async (prompt, history, text, options) => {
        requestedModel = options?.model;
        return 'Mock response';
    };

    try {
        await chatWithWaguri('channel123', 'user123', 'Tester', 'Hello', 'vi');
        assert.strictEqual(requestedModel, config.AI.GEMINI_MODEL);
    } finally {
        // Restore original functions
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
    }
});

test('Hybrid Model Selection: premium user uses gemini-2.5-pro', async () => {
    const originalConsumeAiQuota = db.consumeAiQuota;
    const originalChat = gemini.chat;

    let requestedModel = null;

    // Mock consumeAiQuota for premium user
    db.consumeAiQuota = async () => ({
        allowed: true,
        used: 1,
        cap: 150,
        premium: true
    });

    // Mock gemini chat to capture the requested model
    gemini.chat = async (prompt, history, text, options) => {
        requestedModel = options?.model;
        return 'Mock response';
    };

    try {
        await chatWithWaguri('channel123', 'user123', 'Tester', 'Hello', 'vi');
        assert.strictEqual(requestedModel, config.AI.GEMINI_PREMIUM_MODEL);
    } finally {
        db.consumeAiQuota = originalConsumeAiQuota;
        gemini.chat = originalChat;
    }
});
