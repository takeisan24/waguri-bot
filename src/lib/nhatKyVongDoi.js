// ============================================================
// lib/nhatKyVongDoi.js — Gửi sự kiện VÒNG ĐỜI bot (khởi động, tắt, thoát do lỗi, mất
// gateway lâu, BAND LOG gộp) về kênh log Discord qua LOG_WEBHOOK_URL.
//
// VÌ SAO CÓ. 20-11-2026 bot nằm im 3 giờ 18 phút và không truy được nguyên nhân: mọi dòng
// quan trọng chỉ nằm ở console Wispbyte, mà console đó không được lưu. Tệ hơn, ba đường
// thoát trong index.js gọi `logError()` (async) rồi `process.exit()` NGAY — tin crash chưa
// kịp rời máy thì tiến trình đã chết. Thứ quan trọng nhất cần báo lại là thứ không bao giờ
// tới nơi.
//
// Chết thẳng (OOM, SIGKILL, host dừng container) thì không đoạn mã nào kịp chạy. Cách duy
// nhất để biết là LẦN SAU tự nhận ra: mỗi 60s ghi một file nhịp `.runtime/vong-doi.json`;
// đường tắt/thoát gọn ghi `ketThuc`. Khởi động mà `ketThuc` còn null => lần trước chết bất
// thường, và nhịp cuối + heap cuối là manh mối.
//
// LUẬT: không hàm công khai nào được ném; mỗi lần gửi có timeout; không in env/URL webhook.
// Spec: docs/spec-nhat-ky-vong-doi.md
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const MAU = { len: 0x7BD88F, tat: 0xF5C26B, loi: 0xFF5C7A, mang: 0x8AB4F8, band: 0xC9A7FF };
const TRAN_TIN = 6;                  // tin vòng đời tối đa ...
const CUA_SO_TRAN = 10 * 60_000;     // ... trong 10 phút (chống crash loop spam)
const NGUONG_MAT_MANG_MS = 30_000;   // mất gateway ngắn hơn: chỉ console
const BAND_TOI_DA = 200;
const BAND_MAU = 25;
const MO_TA_TOI_DA = 3900;

const mb = (b) => Math.round(b / 1048576);
const gioVN = (iso) => {
    try {
        return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    } catch { return String(iso); }
};

/**
 * Tạo một nhật ký độc lập. Mặc định dùng tài nguyên thật; test truyền bản giả.
 * @param {object} [o]
 */
