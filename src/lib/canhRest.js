// ============================================================
// lib/canhRest.js — Đo xem REST ra Discord có bị XẾP HÀNG không.
//
// VÌ SAO CÓ. Nhóm lỗi lớn nhất còn lại của bot là ack/10062: đo trên toàn bộ kênh log
// 25-10-2026, 164/439 tin (37%) thuộc nhóm này. Nhưng dữ liệu log hiện có đã cạn khả năng
// giải thích, và ba phép đo sau đã LOẠI được ba nghi phạm:
//
//   · KHÔNG phải độ trễ gateway vào: `canhAck` đo từ `interaction.createdTimestamp` và báo
//     "đã trôi 120–320ms TRƯỚC khi đồng hồ được bấm" — mà mốc bấm đồng hồ nằm SAU cả lượt
//     tra ngôn ngữ (dòng 154 so với dòng 99 của `interactionCreate.js`). Tức cả đoạn
//     gateway + tra DB ngôn ngữ chỉ tốn ~0,2s trong ngân sách 3 giây.
//   · KHÔNG phải việc nền định kỳ: phân bố theo phút-trong-giờ gần như phẳng, không có
//     đỉnh nào ra dáng cron. Theo giờ thì nó trùng đúng giờ cao điểm người chơi.
//   · KHÔNG phải tiến trình bị đứng: 164 sự kiện gom thành 107 CỤM RỜI RẠC; chỉ 3 cụm có
//     từ 2 lệnh khác nhau cùng vỡ, và 2 trong 3 cụm đó từ 19/08. Event loop bị chặn sẽ làm
//     mọi lệnh đang bay cùng vỡ một lúc — không thấy dấu đó.
//
// Còn lại đúng một nghi phạm: lời gọi `deferReply()` — một POST ra Discord — mất hơn 2,3
// giây. Hai cách giải thích là REST bị XẾP HÀNG (chạm hạn mức, nhất là hạn mức TOÀN CỤC)
// hoặc jitter mạng từ host. Cả hai đều dự đoán "vỡ lẻ tẻ", nên dữ liệu cũ không phân biệt
// được. Module này phân biệt: nếu chạm hạn mức thì `client.rest` PHÁT SỰ KIỆN, còn jitter
// mạng thì không phát gì.
//
// ĐỌC KẾT QUẢ Ở ĐÂU: `canhAck` nhúng `tomTat()` vào ngay tin cảnh báo ack. Nên lần vỡ tiếp
// theo TỰ NÓI nguyên nhân, thay vì ta lại đoán. `gan60s > 0` ở đúng lúc vỡ = xếp hàng;
// `gan60s = 0` suốt mà vẫn vỡ = jitter mạng, và khi đó bản vá phải đi hướng khác (ack sớm
// hơn / chịu đựng, chứ không phải giảm số lời gọi REST).
//
// KHÔNG gửi gì thêm vào kênh log cho hạn mức theo-route: chính kênh đó đang có 42% là cảnh
// báo ANTI-NUKE, thêm nhiễu nữa thì phép đo sau lại khó đọc. Route thì ghi console; chỉ
// hạn mức TOÀN CỤC mới đáng gửi kênh (nó hiếm và nó chặn MỌI request, kể cả ack).
//
// ⚠️ ĐIỂM MÙ, PHÁT HIỆN 09-11-2026 — đọc trước khi tin chữ "chưa chạm hạn mức":
// sự kiện `rateLimited` CHỈ được phát khi discord.js TỰ BIẾT TRƯỚC là phải chờ (nhánh
// `while (this.limited)`). Khi Discord trả 429 BẤT NGỜ, `@discordjs/rest` 2.6.3 (cả
// SequentialHandler lẫn BurstHandler) chỉ ghi `restDebug` rồi `await sleep(Retry-After)` —
// KHÔNG phát sự kiện nào. Tức phép đo cũ mù đúng cái ca có thể bắt một request ngủ cả giờ.
// Mọi tin log 04→09/11 ghi "chưa chạm hạn mức lần nào" vì thế KHÔNG loại được 429.
// Dấu vết khớp với giả thuyết đó: tuổi interaction lúc vỡ trần ở ~3600s (= Retry-After 1
// giờ, kiểu Cloudflare chặn IP), và tin lỗi về theo nhịp đều ~70 phút.
//
// Vá bằng hai việc, cả hai gắn ở `ganMayDo429()`:
//   1. Bọc `rest.options.makeRequest` — thấy MỌI phản hồi ở tầng mạng, trước khi thư viện
//      quyết định ngủ. Đếm 429 (kèm Retry-After, scope, global, có phải trang HTML của
//      Cloudflare không) và đếm request hỏng 401/403/429 trong 10 phút (Cloudflare chặn IP
//      khi quá 10.000 / 10 phút). 429 bắt chờ > 60 giây thì báo kênh log, tối đa 1 lần/10 phút.
//   2. `rejectOnRateLimit`: nếu Discord bắt chờ LÂU HƠN thời gian sống còn lại của token
//      interaction (3 giây cho lời ack, 15 phút cho editReply/followUp) thì request đằng nào
//      cũng hỏng — ném lỗi NGAY thay vì ngủ cả giờ rồi bắn thêm một request 401. Chỉ đụng
//      đường interaction; webhook thật và mọi đường khác giữ nguyên hành vi cũ.
// ============================================================
const { logError } = require('./logger');

