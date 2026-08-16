// ============================================================
// lib/antinuke/index.js — Bộ điều phối: từ "một hành vi vừa xảy ra" đến "đã chặn".
//
// THỨ TỰ Ở ĐÂY LÀ TOÀN BỘ GIÁ TRỊ CỦA HỆ (docs/spec-antinuke.md §5). Đừng đảo:
//
//   T+1 ms   lọc (bot mình / tắt / miễn trừ)            ← RAM, 0 I/O
//   T+2 ms   đếm cửa sổ trượt                            ← RAM, 0 I/O
//   T+5 ms   ► TƯỚC QUYỀN KẺ TẤN CÔNG                    ← đòn quyết định, chạy THẲNG
//   T+300ms  ► đảo ngược thiệt hại (theo từng loại)
//   T+600ms  ► khoá server nếu luật yêu cầu
//   T+1s     ► ghi sổ sự cố rồi báo động ba đường
//
// Mọi thứ trước bước "tước quyền" phải là RAM thuần. Một lời gọi DB đặt nhầm lên
// trên dòng đó là đủ để mất thêm 3–10 kênh khi Supabase chập chờn.
// ============================================================
const { PermissionFlagsBits } = require('discord.js');
const db = require('../../database.js');
const { ANTINUKE } = require('../../config');
const { logError } = require('../logger');
const cache = require('./config');
const detector = require('./detector');
const { trungPhat } = require('./punish');
const revert = require('./revert');
const { khoa } = require('./lockdown');
const { baoDong } = require('./alert');

// Dấu vết mục tiêu: 'guild:exec:action' -> [id đối tượng bị tác động].
// Cần để dọn dẹp (xoá đúng những kênh kẻ đó vừa tạo) và để P1 gỡ ban đúng những
// người kẻ đó vừa ban. Bộ đếm ở detector chỉ giữ số lần, không giữ "cái gì".
const dauVet = new Map();

// 'guild:exec:action' -> mốc sự cố gần nhất. Xem ANTINUKE.INCIDENT_COOLDOWN_MS:
// một vụ nuke phải sinh ra MỘT sự cố, không phải một sự cố cho mỗi kênh bị xoá.
const daXuLy = new Map();

function ghiMucTieu(khoa_, id) {
    if (!id) return;
    const ds = dauVet.get(khoa_) || [];
    if (ds.length < ANTINUKE.QUEUE_MAX_PER_INCIDENT) ds.push(String(id));
    dauVet.set(khoa_, ds);
}

function layVaXoaMucTieu(khoa_) {
    const ds = dauVet.get(khoa_) || [];
    dauVet.delete(khoa_);
    return ds;
}

/** Promise trả `null` sau ms. `.unref()` để không giữ event loop khi bot đang tắt. */
function hetGio(ms) {
    return new Promise(r => setTimeout(() => r(null), ms).unref());
}

/** Bot có đọc được audit log không — quyết định có cần lưới an toàn F9 hay không. */
function coQuyenAuditLog(guild) {
    return Boolean(guild.members.me?.permissions?.has(PermissionFlagsBits.ViewAuditLog));
}

/**
 * Đường chính: một hành vi có thủ phạm xác định vừa xảy ra.
 * @param {import('discord.js').Guild} guild
 * @param {string} executorId ai làm
 * @param {string} action khoá luật trong config.ANTINUKE.RULES
 * @param {object} chiTiet phụ thuộc loại: { targetId, roleId, quyenCu, roleIds, webhookId, changes }
 */
