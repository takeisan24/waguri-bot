const config = require('../config');

// Cache danh sách owner ID: tự lấy CHỦ ỨNG DỤNG từ Discord (động) + OWNER_IDS env (thêm, tùy chọn).
let cache = null;

async function getOwnerIds(client) {
    if (cache) return cache;
    const ids = new Set(config.OWNER_IDS);
    try {
        const app = await client.application.fetch();
        if (app.owner) {
            if (app.owner.members) {
                // Là Team -> tất cả thành viên team là owner
                app.owner.members.forEach(m => ids.add(m.user?.id || m.id));
            } else {
                ids.add(app.owner.id);
            }
        }
    } catch (error) {
        console.error('[OWNER] Không lấy được application owner:', error.message);
    }
    cache = ids;
    return cache;
}

/** Kiểm tra userId có phải owner không (chủ app + OWNER_IDS env). */
async function isOwner(client, userId) {
    return (await getOwnerIds(client)).has(userId);
}

module.exports = { isOwner, getOwnerIds };