// Mốc thời gian của các lần chạm hạn mức gần đây. Chặn trần để không phình vô hạn.
const GIU_TOI_DA = 400;
const moc = [];
let tongCong = 0;
let tongToanCuc = 0;
// Mốc lần chạm GẦN NHẤT và lần bị bắt chờ LÂU NHẤT.
//
// VÌ SAO phải có hai số này, ngoài `gan60s` đã có: `gan60s` chỉ đúng cho nhóm ack/10062, nơi
// lệnh vỡ NGAY lúc hàng đợi nghẹt. Nhóm 50027 (sự cố 03–04/11/2026) thì ngược — `editReply`
// nằm trong hàng đợi 78–104 PHÚT rồi mới vỡ, nên lúc bắt được lỗi thì cú chạm hạn mức đã
// trôi khỏi cửa sổ 60 giây từ lâu. `gan60s` sẽ trả 0 và tin cảnh báo sẽ nói "không chạm hạn
// mức" trong đúng cái ca mà hạn mức là nghi phạm số một. Hai số dưới đây không mù chỗ đó:
// `lanCuoi` cho phép đối chiếu với TUỔI interaction (trùng nhau = cùng một sự kiện), còn
// `choLauNhat` lộ ngay một `retry_after` khổng lồ nếu Discord từng trả về.
let lanCuoi = 0;
let choLauNhat = 0;
// Đường (route) bị chạm nhiều nhất -> gợi ý chỗ gây xếp hàng.
const demTheoDuong = new Map();
// Chống spam: hạn mức toàn cục chỉ gửi kênh nhiều nhất 1 lần / 10 phút.
let lanGuiToanCuc = 0;
const CACH_GUI_MS = 10 * 60 * 1000;

function ghiNhan(info) {
    const now = Date.now();
    tongCong++;
    moc.push(now);
    if (moc.length > GIU_TOI_DA) moc.splice(0, moc.length - GIU_TOI_DA);
    lanCuoi = now;
    // `timeToReset` có thể thiếu/không phải số -> Number() rồi lọc NaN, đừng để một trường
    // lạ của discord.js biến `choLauNhat` thành NaN và nuốt luôn số đo.
    const cho = Number(info?.timeToReset);
    if (Number.isFinite(cho) && cho > choLauNhat) choLauNhat = cho;

    const duong = String(info?.route || info?.url || '?').slice(0, 120);
    demTheoDuong.set(duong, (demTheoDuong.get(duong) || 0) + 1);

    if (info?.global) {
        tongToanCuc++;
        console.warn(`[REST] Hạn mức TOÀN CỤC — chờ ${info.timeToReset}ms · ${info.method} ${duong}`);
        // Hạn mức toàn cục chặn cả lời ack, nên nó là nguyên nhân trực tiếp của 10062.
        if (now - lanGuiToanCuc > CACH_GUI_MS) {
            lanGuiToanCuc = now;
            logError('REST hạn mức TOÀN CỤC',
                new Error(`Chờ ${info.timeToReset}ms · ${info.method} ${duong} · toàn cục lần thứ ${tongToanCuc}`),
                { command: 'rest:global' });
        }
    } else {
        console.warn(`[REST] Hạn mức route — chờ ${info?.timeToReset}ms · ${info?.method} ${duong}`);
    }
}

// ---------------------------------------------------------------------------
// 429 THẬT ở tầng mạng + request hỏng (xem "ĐIỂM MÙ" ở đầu file).
// ---------------------------------------------------------------------------
const DISCORD_EPOCH = 1420070400000n;
const SONG_ACK_MS = 3_000;            // lời ack (callback) phải tới trong 3 giây
const SONG_TOKEN_MS = 15 * 60_000;    // token interaction (editReply/followUp) sống 15 phút
const CHO_DAI_MS = 60_000;            // 429 bắt chờ quá mức này thì đáng báo kênh log
const CUA_SO_HONG_MS = 10 * 60_000;   // cửa sổ đếm request hỏng của Cloudflare

