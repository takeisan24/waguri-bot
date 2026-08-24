const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Thiết lập env dummy cho test. Dùng port cụ thể không phải 0 để tránh falsy check trong startVoteServer
process.env.TOPGG_WEBHOOK_AUTH = 'test_topgg_secret';
process.env.CASSO_WEBHOOK_TOKEN = 'test_casso_token';
process.env.BOT_NOTIFY_SECRET = 'test_notify_secret';
process.env.DBL_WEBHOOK_AUTH = 'test_dbl_secret';
process.env.PORT = '19999';

const { startVoteServer } = require('../src/lib/voteServer');

describe('HTTP Vote & Stats Server Integration Tests', () => {
    let clientMock;
    let serverInstance;

    before(() => {
        // Mock client discord.js cơ bản
        clientMock = {
            ws: { ping: 42 },
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
        assert.strictEqual(json.gatewayPing, 42);
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

    // --- /dbl/vote: webhook vote của discordbotlist.com ---
    // Payload của họ KHÔNG có chữ ký HMAC, chỉ có secret thô ở header — nên cửa 401 chính
    // là toàn bộ lớp bảo vệ. Nhánh phát thưởng cần DB thật nên chỉ test tới mức route.
    const DBL = 'http://127.0.0.1:19999/dbl/vote';
    const postDbl = (headers, body) =>
        fetch(DBL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

    test('POST /dbl/vote tra 401 khi thieu Authorization', async () => {
        const res = await postDbl({}, JSON.stringify({ id: '999999999999999999' }));
        assert.strictEqual(res.status, 401);
    });

    test('POST /dbl/vote tra 401 khi secret sai', async () => {
        const res = await postDbl({ Authorization: 'sai_secret' }, JSON.stringify({ id: '999999999999999999' }));
        assert.strictEqual(res.status, 401);
    });

    test('POST /dbl/vote tra 200 khi secret dung', async () => {
        const res = await postDbl({ Authorization: 'test_dbl_secret' }, JSON.stringify({ id: '999999999999999999' }));
        assert.strictEqual(res.status, 200);
    });

    test('POST /dbl/vote khong sap khi payload thieu id / id rac', async () => {
        for (const body of ['{}', JSON.stringify({ id: 'khong-phai-so' }), JSON.stringify({ id: '12' }), 'khong-phai-json']) {
            const res = await postDbl({ Authorization: 'test_dbl_secret' }, body);
            assert.strictEqual(res.status, 200, `body ${body} phai duoc ACK 200`);
        }
        // Server vẫn sống sau loạt payload rác.
        const health = await fetch('http://127.0.0.1:19999/');
        assert.strictEqual(health.status, 200);
    });

    // Chốt quyết định cân bằng ở config.VOTE.DBL: mở nền tảng list thứ hai KHÔNG được
    // phép nhân đôi trần thu nhập vote mà đợt 5 đã cố tình cắt xuống. Ai nâng số này
    // vượt mức nền của Top.gg thì test đỏ trước khi kịp lên production.
    test('thuong vote DBL khong duoc vuot muc nen cua Top.gg', () => {
        const config = require('../src/config');
        assert.ok(config.VOTE.DBL.REWARD <= config.VOTE.REWARD,
            `DBL.REWARD (${config.VOTE.DBL.REWARD}) phai <= VOTE.REWARD (${config.VOTE.REWARD})`);
        assert.ok(config.VOTE.DBL.EXP <= config.VOTE.EXP,
            `DBL.EXP (${config.VOTE.DBL.EXP}) phai <= VOTE.EXP (${config.VOTE.EXP})`);
    });

    // --- /premium/notify: web báo bot "có người bấm đã chuyển khoản" ---
    // Endpoint này dẫn tới việc CẤP HÀNG ĐÃ TRẢ TIỀN, nên phần đáng test nhất là các cửa
    // TỪ CHỐI: thiếu secret, sai secret, mã rác. Nhánh thành công cần DB + Discord thật
    // nên để cho kiểm thử tay.
    const NOTIFY = 'http://127.0.0.1:19999/premium/notify';
    const postNotify = (headers, body) =>
        fetch(NOTIFY, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

    test('POST /premium/notify tra 401 khi thieu secret', async () => {
        const res = await postNotify({}, JSON.stringify({ code: 'WAGURI0123ABCD' }));
        assert.strictEqual(res.status, 401);
    });

    test('POST /premium/notify tra 401 khi secret sai', async () => {
        const res = await postNotify({ 'x-waguri-secret': 'sai_bet_roi' }, JSON.stringify({ code: 'WAGURI0123ABCD' }));
        assert.strictEqual(res.status, 401);
    });

    test('POST /premium/notify tra 400 khi ma don khong dung dinh dang', async () => {
        const res = await postNotify({ 'x-waguri-secret': 'test_notify_secret' }, JSON.stringify({ code: 'khong-phai-ma' }));
        assert.strictEqual(res.status, 400);
    });
});
