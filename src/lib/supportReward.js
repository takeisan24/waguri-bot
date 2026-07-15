const config = require('../config');

/**
 * Đồng bộ vai trò cấp độ của thành viên khi họ tương tác tại Server Support.
 * @param {import('discord.js').GuildMember} member
 * @param {number} level
 */
async function syncSupportGuildRoles(member, level) {
    if (!member) return;
    
    // Đảm bảo bot chỉ chạy gán tại đúng Server Support được cấu hình
    const supportGuildId = config.ROLE_REWARDS.SUPPORT_GUILD_ID;
    if (!supportGuildId || member.guild.id !== supportGuildId) return;

    // Kiểm tra quyền của bot trong guild
    const me = member.guild.members.me;
    if (!me || !me.permissions.has('ManageRoles')) {
        console.warn(`[ROLE SYNC WARN] Bot thiếu quyền ManageRoles tại server support "${member.guild.name}"`);
        return;
    }

    const rolesToAdd = [];
    const milestones = config.ROLE_REWARDS.MILESTONES || [];

    for (const milestone of milestones) {
        if (level >= milestone.level) {
            // Xác thực role tồn tại trong guild trước khi gán
            const role = member.guild.roles.cache.get(milestone.roleId);
            if (role && !member.roles.cache.has(milestone.roleId)) {
                // Kiểm tra xem vị trí của bot có thể gán được role này không (role của bot phải xếp cao hơn)
                if (me.roles.highest.comparePositionTo(role) > 0) {
                    rolesToAdd.push(milestone.roleId);
                } else {
                    console.warn(`[ROLE SYNC WARN] Role "${role.name}" ở vị trí cao hơn hoặc bằng role cao nhất của bot.`);
                }
            }
        }
    }

    if (rolesToAdd.length > 0) {
        try {
            await member.roles.add(rolesToAdd);
            console.log(`[ROLE SYNC] Đã đồng bộ gán ${rolesToAdd.length} role cấp độ cho ${member.user.tag} (Level ${level})`);
        } catch (e) {
            console.error(`[ROLE SYNC ERROR] Không thể gán roles cho ${member.user.tag}:`, e.message);
        }
    }
}

/**
 * Tạo lời mời / thông báo thưởng vai trò khi đạt mốc level.
 * Trả về chuỗi thông báo nếu lên cấp đạt mốc, ngược lại trả về null.
 */
function getMilestoneInviteMessage(oldLevel, newLevel, locale) {
    const supportGuildId = config.ROLE_REWARDS.SUPPORT_GUILD_ID;
    const inviteUrl = config.ROLE_REWARDS.SUPPORT_INVITE;
    const milestones = config.ROLE_REWARDS.MILESTONES || [];

    if (!supportGuildId || !inviteUrl || !milestones.length) return null;

    // Tìm mốc cao nhất được vượt qua
    const crossedMilestone = milestones
        .filter(m => oldLevel < m.level && newLevel >= m.level)
        .sort((a, b) => b.level - a.level)[0];

    if (!crossedMilestone) return null;

    const isEn = locale && locale.startsWith('en');
    const roleName = isEn ? crossedMilestone.name_en : crossedMilestone.name_vi;
    const coins = config.ROLE_REWARDS.GIFT_COINS.toLocaleString(isEn ? 'en-US' : 'vi-VN');

    return isEn
        ? `🎁 Join our **[Support Server](${inviteUrl})** to claim your exclusive **${roleName}** role and a one-time gift of **+${coins} coins**!`
        : `🎁 Hãy tham gia **[Server Hỗ Trợ](${inviteUrl})** để nhận vai trò độc quyền **${roleName}** và nhận gói quà tặng **+${coins} xu** nhé!`;
}

module.exports = { syncSupportGuildRoles, getMilestoneInviteMessage };
