// ============================================================
// lib/antinuke/revert.js — Đảo ngược thiệt hại ngay trong sự cố.
//
// ĐIỂM MẤU CHỐT: audit log entry đã MANG SẴN giá trị CŨ (`change.old`). Nghĩa là P0
// đảo ngược được leo thang quyền và sửa cấu hình server mà **không cần snapshot** —
// snapshot (P1) chỉ cần cho thứ đã bị XOÁ hẳn (kênh, role), vì cái đã xoá thì audit
// log không giữ lại nội dung.
//
// Phân tuyến theo mức khẩn:
//   · Gỡ quyền vừa cấp  -> chạy THẲNG, không xếp hàng (kẻ tấn công đang cầm quyền đó)
//   · Dọn kênh/webhook  -> xếp hàng có giãn cách (đã hết nguy hiểm, chỉ là dọn rác)
// ============================================================
const { xepHang, taoTran } = require('./queue');

/** Trả bitfield quyền của role về giá trị CŨ lấy từ audit log. */
async function traQuyenRole(guild, roleId, quyenCu, lyDo) {
    try {
        const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
        if (!role) return false;
        await role.setPermissions(BigInt(quyenCu ?? 0), lyDo);
        return true;
    } catch {
        return false;
    }
}

/** Gỡ những role vừa được gán cho một thành viên (chống "tự phong admin"). */
async function goRoleVuaGan(guild, targetId, roleIds, lyDo) {
    try {
        if (!roleIds?.length) return false;
        const member = await guild.members.fetch(targetId).catch(() => null);
        if (!member) return false;
        await member.roles.remove(roleIds, lyDo);
        return true;
    } catch {
        return false;
    }
}

/** Xoá các kênh mà kẻ tấn công vừa tạo (mẫu "spam 50 kênh + @everyone"). */
async function xoaKenhVuaTao(guild, channelIds, lyDo, tran = taoTran()) {
    let n = 0;
    for (const id of channelIds || []) {
        if (!tran.con()) break;
        const xong = await xepHang(guild.id, 'xoa_kenh', async () => {
            const ch = guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
            if (!ch) return false;
            await ch.delete(lyDo);
            return true;
        });
        if (xong) n++;
    }
    return { xoa: n, bo: tran.daBo };
}

/** Xoá webhook lạ. Webhook nguy hiểm ở chỗ nó spam được KỂ CẢ khi kẻ tạo đã rời server. */
async function xoaWebhook(guild, webhookId, lyDo) {
    return xepHang(guild.id, 'xoa_webhook', async () => {
        const hooks = await guild.fetchWebhooks();
        const wh = hooks.get(webhookId);
        if (!wh) return false;
        await wh.delete(lyDo);
        return true;
    });
}

// Chỉ những trường vừa ĐẢO NGƯỢC ĐƯỢC vừa đáng đảo ngược. Cố ý BỎ:
//   · icon/banner  — audit log chỉ lưu hash, không lưu bytes ảnh
//   · vanity_url   — cần mốc boost, đặt lại có thể thất bại và gây nhiễu
//   · owner_id     — chuyển quyền sở hữu, bot không có cửa can thiệp
const TRUONG_KHOI_PHUC = {
    name: 'name',
    verification_level: 'verificationLevel',
    explicit_content_filter: 'explicitContentFilter',
    default_message_notifications: 'defaultMessageNotifications',
    afk_channel_id: 'afkChannelId',
    system_channel_id: 'systemChannelId',
};

/** Trả cấu hình server về giá trị cũ trong audit log. Trả danh sách trường đã trả. */
async function traCauHinhServer(guild, changes, lyDo) {
    try {
        const sua = {};
        const daTra = [];
        for (const c of changes || []) {
            const field = TRUONG_KHOI_PHUC[c.key];
            if (!field || c.old === undefined || c.old === null) continue;
            sua[field] = c.old;
            daTra.push(c.key);
        }
        if (!daTra.length) return [];
        await guild.edit({ ...sua, reason: lyDo });
        return daTra;
    } catch {
        return [];
    }
}

module.exports = { traQuyenRole, goRoleVuaGan, xoaKenhVuaTao, xoaWebhook, traCauHinhServer, TRUONG_KHOI_PHUC };
