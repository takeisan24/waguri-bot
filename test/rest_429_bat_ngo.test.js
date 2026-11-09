// test/rest_429_bat_ngo.test.js
//
// 429 BẤT NGỜ của Discord — điểm mù của phép đo cũ và bản vá (09-11-2026).
//
// BỐI CẢNH. Từ 03/11 khoảng 1/3 lệnh vỡ với 50027: `editReply` tới Discord sau 15–60 phút,
// token (trần 15 phút) đã chết. Mọi tin log đều ghi "REST: chưa chạm hạn mức lần nào", và
// chữ đó từng được đọc là "đã LOẠI hạn mức". SAI: `@discordjs/rest` 2.6.3 gặp 429 bất ngờ
// thì chỉ `sleep(Retry-After)` — KHÔNG phát `rateLimited`, sự kiện duy nhất phép đo cũ nghe.
// Tuổi lúc vỡ trần ở ~3600s khớp đúng một Retry-After 1 giờ.
//
// CÁC PHÉP THỬ CHẠY THẬT trên `REST` của chính thư viện, chỉ thay tầng mạng (`makeRequest`).
// Đọc mã thì chỉ chứng minh được đoạn chữ có mặt; ở đây ta chứng minh request THẬT SỰ không
// ngủ một giờ, và số đo THẬT SỰ tới được tin log.

const { test } = require('node:test');
const assert = require('node:assert');

// Vá logger TRƯỚC khi require canhRest: canhRest destructure `logError` lúc nạp.
const logger = require('../src/lib/logger');
let nhatKyLog = [];
logger.logError = async (title, err, meta = {}) => { nhatKyLog.push({ title, err, meta }); };

const { REST } = require('@discordjs/rest');
const canhRest = require('../src/lib/canhRest');

const APP = '1482620714690543738';
const snowflakeLuc = (ms) => ((BigInt(ms) - 1420070400000n) << 22n).toString();
const BI_MAT = 'BIMAT-khong-duoc-lo-ra-log';
const tokenInteraction = (ms) => Buffer.from(`interaction:${snowflakeLuc(ms)}:${BI_MAT}`).toString('base64');

function phanHoi(status, headers = {}, body = {}) {
    const h = new Headers({ 'content-type': 'application/json', ...headers });
    return {
        status, statusText: String(status), ok: status >= 200 && status < 300, headers: h, body: null,
        arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(body)).buffer,
        json: async () => body, text: async () => JSON.stringify(body),
    };
}

/** REST thật của thư viện, tầng mạng giả trả lần lượt `chuoi`. */
function restGia(chuoi, { gan = true } = {}) {
    const goi = [];
    const rest = new REST({
        version: '10', retries: 0,
        makeRequest: async (url, init) => {
            goi.push({ url, method: init?.method });
            const r = chuoi[Math.min(goi.length - 1, chuoi.length - 1)];
            return typeof r === 'function' ? r() : r;
        },
    }).setToken('token-thu');
    if (gan) canhRest.ganMayDo429(rest);
    return { rest, goi };
}

const tranChoMs = async (p, ms) => Promise.race([
    p.then(v => ({ v }), e => ({ e })),
    new Promise(r => setTimeout(() => r({ treo: true }), ms)),
]);

test('ĐIỂM MÙ của thư viện: 429 bất ngờ KHÔNG phát `rateLimited`', async () => {
    // Phép thử này giữ cho tiền đề còn đúng. Nếu một bản discord.js sau này bắt đầu phát sự
    // kiện cho 429 bất ngờ, phép thử đỏ — lúc đó xem lại xem có còn cần bọc `makeRequest`.
    const { rest } = restGia([
        phanHoi(429, { 'retry-after': '0.05' }, { message: 'rl', retry_after: 0.05, global: false }),
        phanHoi(200, {}, { ok: 1 }),
    ], { gan: false });
    let suKien = 0;
    rest.on('rateLimited', () => { suKien++; });
    await rest.get('/channels/111111111111111111/messages');
    assert.strictEqual(suKien, 0,
        '`rateLimited` đã được phát cho 429 bất ngờ — tiền đề của bản vá đã đổi, xem lại `canhRest`.');
});