function taoNhatKy(o = {}) {
    const docUrl = o.docUrl || (() => process.env.LOG_WEBHOOK_URL);
    const fetchFn = o.fetchFn || ((...a) => fetch(...a));
    const now = o.now || (() => Date.now());
    const fileTrangThai = o.fileTrangThai || path.join(__dirname, '..', '..', '.runtime', 'vong-doi.json');
    const timeoutMs = o.timeoutMs ?? 3000;
    const exitFn = o.exitFn || ((c) => process.exit(c));
    const bo = o.memoryUsage || (() => process.memoryUsage());
    const build = o.build || (() => {
        const { VERSION, COMMIT, KHOI_DONG } = require('./banBuild');
        return { version: VERSION, commit: COMMIT, startedAt: KHOI_DONG.toISOString() };
    });

    let mocGui = [];                // mốc các tin vòng đời gần đây — LƯU VÀO FILE vì crash loop
                                    // là chuỗi tiến trình mới, bộ đếm trong RAM luôn bắt đầu từ 0
    let lanTruoc = null;            // nội dung file của lần chạy trước (đọc ở batDau)
    let daCanhBaoFile = false;
    let dangThoat = false;
    const matMang = new Map();      // shardId -> { tu, code }
    let band = { dong: [], tong: 0, nguoi: new Set() };

    function tran() {
        const t = now();
        mocGui = mocGui.filter(x => t - x < CUA_SO_TRAN);
        if (mocGui.length >= TRAN_TIN) return true;
        mocGui.push(t);
        return false;
    }

    /** Gửi một embed. Trả true nếu webhook nhận (2xx). Không bao giờ ném. */
    async function guiSuKien(tieuDe, moTa, mau = MAU.len, { boQuaTran = false } = {}) {
        try {
            const url = docUrl();
            if (!url) return false;
            if (!boQuaTran && tran()) {
                console.warn(`[VONG DOI] Bỏ gửi (quá ${TRAN_TIN} tin/10 phút): ${tieuDe}`);
                return false;
            }
            const res = await fetchFn(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ embeds: [{
                    title: tieuDe,
                    description: String(moTa || '').slice(0, MO_TA_TOI_DA),
                    color: mau,
                    timestamp: new Date(now()).toISOString(),
                }] }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            return !!(res && res.ok);
        } catch { return false; }
    }

    // ---------- file trạng thái ----------
    function ghiFile(duLieu) {
        try {
            fs.mkdirSync(path.dirname(fileTrangThai), { recursive: true });
            fs.writeFileSync(fileTrangThai, JSON.stringify(duLieu));
        } catch (e) {
            if (!daCanhBaoFile) {
                daCanhBaoFile = true;
                console.warn('[VONG DOI] Không ghi được file trạng thái:', e?.message || e);
            }
        }
    }

    function docFile() {
        try { return JSON.parse(fs.readFileSync(fileTrangThai, 'utf8')); } catch { return null; }
    }

    let phienNay = null;
    function anhChup() {
        const m = bo();
        return { lastBeat: new Date(now()).toISOString(), heapUsedMb: mb(m.heapUsed), rssMb: mb(m.rss), tinGanDay: mocGui };
    }

    /**
     * Gọi SỚM NHẤT có thể lúc tiến trình bắt đầu (trước login): đọc file lần trước rồi ghi đè
     * bằng phiên này. Phải trước `clientReady` — crash trước ready mà chưa ghi phiên mới thì
     * lần sau sẽ đọc nhầm kết cục của lần trước nữa.
     */
    function batDau() {
        try {
            if (phienNay) return;
            lanTruoc = docFile();
            const t = now();
            if (lanTruoc && Array.isArray(lanTruoc.tinGanDay)) {
                mocGui = lanTruoc.tinGanDay.filter(x => typeof x === 'number' && t - x >= 0 && t - x < CUA_SO_TRAN);
            }
            const b = build();
            phienNay = { startedAt: b.startedAt, commit: b.commit, version: b.version };
            ghiNhip();
        } catch { /* không bao giờ ném */ }
    }

    /** Ghi nhịp hiện tại (gọi mỗi 60s). */
    function ghiNhip() {
        try {
            if (!phienNay) return;
            ghiFile({ ...phienNay, ...anhChup(), ketThuc: null });
        } catch { /* không bao giờ ném */ }
    }

    function ghiKetThuc(kieu, lyDo) {
        try {
            if (!phienNay) return;
            ghiFile({ ...phienNay, ...anhChup(), ketThuc: { kieu, lyDo: String(lyDo || '').slice(0, 200), luc: new Date(now()).toISOString() } });
        } catch { /* không bao giờ ném */ }
    }

    /** Mô tả lần chạy trước từ nội dung file (null = không có/hỏng). */
    function moTaLanTruoc(cu) {
        if (!cu || typeof cu !== 'object' || !cu.lastBeat) return 'Không rõ lần chạy trước (chưa có file trạng thái).';
        const banCu = `bản ${cu.commit || '?'}, chạy từ ${gioVN(cu.startedAt)}`;
        if (cu.ketThuc && cu.ketThuc.kieu === 'tat') {
            return `Lần trước: **tắt gọn** (${cu.ketThuc.lyDo}) lúc ${gioVN(cu.ketThuc.luc)} · ${banCu}.`;
        }
        if (cu.ketThuc && cu.ketThuc.kieu === 'loi') {
            return `Lần trước: **thoát do lỗi** (${cu.ketThuc.lyDo}) lúc ${gioVN(cu.ketThuc.luc)} · heap ${cu.heapUsedMb} MB · ${banCu}.`;
        }
        return `⚠️ Lần trước: **chết bất thường** (không kịp chạy đường tắt — hết RAM, bị kill hoặc host dừng). ` +
            `Nhịp cuối ${gioVN(cu.lastBeat)} · heap ${cu.heapUsedMb} MB · RSS ${cu.rssMb} MB · ${banCu}.`;
    }

    /** Gọi khi clientReady. Không await trên đường ready. */
    function baoKhoiDong(client) {
        try {
            batDau();
            const cu = lanTruoc;
            const b = build();
            const m = bo();
            const soServer = client?.guilds?.cache?.size ?? '?';
            const moTa = [
                `v${b.version} · \`${b.commit || 'không rõ commit'}\` · ${soServer} server · heap ${mb(m.heapUsed)} MB`,
                moTaLanTruoc(cu),
            ].join('\n');
            const loi = cu && cu.lastBeat && !cu.ketThuc;
            guiSuKien('🌸 Bot đã khởi động', moTa, loi ? MAU.loi : MAU.len)
                .then(() => ghiNhip())          // lưu mốc tin vừa gửi vào file ngay
                .catch(() => {});
        } catch { /* không bao giờ ném */ }
    }

    // ---------- gateway ----------
    function khiShardNgat(shardId, code) {
        try { if (!matMang.has(shardId)) matMang.set(shardId, { tu: now(), code }); } catch { /* */ }
    }

    function khiShardNoiLai(shardId) {
        try {
            const m = matMang.get(shardId);
            if (!m) return;
            matMang.delete(shardId);
            const ms = now() - m.tu;
            if (ms < NGUONG_MAT_MANG_MS) return;
            guiSuKien('📡 Mất kết nối Discord rồi nối lại',
                `Shard ${shardId} mất kết nối **${Math.round(ms / 1000)} giây** (code ${m.code ?? '?'}) từ ${gioVN(new Date(m.tu).toISOString())}.`,
                MAU.mang).catch(() => {});
        } catch { /* */ }
    }

    // ---------- BAND LOG ----------
    function ghiBandLog(dong, userId) {
        try {
            band.tong++;
            if (userId) band.nguoi.add(String(userId));
            band.dong.push(String(dong).slice(0, 200));
            if (band.dong.length > BAND_TOI_DA) band.dong.shift();
        } catch { /* */ }
    }

    async function xaBandLog() {
        try {
            if (band.tong === 0) return false;
            const cu = band;
            band = { dong: [], tong: 0, nguoi: new Set() };
            const mau = cu.dong.slice(-BAND_MAU);
            const moTa = `**${cu.tong} dòng** · ${cu.nguoi.size} người` +
                (cu.tong > mau.length ? ` · hiện ${mau.length} dòng gần nhất` : '') +
                '\n```\n' + mau.join('\n').slice(0, MO_TA_TOI_DA - 120) + '\n```';
            return await guiSuKien('📊 BAND LOG', moTa, MAU.band, { boQuaTran: true });
        } catch { return false; }
    }

    // ---------- thoát ----------
    /** Tắt gọn theo tín hiệu: ghi file, gửi BAND còn lại + tin tắt (chờ có giới hạn). */
    async function baoTat(sig) {
        try {
            ghiKetThuc('tat', sig);
            await Promise.allSettled([
                xaBandLog(),
                guiSuKien('🌙 Bot đang tắt', `Nhận **${sig}** (thường là Restart/Stop trên panel).`, MAU.tat),
            ]);
            ghiKetThuc('tat', sig);   // ghi lại để lưu cả mốc tin vừa gửi (chống crash loop)
        } catch { /* */ }
    }

    /** Thoát do lỗi: ghi file, gửi tin (chờ có giới hạn), rồi exit(code). Chỉ chạy một lần. */
    async function thoatSauKhiBao(lyDo, err, code = 1) {
        if (dangThoat) {
            console.error('[VONG DOI] Lỗi thêm trong lúc đang thoát:', err?.message || err);
            return;
        }
        dangThoat = true;
        try {
            ghiKetThuc('loi', lyDo);
            const than = String(err?.stack || err?.message || err || '').slice(0, 1500);
            await Promise.allSettled([
                xaBandLog(),
                guiSuKien(`💥 Bot thoát: ${lyDo}`, than ? '```\n' + than + '\n```' : '', MAU.loi),
            ]);
            ghiKetThuc('loi', lyDo);
        } catch { /* */ }
        exitFn(code);
    }

    return {
        batDau, guiSuKien, ghiNhip, baoKhoiDong, baoTat, thoatSauKhiBao,
        khiShardNgat, khiShardNoiLai, ghiBandLog, xaBandLog,
        _test: { moTaLanTruoc, docFile, dangThoat: () => dangThoat },
    };
}

const macDinh = taoNhatKy();

module.exports = { ...macDinh, taoNhatKy, HANG: { TRAN_TIN, NGUONG_MAT_MANG_MS, BAND_TOI_DA, BAND_MAU, MO_TA_TOI_DA } };
