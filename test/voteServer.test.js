const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Thiết lập env dummy cho test. Dùng port cụ thể không phải 0 để tránh falsy check trong startVoteServer
process.env.TOPGG_WEBHOOK_AUTH = 'test_topgg_secret';
process.env.CASSO_WEBHOOK_TOKEN = 'test_casso_token';
process.env.PORT = '19999';

const { startVoteServer } = require('../src/lib/voteServer');

describe('HTTP Vote & Stats Server Integration Tests', () => {
    let clientMock;
    let serverInstance;

    before(() => {
        // Mock client discord.js cơ bản
        clientMock = {
            user: { id: '123456789', displayAvatarURL: () => 'https://waguri.avatar.url' },
            guilds: {
                cache: {
                    size: 5,
                    map: (fn) => [{ id: '111' }, { id: '222' }].map(fn),
                    reduce: (fn, init) => [{ memberCount: 10 }, { memberCount: 20 }].reduce(fn, init)
                }
            }
        };

        // Ghi đè http.createServer để lưu lại instance server nhằm tắt sau khi test xong
        const originalCreateServer = http.createServer;
        http.createServer = function(...args) {
            const s = originalCreateServer.apply(this, args);
            serverInstance = s;
            return s;
        };

        startVoteServer(clientMock);

        // Khôi phục createServer gốc
        http.createServer = originalCreateServer;
    });

    after(async () => {
        if (serverInstance) {
            await new Promise((resolve) => serverInstance.close(resolve));
        }
    });

    test('GET / health endpoint returns 200 and Waguri OK', async () => {
        const res = await fetch(`http://127.0.0.1:19999/`);
        assert.strictEqual(res.status, 200);
        const text = await res.text();
        assert.strictEqual(text, 'Waguri OK 🌸');
    });

    test('GET /stats endpoint returns 200 and stats JSON', async () => {
        const res = await fetch(`http://127.0.0.1:19999/stats`);
        assert.strictEqual(res.status, 200);
        const json = await res.json();
        assert.strictEqual(json.servers, 5);
        assert.strictEqual(json.users, 30);
    });

    test('POST /casso/webhook returns 401 if secure-token header is invalid', async () => {
        const res = await fetch(`http://127.0.0.1:19999/casso/webhook`, {
            method: 'POST',
            headers: {
                'secure-token': 'wrong_token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: [] })
        });
        assert.strictEqual(res.status, 401);
    });

    test('POST /casso/webhook returns 200 if secure-token header is valid', async () => {
        const res = await fetch(`http://127.0.0.1:19999/casso/webhook`, {
            method: 'POST',
            headers: {
                'secure-token': 'test_casso_token',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: [] })
        });
        assert.strictEqual(res.status, 200);
        const json = await res.json();
        assert.strictEqual(json.success, true);
    });

    test('POST /topgg/vote returns 401 if Authorization header is invalid (legacy auth)', async () => {
        const res = await fetch(`http://127.0.0.1:19999/topgg/vote`, {
            method: 'POST',
            headers: {
                'Authorization': 'wrong_secret',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'test' })
        });
        assert.strictEqual(res.status, 401);
    });

    test('POST /topgg/vote returns 200 if Authorization header is valid (legacy auth)', async () => {
        const res = await fetch(`http://127.0.0.1:19999/topgg/vote`, {
            method: 'POST',
            headers: {
                'Authorization': 'test_topgg_secret',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ type: 'test' })
        });
        assert.strictEqual(res.status, 200);
    });
});
