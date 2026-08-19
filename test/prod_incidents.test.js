// test/prod_incidents.test.js — Test sinh ra từ LOG PROD THẬT.
//
// Nhóm riêng vì chúng có nguồn gốc khác các test khác: không phải suy luận từ mã, mà từ lỗi
// người dùng thật gặp phải. Mỗi test ghi kèm dòng log đã dẫn tới nó.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Log 2026-08-20, lặp lại nhiều lần:
//   RangeError: Premium buttons must have an SKU id
//     at ChatInputCommandInteraction.editReply ... src/commands/economy/pass.js
//
// ButtonStyle.Premium là kiểu nút MONETIZATION CỦA DISCORD: bắt buộc có `sku_id` trỏ tới sản
// phẩm đăng ký với Discord, và KHÔNG nhận `custom_id`. Dự án bán Premium qua VietQR/Casso nên
// không có SKU nào. Mỗi người CHƯA Premium gõ /pass là lệnh hỏng hoàn toàn — mà hiện có 0
// người Premium, tức hỏng với 100% người dùng.
test('sự cố prod: không nút nào dùng ButtonStyle.Premium khi chưa có SKU Discord', () => {
    const dinh = [];
    const duyet = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const p = path.join(d, e.name);
            if (e.isDirectory()) { duyet(p); continue; }
            if (!e.name.endsWith('.js')) continue;
            const src = fs.readFileSync(p, 'utf8');
            // Bỏ dòng bình luận để không bắt nhầm chính lời giải thích ở trên.
            const code = src.replace(/(^|[^:])\/\/.*$/gm, '$1');
            if (/ButtonStyle\.Premium/.test(code)) dinh.push(path.relative(path.join(__dirname, '..'), p));
        }
    };
    duyet(path.join(__dirname, '..', 'src'));

    assert.deepStrictEqual(dinh, [],
        'ButtonStyle.Premium cần `sku_id` của Discord Monetization — dự án không có. ' +
        'Dùng Primary/Secondary với custom_id. Dính ở: ' + dinh.join(', '));
});

// Log 2026-08-20, lặp lại liên tục trong lúc DNS Supabase lỗi (EAI_AGAIN):
//   Lỗi autocomplete eat: DiscordAPIError[10062]: Unknown interaction
//     at AutocompleteInteraction.respond ... src/commands/economy/eat.js:29
//
// Autocomplete cũng có hạn ack 3 GIÂY như lệnh, và nó chạy MỖI LẦN GÕ MỘT KÝ TỰ. `getItems`
// đọc lại toàn bộ 90 món từ DB mỗi lần, không cache, không trần thời gian. 7/8 lệnh có
// autocomplete đều gọi DB kiểu này.
test('sự cố prod: danh mục vật phẩm/nghề phải qua cache', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'database.js'), 'utf8');

    assert.ok(/function catalogCached/.test(src), 'Thiếu lớp cache danh mục');
    for (const ham of ['getItems', 'getJobs']) {
        const i = src.indexOf(`async function ${ham}(`);
        assert.ok(i !== -1, `Không tìm thấy ${ham}`);
        const than = src.slice(i, i + 500);
        assert.ok(/catalogCached\(/.test(than),
            `${ham}() chưa qua cache — autocomplete gọi nó mỗi lần gõ phím, hạn ack chỉ 3 giây`);
    }

    // Không được cache kết quả RỖNG: getItems trả [] khi DB lỗi; cache lại nghĩa là giữ
    // nguyên trạng thái hỏng suốt cả TTL dù DB đã hồi.
    const iCache = src.indexOf('async function catalogCached');
    const thanCache = src.slice(iCache, iCache + 900);
    assert.ok(/data\.length/.test(thanCache),
        'catalogCached phải từ chối cache mảng rỗng — nếu không, một lần DB lỗi sẽ đóng băng trạng thái hỏng');
    assert.ok(/invalidateCatalogCache/.test(src), 'Cần cách xoá cache khi danh mục DB đổi');
});