async function xuLy(guild, executorId, action, chiTiet = {}) {
    try {
        if (!guild || !executorId) return null;
        // Bot tự làm (khôi phục, dọn dẹp) không bao giờ được tính là tấn công — nếu
        // không, một lần dọn kênh spam sẽ tự kết án chính bot.
        if (executorId === guild.client.user.id) return null;
        if (!cache.dangBaoVe(guild.id)) return null;

        const key = `${guild.id}:${executorId}:${action}`;
        ghiMucTieu(key, chiTiet.targetId);

        // --- Miễn trừ ---------------------------------------------------
        let member = guild.members.cache.get(executorId);
        // Chỉ chịu chi phí fetch khi guild THỰC SỰ có miễn trừ theo role. Đổi lại
        // ~100 ms để không ban nhầm một admin đã được chủ server miễn trừ — đánh đổi
        // đúng, vì ban nhầm là hỏng đắt nhất.
        if (!member && cache.coMienTruTheoRole(guild.id)) {
            member = await guild.members.fetch(executorId).catch(() => null);
        }
        const roleIds = member ? [...member.roles.cache.keys()] : [];
        if (cache.duocMienTru(guild.id, executorId, roleIds)) return null;

        // --- Đếm & đánh giá ---------------------------------------------
        const qd = detector.xetHanhVi(guild.id, executorId, action, Date.now());
        if (!qd) return null;

        // Vượt ngưỡng ở lần thứ 3 thì lần thứ 4, 5, 6... cũng vượt. Không chặn ở đây thì
        // kẻ xoá 10 kênh sinh ra 8 sự cố và 8 lệnh ban (đã đo bằng thực nghiệm) — đốt
        // băng thông API đúng lúc cần nó nhất, và quy trình khoá chạy lại có thể ghi đè
        // bản ghi trạng-thái-trước-khi-khoá. Kẻ tấn công đã bị chặn ở lần đầu rồi.
        const lanTruoc = daXuLy.get(key) || 0;
        if (Date.now() - lanTruoc < ANTINUKE.INCIDENT_COOLDOWN_MS) return null;
        daXuLy.set(key, Date.now());

        const thiHanh = cache.dangThiHanh(guild.id);
        const mode = thiHanh ? 'enforce' : 'dryrun';
        const lyDo = `Waguri anti-nuke: ${action} ×${qd.hits}/${qd.limit}`;

        // --- ĐÒN QUYẾT ĐỊNH ---------------------------------------------
        let ketQua = { ok: false, applied: null, reason: 'dryrun' };
        if (thiHanh) ketQua = await trungPhat(guild, executorId, qd.verdict, lyDo);

        // --- Đảo ngược thiệt hại ----------------------------------------
        const mucTieu = layVaXoaMucTieu(key);
        const daLamGi = [];
        if (thiHanh) {
            try {
                if (action === 'perm_escalate' && chiTiet.roleId) {
                    if (await revert.traQuyenRole(guild, chiTiet.roleId, chiTiet.quyenCu, lyDo)) daLamGi.push('revert_role');
                } else if (action === 'perm_escalate' && chiTiet.targetId && chiTiet.roleIds?.length) {
                    if (await revert.goRoleVuaGan(guild, chiTiet.targetId, chiTiet.roleIds, lyDo)) daLamGi.push('revert_member_roles');
                } else if (action === 'channel_create' && mucTieu.length) {
                    const r = await revert.xoaKenhVuaTao(guild, mucTieu, lyDo);
                    if (r.xoa) daLamGi.push(`delete_channel×${r.xoa}`);
                } else if (action === 'webhook_create' && chiTiet.webhookId) {
                    if (await revert.xoaWebhook(guild, chiTiet.webhookId, lyDo)) daLamGi.push('delete_webhook');
                } else if (action === 'guild_update' && chiTiet.changes) {
                    const tr = await revert.traCauHinhServer(guild, chiTiet.changes, lyDo);
                    if (tr.length) daLamGi.push(`revert_guild:${tr.join(',')}`);
                } else if (action === 'bot_add' && chiTiet.targetId) {
                    const bot = await guild.members.fetch(chiTiet.targetId).catch(() => null);
                    if (bot) { await bot.kick(lyDo).catch(() => {}); daLamGi.push('kick_bot'); }
                }
            } catch (e) {
                logError('antinuke_revert', e, { guild: guild.id, command: action });
            }
        }

        // --- Khoá server -------------------------------------------------
        let daKhoa = false;
        if (thiHanh && qd.lockdown) {
            const r = await khoa(guild, lyDo);
            daKhoa = r.daLam.length > 0;
            if (daKhoa) daLamGi.push(`lockdown:${r.daLam.join(',')}`);
        }

        // Nhiều kẻ tấn công trong 60 s = nghi chiếm tài khoản hàng loạt, không còn là
        // "một admin phản". P0 chỉ ĐÁNH DẤU trong báo động; cách ly diện rộng là P1.
        const soKe = detector.demKeTanCong(guild.id, executorId, Date.now());
        const panic = soKe >= ANTINUKE.PANIC_EXECUTORS;

        // --- Ghi sổ rồi báo động (sau khi đã ra tay) ----------------------
        // Báo động KHÔNG được xếp sau một lượt ghi DB có thể treo 10 giây (SUPABASE_TIMEOUT_MS).
        // Nên: bắn lệnh ghi, gắn các bản ghi con vào NÓ, nhưng chỉ chờ tối đa 1,5 s để lấy
        // mã sự cố đưa vào chân embed. DB chậm thì mất mỗi con số đó, không mất báo động.
        const pSuCo = db.antinukeIncidentOpen({
            guildId: guild.id,
            executorId,
            action,
            hits: qd.hits,
            windowMs: qd.windowMs,
            mode,
            verdict: thiHanh ? qd.verdict : 'log',
            punished: Boolean(ketQua.ok),
            detail: { ketQua: ketQua.reason, daLamGi, panic, soKeTanCong: soKe, mucTieu: mucTieu.slice(0, 25) },
        });

        pSuCo.then(id => {
            if (!id) return;
            if (ketQua.ok) db.antinukeActionLog(id, ketQua.applied, executorId, { roles: ketQua.roles || [] });
            // Ghi từng mục tiêu để P1 gỡ ban đúng người kẻ này đã ban.
            if (action === 'member_ban') {
                for (const nan of mucTieu) db.antinukeActionLog(id, 'victim_ban', nan, {});
            }
            if (daKhoa) db.antinukeActionLog(id, 'lockdown', guild.id, {});
        }).catch(() => { /* helper đã nuốt lỗi; ở đây chỉ chặn unhandled rejection */ });

        const incidentId = await Promise.race([pSuCo.catch(() => null), hetGio(ANTINUKE.INCIDENT_WRITE_BUDGET_MS)]);

        await baoDong(guild, {
            executorId,
            action,
            hits: qd.hits,
            limit: qd.limit,
            verdict: thiHanh ? qd.verdict : 'log',
            mode,
            ketQua: thiHanh ? ketQua.reason : 'dryrun',
            lockdown: daKhoa,
            panic,
            incidentId,
            ghiChu: daLamGi.length ? daLamGi.join(' · ') : null,
        });

        return { qd, ketQua, incidentId };
    } catch (e) {
        // Anti-nuke lỗi KHÔNG được làm sập bot hay chặn các event khác (AGENTS.md §2.6).
        logError('antinuke_xuly', e, { guild: guild?.id, command: action });
        return null;
    }
}

