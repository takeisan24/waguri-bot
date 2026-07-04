// Lấy URL ảnh ngẫu nhiên từ API free (không cần key).
// QUAN TRỌNG: nhiều API chặn request thiếu User-Agent (trả 403) -> luôn gửi UA.
const HEADERS = { 'User-Agent': 'WaguriBot/1.0 (Discord)', accept: 'application/json' };

async function fetchJson(url) {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function cat() {
    const d = await fetchJson('https://api.thecatapi.com/v1/images/search');
    return d[0]?.url;
}
async function dog() {
    const d = await fetchJson('https://dog.ceo/api/breeds/image/random');
    return d.message;
}
async function waifu() {
    // nekos.best (SFW, free, không key) — cần User-Agent
    const d = await fetchJson('https://nekos.best/api/v2/waifu');
    return d.results?.[0]?.url;
}

module.exports = { cat, dog, waifu };
