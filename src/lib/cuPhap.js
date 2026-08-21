// ============================================================
// lib/cuPhap.js — Dựng chữ ký lệnh, dùng CHUNG cho `/help` và đường prefix.
//
// VÌ SAO TÁCH RA: trước đây `buildUsage` nằm riêng trong `help.js` và chỉ dựng được dạng
// gạch chéo. Hệ quả: `/help` hiện `/eco-admin trace <user> [limit]` ở dòng "Cách dùng",
// nhưng dòng "Prefix" chỉ nói `Cũng gõ được: w!eco-admin` — bỏ sạch tham số. 88/209 đơn vị
// bị vậy. Người dùng làm đúng như dòng dưới bảo, rồi nhận `TypeError` vì thiếu tham số
// bắt buộc (đã xảy ra thật trên prod ngày 21-08 với `w!eco-admin trace`).
//
// Nay một hàm dựng cả hai dạng, nên hai dòng đó KHÔNG THỂ lệch nhau nữa. `messageCreate`
// cũng dùng chính hàm này để báo cú pháp khi người dùng gõ thiếu — cùng một nguồn sự thật.
// ============================================================
const { ApplicationCommandOptionType } = require('discord.js');

// Số giá trị `choices` hiện ra trước khi rút gọn. Bốn là chỗ cân bằng: đủ để đoán ra dạng
// giá trị (`go`, `quang_sat`…) mà không thổi phồng field embed — Discord chặn cứng 1024
// ký tự cho value của một field, và `test/help_field_limit.test.js` đang canh ngưỡng đó.
const SO_CHOICE_HIEN = 4;

/**
 * Một option thành chuỗi: `<bắt buộc>` / `[tuỳ chọn]`.
 * @param {object} o option JSON
 * @param {boolean} keChoices có liệt kê giá trị hợp lệ không (dài hơn nhưng chỉ được đường đi)
 */
function fmtOpt(o, keChoices = false) {
    let than = o.name;
    if (keChoices && o.choices && o.choices.length) {
        const vals = o.choices.map(c => String(c.value));
        const hien = vals.slice(0, SO_CHOICE_HIEN).join('|');
        than = o.name + ': ' + hien + (vals.length > SO_CHOICE_HIEN ? '|+' + (vals.length - SO_CHOICE_HIEN) : '');
    }
    return o.required ? `<${than}>` : `[${than}]`;
}

/** Các "đơn vị gọi được" của một lệnh: mỗi subcommand một dòng, hoặc chính lệnh nếu không có sub. */
function donVi(json) {
    const opts = json.options || [];
    const subs = opts.filter(o => o.type === ApplicationCommandOptionType.Subcommand);
    if (subs.length) return subs.map(s => ({ duoi: ' ' + s.name, opts: s.options || [] }));
    return [{
        duoi: '',
        opts: opts.filter(o => o.type !== ApplicationCommandOptionType.Subcommand
            && o.type !== ApplicationCommandOptionType.SubcommandGroup),
    }];
}

/**
 * Chữ ký đầy đủ, mỗi đơn vị một dòng.
 * @param {object} json  command.data.toJSON()
 * @param {string} dau   '/' cho slash, 'w!' cho prefix
 * @param {boolean} keChoices
 */
function buildUsage(json, dau = '/', keChoices = false) {
    return donVi(json)
        .map(u => dau + json.name + u.duoi + u.opts.map(o => ' ' + fmtOpt(o, keChoices)).join(''))
        .join('\n');
}

/**
 * Chữ ký của MỘT đơn vị (dùng khi báo thiếu tham số — chỉ cần đúng dòng người ta vừa gõ).
 * @param {string|null} sub tên subcommand, null nếu lệnh không có sub
 */
function cuPhapDonVi(json, sub, dau = 'w!', keChoices = true) {
    const ds = donVi(json);
    const u = sub ? ds.find(x => x.duoi === ' ' + sub) : ds[0];
    if (!u) return dau + json.name;
    return dau + json.name + u.duoi + u.opts.map(o => ' ' + fmtOpt(o, keChoices)).join('');
}

/**
 * Tên các option BẮT BUỘC chưa có giá trị sau khi parse.
 *
 * Soi kết quả đã parse thay vì soi vòng lặp parse, vì một option rơi giá trị theo SÁU
 * đường khác nhau: không có token, số không hữu hạn, ngoài `choices`, dưới `min_length`,
 * mention không phân giải được, role/channel không tìm thấy. Soi đầu ra bắt hết cả sáu.
 */
function thieuBatBuoc(optionDefs, parsed) {
    const T = ApplicationCommandOptionType;
    const coGiaTri = (def) => {
        switch (def.type) {
            case T.User: return parsed.users[def.name] != null;
            case T.Integer:
            case T.Number: return parsed.integers[def.name] !== undefined;
            case T.Boolean: return parsed.booleans[def.name] !== undefined;
            case T.Role: return parsed.roles[def.name] != null;
            case T.Channel: return parsed.channels[def.name] != null;
            default: return parsed.strings[def.name] != null;
        }
    };
    return (optionDefs || []).filter(d => d.required && !coGiaTri(d)).map(d => d.name);
}

module.exports = { fmtOpt, buildUsage, cuPhapDonVi, thieuBatBuoc, donVi, SO_CHOICE_HIEN };
