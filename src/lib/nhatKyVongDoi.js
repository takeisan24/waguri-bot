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
// Kết cục CHƯA BÁO được dồn lại (`chuaBao`) qua các lần chạy: chuỗi "OOM -> restart -> chết
// trước Ready -> restart" vẫn báo đủ cả hai, không để lần sau ghi đè mất nguyên nhân gốc.
//
// LUẬT: không hàm công khai nào được ném; mỗi lần gửi có timeout; không in env/URL webhook.
// Spec: docs/spec-nhat-ky-vong-doi.md
// ============================================================
const fs = require('node:fs');
const path = require('node:path');

const MAU = { len: 0x7BD88F, tat: 0xF5C26B, loi: 0xFF5C7A, mang: 0x8AB4F8, band: 0xC9A7FF };
const TRAN_TIN = 6;                  // tin khởi động/tắt/thoát tối đa ...
const CUA_SO_TRAN = 10 * 60_000;     // ... trong 10 phút (chống crash loop spam; bộ đếm LƯU FILE)
const TRAN_MANG = 3;                 // tin mất gateway: hạn mức RIÊNG, chỉ trong RAM — mạng chập
                                     // chờn không được ăn hết chỗ của tin crash
const NGUONG_MAT_MANG_MS = 30_000;   // mất gateway ngắn hơn: chỉ console
const BAND_TOI_DA = 200;
const BAND_MAU = 25;
const MO_TA_TOI_DA = 3900;
const CHUA_BAO_TOI_DA = 5;

const mb = (b) => Math.round(b / 1048576);
const gioVN = (iso) => {
    try {
        return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    } catch { return String(iso); }
};

/**
 * Mô tả kết cục một lần chạy từ nội dung file của nó.
 * @returns {string|null} null nếu không có gì để báo (file trống/hỏng thì vẫn trả câu "không rõ").
 */
