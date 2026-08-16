// ============================================================
// lib/antinuke/alert.js — Báo động ba đường.
//
// BA ĐƯỜNG vì đường nào cũng có thể vừa bị chính vụ nuke phá:
//   1. Kênh log của server  — rất có thể đã bị xoá cùng các kênh khác
//   2. DM chủ server        — sống sót kể cả khi server tan nát, nhưng có thể bị chặn DM
//   3. LOG_WEBHOOK_URL      — webhook của nhà phát triển, nằm NGOÀI server bị tấn công
// Cả ba cùng im lặng thì gần như chắc chắn là đã mất quyền, chứ không phải "không có gì xảy ra".
//
// CỐ Ý KHÔNG dùng buildWaguriEmbed: nó gắn ảnh/GIF Waguri ngẫu nhiên. Một báo động
// "server đang bị nuke" kèm ảnh anime đang ăn bánh là sai giọng, và ảnh lớn đẩy các
// trường thông tin xuống dưới màn hình điện thoại đúng lúc cần đọc nhanh nhất.
// ============================================================
const { EmbedBuilder } = require('discord.js');
const db = require('../../database.js');
const config = require('../../config');
const { t } = require('../i18n');
const { logError } = require('../logger');
const cacheCauHinh = require('./config');

const nguoi = new Map(); // 'guild:executor:action' -> mốc báo động gần nhất

function biTrung(guildId, executorId, action, now = Date.now()) {
    const k = `${guildId}:${executorId}:${action}`;
    const truoc = nguoi.get(k) || 0;
    if (now - truoc < config.ANTINUKE.ALERT_COOLDOWN_MS) return true;
    nguoi.set(k, now);
    // Dọn rác nhẹ: Map này chỉ phình khi có tấn công, nhưng vẫn phải có trần.
    if (nguoi.size > 500) {
        for (const [key, ts] of nguoi) if (now - ts > 60_000) nguoi.delete(key);
    }
    return false;
}

async function layLocale(guildId) {
    try {
        const s = await db.getGuildSettings(guildId);
        return s?.language === 'en' ? 'en' : 'vi';
    } catch {
        return 'vi';
    }
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {object} sc Sự cố: { executorId, action, hits, limit, verdict, mode, ketQua, lockdown, panic, incidentId, ghiChu }
 */
async function baoDong(guild, sc) {
    try {
        if (biTrung(guild.id, sc.executorId, sc.action)) return false;
        const locale = await layLocale(guild.id);
        const dryrun = sc.mode !== 'enforce';

        const ketQuaKey = {
            ok: 'antinuke.alert.result_ok',
            owner: 'antinuke.alert.result_owner',
            hierarchy: 'antinuke.alert.result_hierarchy',
            missing_perm: 'antinuke.alert.result_missing_perm',
            not_found: 'antinuke.alert.result_not_found',
            self: 'antinuke.alert.result_self',
        }[sc.ketQua] || 'antinuke.alert.result_error';

        const embed = new EmbedBuilder()
            .setColor(dryrun ? config.COLORS.WARNING : config.COLORS.ERROR)
            .setTitle(dryrun ? t(locale, 'antinuke.alert.title_dryrun') : t(locale, 'antinuke.alert.title'))
            .setDescription(t(locale, 'antinuke.alert.desc', {
                user: `<@${sc.executorId}>`,
                userId: sc.executorId,
                action: t(locale, `antinuke.action.${sc.action}`),
            }))
            .addFields(
                { name: t(locale, 'antinuke.alert.field_hits'), value: `${sc.hits}/${sc.limit}`, inline: true },
                { name: t(locale, 'antinuke.alert.field_verdict'), value: t(locale, `antinuke.verdict.${sc.verdict}`), inline: true },
                { name: t(locale, 'antinuke.alert.field_result'), value: dryrun ? t(locale, 'antinuke.alert.result_dryrun') : t(locale, ketQuaKey), inline: true },
            )
            .setTimestamp();

        if (sc.lockdown) embed.addFields({ name: t(locale, 'antinuke.alert.field_lockdown'), value: t(locale, 'antinuke.alert.lockdown_on') });
        if (sc.panic) embed.addFields({ name: t(locale, 'antinuke.alert.field_panic'), value: t(locale, 'antinuke.alert.panic_body') });
        if (sc.ghiChu) embed.addFields({ name: t(locale, 'antinuke.alert.field_note'), value: String(sc.ghiChu).slice(0, 1000) });
        if (sc.incidentId) embed.setFooter({ text: t(locale, 'antinuke.alert.footer', { id: sc.incidentId }) });

        // (1) Kênh log của server
        const kenhId = cacheCauHinh.get(guild.id).config?.log_channel;
        if (kenhId) {
            try {
                const ch = guild.channels.cache.get(kenhId) || await guild.channels.fetch(kenhId).catch(() => null);
                if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
            } catch { /* kênh log có thể vừa bị xoá — đó chính là lý do có đường 2 và 3 */ }
        }

        // (2) DM chủ server — chỉ khi thi hành thật, để dry-run không làm phiền mỗi ngày
        if (!dryrun) {
            try {
                const owner = await guild.fetchOwner();
                await owner.send({
                    content: t(locale, 'antinuke.alert.dm_prefix', { guild: guild.name }),
                    embeds: [embed],
                });
            } catch { /* chủ server chặn DM */ }
        }

        // (3) Webhook nhà phát triển (ngoài server bị tấn công)
        logError(`ANTI-NUKE ${guild.name}`, new Error(
            `${sc.action} · executor=${sc.executorId} · ${sc.hits}/${sc.limit} · verdict=${sc.verdict} · ketQua=${sc.ketQua} · mode=${sc.mode}`
        ), { guild: guild.id });

        return true;
    } catch (e) {
        logError('antinuke_alert', e, { guild: guild?.id });
        return false;
    }
}

module.exports = { baoDong };