/**
 * Lưới an toàn (F9): bot KHÔNG có quyền View Audit Log -> không biết ai làm.
 * Vẫn đếm được số lần từ event thô, nhưng **không trừng phạt ai** — đoán thủ phạm
 * còn tệ hơn không làm gì. Chỉ khoá server + báo động để người thật vào xử lý.
 *
 * Chủ động không chạy khi bot CÓ quyền audit log, nếu không mỗi lần xoá kênh sẽ bị
 * đếm hai lần (một từ event thô, một từ audit log).
 */
async function xuLyMatAuditLog(guild, action) {
    try {
        if (!guild || coQuyenAuditLog(guild)) return null;
        if (!cache.dangBaoVe(guild.id)) return null;

        const qd = detector.xetHanhVi(guild.id, '__khuyet_danh__', action, Date.now());
        if (!qd) return null;

        const thiHanh = cache.dangThiHanh(guild.id);
        let daKhoa = false;
        if (thiHanh && qd.lockdown) {
            const r = await khoa(guild, 'Waguri anti-nuke: phát hiện bất thường (thiếu quyền xem nhật ký kiểm tra)');
            daKhoa = r.daLam.length > 0;
        }

        const incidentId = await db.antinukeIncidentOpen({
            guildId: guild.id,
            executorId: null,
            action,
            hits: qd.hits,
            windowMs: qd.windowMs,
            mode: thiHanh ? 'enforce' : 'dryrun',
            verdict: 'log',
            punished: false,
            detail: { thieu_quyen_audit_log: true },
        });

        await baoDong(guild, {
            executorId: '0',
            action,
            hits: qd.hits,
            limit: qd.limit,
            verdict: 'log',
            mode: thiHanh ? 'enforce' : 'dryrun',
            ketQua: 'missing_perm',
            lockdown: daKhoa,
            panic: false,
            incidentId,
            ghiChu: 'View Audit Log',
        });
        return { qd, incidentId };
    } catch (e) {
        logError('antinuke_luoi_an_toan', e, { guild: guild?.id, command: action });
        return null;
    }
}

// Dọn bộ đếm nguội định kỳ: Map phải có trần khi bot phục vụ hàng trăm server.
setInterval(() => {
    try {
        const bayGio = Date.now();
        detector.quetRac(bayGio);
        if (dauVet.size > 1000) dauVet.clear();
        for (const [k, t] of daXuLy) {
            if (bayGio - t > ANTINUKE.INCIDENT_COOLDOWN_MS * 5) daXuLy.delete(k);
        }
    } catch { /* không bao giờ làm sập */ }
}, ANTINUKE.SWEEP_INTERVAL_MS).unref();

module.exports = { xuLy, xuLyMatAuditLog, coQuyenAuditLog };