let tong429 = 0;
let tong429Html = 0;
let lan429Cuoi = 0;
let cho429LauNhat = 0;
let tuChoiSom = 0;
let lanGui429 = 0;
const mocHong = [];                   // mốc các phản hồi 401/403/429 trong 10 phút gần nhất

function lucSinhSnowflake(id) {
    try { return Number((BigInt(id) >> 22n) + DISCORD_EPOCH); } catch (_) { return null; }
}

/** Đường dẫn đã XOÁ token — thứ duy nhất được phép in ra log. */
function duongAnToan(url) {
    let p;
    try { p = new URL(String(url)).pathname; } catch (_) { p = String(url || '?'); }
    return p.replace(/^\/api\/v\d+/, '')
        .replace(/\/(webhooks|interactions)\/(\d{17,19})\/[^/?]+/, '/$1/$2/:token')
        .replace(/\d{17,19}/g, ':id')
        .slice(0, 120);
}

/**
 * Còn bao nhiêu ms trước khi interaction trong URL này hết đường phản hồi.
 * `null` = URL không phải đường interaction (webhook thật, kênh, guild…) -> không can thiệp.
 * Token webhook của interaction là base64 của `interaction:<id>:<bí mật>`; chỉ đọc phần ID.
 */
function conSongMs(url, now = Date.now()) {
    let p;
    try { p = new URL(String(url)).pathname; } catch (_) { return null; }
    const cb = /\/interactions\/(\d{17,19})\/[^/]+\/callback$/.exec(p);
    if (cb) {
        const sinh = lucSinhSnowflake(cb[1]);
        return sinh == null ? null : sinh + SONG_ACK_MS - now;
    }
    const wh = /\/webhooks\/\d{17,19}\/([^/?]+)/.exec(p);
    if (!wh) return null;
    let giai;
    try { giai = Buffer.from(wh[1], 'base64').toString('utf8'); } catch (_) { return null; }
    const m = /^interaction:(\d{17,19}):/.exec(giai);
    if (!m) return null;                       // webhook THẬT, không phải interaction
    const sinh = lucSinhSnowflake(m[1]);
    return sinh == null ? null : sinh + SONG_TOKEN_MS - now;
}

/** Nhìn một phản hồi ở tầng mạng. Chỉ đọc header, KHÔNG đụng body. */
function quanSatPhanHoi(res, url, method) {
    const status = Number(res?.status);
    if (status !== 401 && status !== 403 && status !== 429) return;
    const now = Date.now();
    mocHong.push(now);
    while (mocHong.length && mocHong[0] < now - CUA_SO_HONG_MS) mocHong.shift();
    if (mocHong.length > 20_000) mocHong.splice(0, mocHong.length - 20_000);
    if (status !== 429) return;

    const h = res?.headers;
    const lay = (k) => (h && typeof h.get === 'function' ? h.get(k) : null);
    const retry = Number(lay('retry-after'));
    const choMs = Number.isFinite(retry) ? Math.round(retry * 1000) : null;
    const html = /text\/html/i.test(String(lay('content-type') || ''));
    const global = lay('x-ratelimit-global') != null;
    const scope = lay('x-ratelimit-scope') || 'không có';

    tong429++;
    if (html) tong429Html++;
    lan429Cuoi = now;
    if (choMs != null && choMs > cho429LauNhat) cho429LauNhat = choMs;

    const duong = duongAnToan(url);
    console.warn(`[REST] 429 — Retry-After ${choMs ?? '?'}ms · ${method || 'GET'} ${duong}`
        + ` · scope=${scope} · global=${global}${html ? ' · HTML (Cloudflare)' : ''}`);

    if (choMs != null && choMs > CHO_DAI_MS && now - lanGui429 > CACH_GUI_MS) {
        lanGui429 = now;
        // Message CỐ ĐỊNH, số đo đi vào `note`: `khoaCua()` gộp trùng theo dòng đầu message.
        Promise.resolve(logError('REST 429 kéo dài', new Error('Discord bắt bot chờ hơn 60 giây'), {
            command: 'rest:429',
            note: `Retry-After ${(choMs / 1000).toFixed(0)}s · ${method || 'GET'} ${duong}`
                + ` · scope=${scope} · global=${global}`
                + ` · ${html ? 'trang HTML — dấu hiệu Cloudflare chặn IP' : 'JSON của Discord'}`
                + ` · request hỏng 10 phút qua: ${mocHong.length}`,
        })).catch(() => {});
    }
}

/** `rejectOnRateLimit`: chờ lâu hơn đời còn lại của token thì ném ngay. */
function voVong(data) {
    const con = conSongMs(data?.url);
    if (con == null) return false;
    const cho = Math.max(Number(data?.retryAfter) || 0, Number(data?.timeToReset) || 0);
    if (cho > con) { tuChoiSom++; return true; }
    return false;
}