test('token interaction + Retry-After 1 giờ: ném NGAY, không ngủ, không bắn thêm request 401', async () => {
    nhatKyLog = [];
    const truoc = canhRest.tomTat().t429;
    const tok = tokenInteraction(Date.now() - 5_000);
    const { rest, goi } = restGia([
        phanHoi(429, { 'retry-after': '3600', 'x-ratelimit-scope': 'shared' }, { message: 'rl', retry_after: 3600 }),
        phanHoi(401, {}, { message: 'Invalid Webhook Token', code: 50027 }),
    ]);
    const kq = await tranChoMs(rest.patch(`/webhooks/${APP}/${tok}/messages/@original`, { body: { content: 'x' } }), 2_000);

    assert.ok(!kq.treo,
        'Request vẫn NGỦ theo Retry-After 1 giờ. Đó chính là cơ chế làm `editReply` tới Discord\n'
        + 'sau 15–60 phút (sự cố 03→09/11): token chết, rồi còn bắn thêm một request 401.');
    assert.ok(kq.e, 'Phải ném lỗi ngay khi Discord bắt chờ lâu hơn đời còn lại của token.');
    assert.ok(canhRest.laTuChoiVoVong(kq.e),
        `Lỗi ném ra phải nhận diện được là "từ chối sớm" (tên thật: ${kq.e?.name}).`);
    assert.strictEqual(goi.length, 1, 'Chỉ được có đúng MỘT request (cái nhận 429), không có request 401 sau đó.');

    const sau = canhRest.tomTat().t429;
    assert.strictEqual(sau.tong, truoc.tong + 1, 'Phép đo tầng mạng phải đếm được cú 429 này.');
    assert.ok(sau.choLauNhatMs >= 3_600_000, 'Phải giữ được Retry-After lớn nhất — nhân chứng trực tiếp.');
    assert.strictEqual(sau.tuChoiSom, truoc.tuChoiSom + 1);

    const tin = nhatKyLog.find(x => x.title === 'REST 429 kéo dài');
    assert.ok(tin, '429 bắt chờ > 60 giây phải gửi một tin vào kênh log.');
    assert.match(tin.meta.note, /Retry-After 3600s/);
    assert.match(tin.meta.note, /scope=shared/);
    assert.ok(!JSON.stringify(nhatKyLog).includes(tok) && !JSON.stringify(nhatKyLog).includes(BI_MAT),
        'Token interaction lọt vào tin log — chỉ được in đường dẫn đã xoá token.');
});

test('dòng tóm tắt in số 429 thật, và KHÔNG còn nói "chưa có gì" khi đã có 429', () => {
    const dong = canhRest.dongTomTat();
    assert.match(dong, /429 thật: [1-9]/,
        `Có 429 rồi mà dòng tóm tắt không nói — đúng lỗi mù cũ, chỉ khác chỗ. Dòng: ${dong}`);
    assert.match(dong, /Retry-After lớn nhất 3600s/);
});

test('webhook THẬT (không phải interaction): giữ hành vi cũ — chờ rồi gửi lại', async () => {
    const { rest, goi } = restGia([
        phanHoi(429, { 'retry-after': '0.2' }, { message: 'rl', retry_after: 0.2 }),
        phanHoi(200, {}, { ok: 1 }),
    ]);
    const kq = await tranChoMs(rest.post(`/webhooks/${APP}/day-la-token-webhook-that`, { body: {} }), 3_000);
    assert.ok(kq.v && !kq.e, `Webhook thật không được bị từ chối sớm (lỗi: ${kq.e?.name}).`);
    assert.strictEqual(goi.length, 2);
});