function moTaLanTruoc(cu) {
    if (cu === null || cu === undefined) return 'Không rõ lần chạy trước (chưa có file trạng thái hoặc file hỏng).';
    if (typeof cu !== 'object' || !cu.lastBeat) return 'Không rõ lần chạy trước (file trạng thái thiếu dữ liệu).';
    const banCu = `bản ${cu.commit || '?'}, chạy từ ${gioVN(cu.startedAt)}`;
    if (cu.ketThuc && cu.ketThuc.kieu === 'tat') {
        return `Lần trước: **tắt gọn** (${cu.ketThuc.lyDo}) lúc ${gioVN(cu.ketThuc.luc)} · ${banCu}.`;
    }
    if (cu.ketThuc && cu.ketThuc.kieu === 'loi') {
        return `Lần trước: **thoát do lỗi** (${cu.ketThuc.lyDo}) lúc ${gioVN(cu.ketThuc.luc)} · heap ${cu.heapUsedMb} MB · ${banCu}.`;
    }
    return '⚠️ Lần trước: **chết bất thường** (không kịp chạy đường tắt — hết RAM, bị kill hoặc host dừng). ' +
        `Nhịp cuối ${gioVN(cu.lastBeat)} · heap ${cu.heapUsedMb} MB · RSS ${cu.rssMb} MB · ${banCu}.`;
}

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

    let mocGui = [];                // mốc tin khởi động/tắt/thoát — lưu file (crash loop = tiến trình mới)
    let mocMang = [];               // mốc tin mất gateway — chỉ RAM
    let chuaBao = [];               // kết cục các lần trước chưa báo được (lưu file)
    let phienNay = null;
    let daKetThuc = false;          // đã ghi kết cục -> nhịp không được ghi đè thành null nữa
    let dangThoat = false;          // một đường thoát (tắt hoặc lỗi) đang chạy -> đường kia im
    let daCanhBaoFile = false;
    const matMang = new Map();      // shardId -> { tu, code }
    let band = { dong: [], tong: 0, nguoi: new Set() };

    function vuotTran(ds, tran) {
        const t = now();
        const con = ds.filter(x => t - x >= 0 && t - x < CUA_SO_TRAN);
        if (con.length >= tran) return { vuot: true, ds: con };
        con.push(t);
        return { vuot: false, ds: con };
    }

    /**
     * Gửi một embed. Trả true nếu webhook nhận (2xx). Không bao giờ ném.
     * @param {{loai?: 'vongdoi'|'mang'|'band'}} [opt] hạn mức áp dụng ('band' không giới hạn)
     */
    async function guiSuKien(tieuDe, moTa, mau = MAU.len, { loai = 'vongdoi' } = {}) {
        try {
            const url = docUrl();
            if (!url) return false;
            if (loai === 'vongdoi' || loai === 'mang') {
                const r = loai === 'mang' ? vuotTran(mocMang, TRAN_MANG) : vuotTran(mocGui, TRAN_TIN);
                if (loai === 'mang') mocMang = r.ds; else mocGui = r.ds;
                if (r.vuot) {
                    console.warn(`[VONG DOI] Bỏ gửi (quá hạn mức 10 phút): ${tieuDe}`);
                    return false;
                }
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
            try { res?.body?.cancel?.(); } catch { /* nhả kết nối, không cần đọc body */ }
            return !!(res && res.ok);
        } catch { return false; }
    }

    // ---------- file trạng thái ----------
    function ghiFile(duLieu) {
        try {
            fs.mkdirSync(path.dirname(fileTrangThai), { recursive: true });
            // Ghi ra file tạm rồi rename: bị SIGKILL/OOM đúng lúc đang ghi thì file cũ vẫn nguyên,
            // không để lại JSON cụt — đó lại đúng là trường hợp cần đọc nhất.
            const tam = `${fileTrangThai}.${process.pid}.tmp`;
            fs.writeFileSync(tam, JSON.stringify(duLieu));
            fs.renameSync(tam, fileTrangThai);
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

    function banGhi(ketThuc) {
        const m = bo();
        return {
            ...phienNay,
            lastBeat: new Date(now()).toISOString(),
            heapUsedMb: mb(m.heapUsed),
            rssMb: mb(m.rss),
            tinGanDay: mocGui,
            chuaBao,
            ketThuc,
        };
    }

    /**
     * Gọi SỚM NHẤT có thể lúc tiến trình bắt đầu (trước login): đọc file lần trước, dồn kết cục
     * của nó vào `chuaBao`, rồi ghi phiên này. Phải trước `clientReady` — crash trước ready mà
     * chưa ghi phiên mới thì lần sau sẽ đọc nhầm kết cục của lần trước nữa.
     */
    function batDau() {
        try {
            if (phienNay) return;
            const cu = docFile();
            const t = now();
            if (cu && Array.isArray(cu.tinGanDay)) {
                mocGui = cu.tinGanDay.filter(x => typeof x === 'number' && t - x >= 0 && t - x < CUA_SO_TRAN);
            }
            const cuChuaBao = (cu && Array.isArray(cu.chuaBao)) ? cu.chuaBao.filter(x => typeof x === 'string') : [];
            chuaBao = [...cuChuaBao, moTaLanTruoc(cu)].slice(-CHUA_BAO_TOI_DA);
            const b = build();
            phienNay = { startedAt: b.startedAt, commit: b.commit, version: b.version };
            ghiFile(banGhi(null));
        } catch { /* không bao giờ ném */ }
    }

    /** Ghi nhịp hiện tại (gọi mỗi 60s). Không làm gì sau khi đã ghi kết cục. */
    function ghiNhip() {
        try {
            if (!phienNay || daKetThuc) return;
            ghiFile(banGhi(null));
        } catch { /* không bao giờ ném */ }
    }

    function ghiKetThuc(kieu, lyDo) {
        try {
            if (!phienNay) return;
            daKetThuc = true;
            ghiFile(banGhi({ kieu, lyDo: String(lyDo || '').slice(0, 200), luc: new Date(now()).toISOString() }));
        } catch { /* không bao giờ ném */ }
    }

    /** Gọi khi clientReady. Không await trên đường ready. */
    function baoKhoiDong(client) {
        try {
            batDau();
            const b = build();
            const m = bo();
            const soServer = client?.guilds?.cache?.size ?? '?';
            const baoCu = chuaBao.slice();
            const coLoi = baoCu.some(x => /chết bất thường|thoát do lỗi/.test(x));
            const moTa = [
                `v${b.version} · \`${b.commit || 'không rõ commit'}\` · ${soServer} server · heap ${mb(m.heapUsed)} MB`,
                ...(baoCu.length > 1 ? ['Các lần chạy trước chưa báo (cũ → mới):', ...baoCu.map((x, i) => `${i + 1}. ${x}`)] : baoCu),
            ].join('\n');
            guiSuKien('🌸 Bot đã khởi động', moTa, coLoi ? MAU.loi : MAU.len)
                .then((ok) => {
                    // Chỉ xoá những gì ĐÃ báo được; webhook hỏng thì lần sau báo tiếp.
                    if (ok) chuaBao = chuaBao.slice(baoCu.length);
                    ghiNhip();          // lưu mốc tin vừa gửi + chuaBao mới
                })
                .catch(() => {});
        } catch { /* không bao giờ ném */ }
    }

    // ---------- gateway ----------
    /** Ghi mốc shard bắt đầu mất kết nối (shardReconnecting). Giữ mốc cũ nếu đã có. */
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
            const code = m.code !== undefined && m.code !== null ? ` (code ${m.code})` : '';
            guiSuKien('📡 Mất kết nối Discord rồi nối lại',
                `Shard ${shardId} mất kết nối **${Math.round(ms / 1000)} giây**${code} từ ${gioVN(new Date(m.tu).toISOString())}.`,
                MAU.mang, { loai: 'mang' }).catch(() => {});
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
            return await guiSuKien('📊 BAND LOG', moTa, MAU.band, { loai: 'band' });
        } catch { return false; }
    }

    // ---------- thoát ----------
    /**
     * Tắt gọn theo tín hiệu: ghi file, gửi BAND còn lại + tin tắt (chờ có giới hạn).
     * @returns {Promise<boolean>} false nếu một đường thoát khác đang chạy (chỗ gọi không exit).
     */
    async function baoTat(sig) {
        if (dangThoat) return false;
        dangThoat = true;
        try {
            ghiKetThuc('tat', sig);
            await Promise.allSettled([
                xaBandLog(),
                guiSuKien('🌙 Bot đang tắt', `Nhận **${sig}** (thường là Restart/Stop trên panel).`, MAU.tat),
            ]);
            ghiKetThuc('tat', sig);   // ghi lại để lưu cả mốc tin vừa gửi (chống crash loop)
        } catch { /* */ }
        return true;
    }

    /** Thoát do lỗi: ghi file, gửi tin (chờ có giới hạn), rồi exit(code). Chỉ chạy một lần. */
    async function thoatSauKhiBao(lyDo, err, code = 1) {
        if (dangThoat) {
            console.error('[VONG DOI] Lỗi thêm trong lúc đang thoát:', err?.message || err);
            return;
        }
        dangThoat = true;
        // Hạn chót cứng, không unref: dù fetch/abort có trục trặc gì thì tiến trình vẫn phải chết.
        const hanChot = setTimeout(() => exitFn(code), timeoutMs + 500);
        try {
            ghiKetThuc('loi', lyDo);
            const than = String(err?.stack || err?.message || err || '').slice(0, 1500);
            await Promise.allSettled([
                xaBandLog(),
                guiSuKien(`💥 Bot thoát: ${lyDo}`, than ? '```\n' + than + '\n```' : '', MAU.loi),
            ]);
            ghiKetThuc('loi', lyDo);
        } catch { /* */ }
        clearTimeout(hanChot);
        exitFn(code);
    }

    return {
        batDau, guiSuKien, ghiNhip, baoKhoiDong, baoTat, thoatSauKhiBao,
        khiShardNgat, khiShardNoiLai, ghiBandLog, xaBandLog,
        dangThoat: () => dangThoat,
        _test: { moTaLanTruoc, docFile },
    };
}

const macDinh = taoNhatKy();

module.exports = {
    ...macDinh, taoNhatKy,
    HANG: { TRAN_TIN, TRAN_MANG, NGUONG_MAT_MANG_MS, BAND_TOI_DA, BAND_MAU, MO_TA_TOI_DA, CHUA_BAO_TOI_DA },
};