/** Gắn hai việc trên vào MỘT instance REST. Mỗi instance chỉ gắn một lần. */
const daGan429 = new WeakSet();
function ganMayDo429(rest) {
    const opts = rest?.options;
    if (!opts || daGan429.has(rest)) return false;
    daGan429.add(rest);
    if (typeof opts.makeRequest === 'function') {
        const goc = opts.makeRequest;
        opts.makeRequest = async function (url, init) {
            const res = await goc.call(this, url, init);
            try { quanSatPhanHoi(res, url, init?.method); } catch (_) { /* đo không được làm chết thứ nó đo */ }
            return res;
        };
    }
    if (opts.rejectOnRateLimit == null) {
        opts.rejectOnRateLimit = (data) => {
            try { return voVong(data); } catch (_) { return false; }
        };
    }
    return true;
}

/** Lỗi do chính `voVong` ném ra (tên dạng `RateLimitError[/webhooks/...]`). */
function laTuChoiVoVong(err) {
    return /^RateLimitError\[\/(webhooks|interactions)\//.test(String(err?.name || ''));
}

/** Gắn phép đo vào client. Gọi một lần lúc khởi động. An toàn khi gọi lại. */
let daGan = false;
function theoDoiRest(client) {
    if (daGan || !client?.rest?.on) return;
    daGan = true;
    // Không dùng hằng `RESTEvents.RateLimited` để không phải require thêm: giá trị là
    // 'rateLimited' (đã kiểm trên discord.js 14.27).
    client.rest.on('rateLimited', (info) => {
        try { ghiNhan(info); } catch (_) { /* phép đo không được làm chết thứ nó đang đo */ }
    });
    ganMayDo429(client.rest);
}

/**
 * Ảnh chụp để nhúng vào cảnh báo ack.
 * @returns {{tong:number,toanCuc:number,gan60s:number,duongHay:string|null,
 *            lanCuoiMs:number|null,choLauNhatMs:number}}
 */
function tomTat() {
    const nguong = Date.now() - 60_000;
    let gan60s = 0;
    for (let i = moc.length - 1; i >= 0; i--) {
        if (moc[i] < nguong) break;
        gan60s++;
    }
    let duongHay = null, cao = 0;
    for (const [d, n] of demTheoDuong) if (n > cao) { cao = n; duongHay = d; }
    return {
        tong: tongCong, toanCuc: tongToanCuc, gan60s, duongHay,
        lanCuoiMs: lanCuoi ? Date.now() - lanCuoi : null,
        choLauNhatMs: choLauNhat,
        t429: {
            tong: tong429, html: tong429Html,
            lanCuoiMs: lan429Cuoi ? Date.now() - lan429Cuoi : null,
            choLauNhatMs: cho429LauNhat,
            hong10p: mocHong.filter(x => x >= Date.now() - CUA_SO_HONG_MS).length,
            tuChoiSom,
        },
    };
}

/** Dòng ngắn để nhúng vào meta của tin cảnh báo. */
function dongTomTat() {
    const t = tomTat();
    // `chạm gần nhất` là số để ĐỐI CHIẾU với tuổi interaction in cùng tin: hai số xấp xỉ
    // nhau nghĩa là cú chạm hạn mức và cú interaction bị treo là CÙNG một sự kiện.
    const phanCu = !t.tong ? 'REST: chưa chạm hạn mức lần nào'
        : `REST: ${t.gan60s} lần/60s cuối · tổng ${t.tong} (toàn cục ${t.toanCuc})`
        + ` · chạm gần nhất ${(t.lanCuoiMs / 60000).toFixed(1)} phút trước`
        + ` · chờ lâu nhất ${t.choLauNhatMs}ms`
        + (t.duongHay ? ` · hay chạm: ${t.duongHay}` : '');
    // Phần đo ở TẦNG MẠNG — không mù với 429 bất ngờ như phần trên.
    const phan429 = !t.t429.tong ? ' · 429 thật: 0'
        : ` · 429 thật: ${t.t429.tong} (HTML ${t.t429.html})`
        + ` · 429 gần nhất ${(t.t429.lanCuoiMs / 60000).toFixed(1)} phút trước`
        + ` · Retry-After lớn nhất ${(t.t429.choLauNhatMs / 1000).toFixed(0)}s`;
    return phanCu + phan429
        + (t.t429.hong10p ? ` · request hỏng 10 phút: ${t.t429.hong10p}` : '')
        + (t.t429.tuChoiSom ? ` · từ chối sớm: ${t.t429.tuChoiSom}` : '');
}

module.exports = {
    theoDoiRest, tomTat, dongTomTat,
    ganMayDo429, laTuChoiVoVong, conSongMs, duongAnToan,
};