test('token interaction + Retry-After NGẮN hơn đời token: vẫn chờ rồi gửi được', async () => {
    const tok = tokenInteraction(Date.now() - 1_000);
    const { rest, goi } = restGia([
        phanHoi(429, { 'retry-after': '0.3' }, { message: 'rl', retry_after: 0.3 }),
        phanHoi(200, {}, { id: '1' }),
    ]);
    const kq = await tranChoMs(rest.patch(`/webhooks/${APP}/${tok}/messages/@original`, { body: {} }), 3_000);
    assert.ok(kq.v && !kq.e,
        `Chặn quá tay: chờ 0,3 giây vẫn kịp trong 15 phút mà lại bị từ chối (lỗi: ${kq.e?.name}).`);
    assert.strictEqual(goi.length, 2);
});

test('lời ACK (callback, sống 3 giây) + Retry-After 5 giây: ném ngay', async () => {
    const id = snowflakeLuc(Date.now() - 200);
    const { rest, goi } = restGia([
        phanHoi(429, { 'retry-after': '5' }, { message: 'rl', retry_after: 5 }),
        phanHoi(204),
    ]);
    const kq = await tranChoMs(rest.post(`/interactions/${id}/tok/callback`, { body: { type: 5 }, auth: false }), 2_000);
    assert.ok(!kq.treo && kq.e && canhRest.laTuChoiVoVong(kq.e),
        'Lời ack mà bị bắt chờ 5 giây thì chắc chắn trễ hạn 3 giây — phải ném ngay để log nói thật.');
    assert.strictEqual(goi.length, 1);
});

test('theoDoiRest (đường prod gọi) PHẢI gắn luôn lớp đo 429 + từ chối sớm', async () => {
    // index.js chỉ gọi `theoDoiRest(client)`. Viết `ganMayDo429` xong mà theoDoiRest không gọi
    // thì mọi phép thử bên trên vẫn xanh còn prod thì không có gì — hàm viết xong không ai gọi.
    const { rest, goi } = restGia([phanHoi(429, { 'retry-after': '3600' }, { message: 'rl' })], { gan: false });
    const truoc = canhRest.tomTat().t429.tong;
    canhRest.theoDoiRest({ rest });
    assert.strictEqual(typeof rest.options.rejectOnRateLimit, 'function',
        'theoDoiRest không gắn `rejectOnRateLimit` — prod vẫn ngủ cả giờ theo Retry-After.');
    const tok = tokenInteraction(Date.now());
    const kq = await tranChoMs(rest.patch(`/webhooks/${APP}/${tok}/messages/@original`, { body: {} }), 2_000);
    assert.ok(!kq.treo && kq.e, 'Qua đường theoDoiRest mà request vẫn ngủ theo Retry-After 1 giờ.');
    assert.strictEqual(canhRest.tomTat().t429.tong, truoc + 1, 'Qua đường theoDoiRest mà 429 không được đếm.');
    assert.strictEqual(goi.length, 1);
});

test('conSongMs: chỉ hiểu đường interaction, mọi đường khác trả null', () => {
    const now = Date.now();
    assert.strictEqual(canhRest.conSongMs(`https://discord.com/api/v10/channels/${APP}/messages`, now), null);
    assert.strictEqual(canhRest.conSongMs(`https://discord.com/api/v10/webhooks/${APP}/abcDEF`, now), null);
    const con = canhRest.conSongMs(`https://discord.com/api/v10/webhooks/${APP}/${tokenInteraction(now - 60_000)}/messages/@original`, now);
    assert.ok(Math.abs(con - 14 * 60_000) < 5, `token 1 phút tuổi phải còn ~14 phút, nhận ${con}`);
    assert.ok(!canhRest.duongAnToan(`https://discord.com/api/v10/webhooks/${APP}/${tokenInteraction(now)}/messages/@original`).includes(BI_MAT));
});
