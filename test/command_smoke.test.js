// Smoke test TẦNG LỆNH — thực sự gọi `execute()` với interaction giả.
//
// Khoảng trống này là gốc của một lớp lỗi lặp lại: handler parse hợp lệ, `node --check`
// im lặng, 154 test khác vẫn xanh, nhưng lệnh ném ngay khi người dùng gọi.
//   · `/eco-admin trace` -> ReferenceError: Cannot access 'C' before initialization (TDZ)
//   · `/loto`, `/bingo`  -> `hostId` chưa khai báo (đã sửa, là lý do bật `no-undef`)
//
// Phạm vi CÓ CHỦ Ý HẸP: hai subcommand chỉ-đọc của `/eco-admin`, vốn chưa từng được
// thực thi trong test. Không phủ 143 subcommand — lệnh có collector/button/modal cần
// hạ tầng giả gấp bội, là việc riêng. Harness dựng sao cho thêm một ca ≈ thêm một khối.
//
// DB được thay bằng hàm giả: test này khẳng định "handler không ném và render đúng",
// KHÔNG khẳng định truy vấn DB đúng — phần đó đã có test riêng.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { makeInteraction, textOf, stubDb, OWNER_ID } = require('./helpers/mockInteraction');

const db = require('../src/database.js');
const config = require('../src/config');
const ecoAdmin = require(path.join(__dirname, '..', 'src', 'commands', 'admin', 'eco-admin.js'));

// Locale phải giải xong mà không chạm DB thật, nếu không i18n sẽ nuốt lỗi rồi in ra
// console đầy nhiễu. Trả thẳng người dùng nói tiếng Việt.
const STUB_I18N = {
    getUser: async () => ({ user_id: OWNER_ID, locale: 'vi' }),
    getGuildSettings: async () => ({ language: 'vi' }),
    updateUserLocale: async () => {},
};

test('Smoke tầng lệnh: /eco-admin', async t => {

    await t.test('report — render được, không ném', async () => {
        const khoiPhuc = stubDb(db, {
            ...STUB_I18N,
            snapshotEconomy: async () => ({}),
            getEconomySnapshots: async () => ([
                { taken_on: '2026-08-14', total_supply: 5000, total_wallet: 3000, total_bank: 2000,
                  user_count: 61, active_7d: 37, premium_count: 2, richest: 900, avg_supply: 82 },
                { taken_on: '2026-08-13', total_supply: 4800, total_wallet: 2900, total_bank: 1900,
                  user_count: 60, active_7d: 35, premium_count: 2, richest: 880, avg_supply: 80 },
            ]),
            getLedgerFlow: async () => ([{ source: 'daily_claim', vao: 1200, ra: 0, rong: 1200 }]),
            getLedgerTopGainers: async () => ([{ user_id: OWNER_ID, username: 'NguoiTest', rong: 500 }]),
            getActivityByDay: async () => ([{ ngay: '2026-08-14', so_nguoi: 37 }]),
        });
        try {
            const { interaction, calls } = makeInteraction({ sub: 'report' });
            await ecoAdmin.execute(interaction);

            assert.ok(calls.some(c => c.kind === 'editReply'), 'có trả lời người dùng');
            const chu = textOf(calls);
            assert.match(chu, /Tổng cung tiền/, 'render đúng nhánh telemetry');
            assert.ok(chu.includes(config.CURRENCY), 'có ký hiệu tiền tệ — biến C giải đúng');
        } finally { khoiPhuc(); }
    });

    // ĐÂY là ca hồi quy của lỗi TDZ. Trước bản vá, khối `trace` chạm `C` trong khi khai
    // báo `const C` nằm ở CUỐI hàm -> ném ReferenceError trước khi kịp trả lời.
    await t.test('trace — render được, không ném (hồi quy TDZ)', async () => {
        const khoiPhuc = stubDb(db, {
            ...STUB_I18N,
            getLedgerUser: async () => ([
                { at: '2026-08-14T03:00:00Z', kind: 'wallet', delta: 250, balance_after: 1250, source: 'daily_claim', item_id: null },
                { at: '2026-08-14T02:00:00Z', kind: 'item', delta: -1, balance_after: null, source: 'sell_item_market', item_id: 'cuoc_sat' },
                { at: '2026-08-14T01:00:00Z', kind: 'wallet', delta: -500, balance_after: 1000, source: 'buy_item', item_id: null },
            ]),
            getItems: async () => ([{ id: 'cuoc_sat', name: 'Cuốc Sắt', price: 1000 }]),
        });
        try {
            const { interaction, calls } = makeInteraction({
                sub: 'trace',
                options: { user: { id: '300000000000000003', username: 'MucTieu' }, limit: 20 },
            });

            await ecoAdmin.execute(interaction); // ném là test đỏ ngay tại đây

            assert.ok(calls.some(c => c.kind === 'editReply'), 'có trả lời người dùng');
            const chu = textOf(calls);
            assert.match(chu, /Nhật ký giao dịch/, 'render đúng nhánh trace');
            assert.ok(chu.includes(config.CURRENCY), 'có ký hiệu tiền tệ — biến C giải đúng');
            assert.match(chu, /Cuốc Sắt/, 'dòng vật phẩm đổi id sang tên đọc được');
            assert.match(chu, /daily_claim/, 'có nhãn hàm DB đã gây ra thay đổi');
            // 250 - 500 = -250; dòng vật phẩm KHÔNG được tính vào tiền ròng.
            assert.match(chu, /-250/, 'tiền ròng cộng đúng, bỏ qua dòng vật phẩm');
        } finally { khoiPhuc(); }
    });

    await t.test('trace — nhật ký rỗng thì báo rõ, không ném', async () => {
        const khoiPhuc = stubDb(db, { ...STUB_I18N, getLedgerUser: async () => ([]) });
        try {
            const { interaction, calls } = makeInteraction({
                sub: 'trace',
                options: { user: { id: '300000000000000003', username: 'MucTieu' } },
            });
            await ecoAdmin.execute(interaction);
            assert.match(textOf(calls), /Chưa có dòng nhật ký nào/, 'nói rõ vì sao rỗng');
        } finally { khoiPhuc(); }
    });

    // Chặn hồi quy phân quyền: `/eco-admin` là owner-only và có thể cấp tiền.
    await t.test('người lạ bị chặn trước khi chạm DB', async () => {
        let chamDb = false;
        const khoiPhuc = stubDb(db, {
            ...STUB_I18N,
            getLedgerUser: async () => { chamDb = true; return []; },
        });
        try {
            const { interaction, calls } = makeInteraction({
                sub: 'trace',
                userId: '999999999999999999',
                ownerIds: [OWNER_ID],
                options: { user: { id: '300000000000000003', username: 'MucTieu' } },
            });
            await ecoAdmin.execute(interaction);
            assert.strictEqual(chamDb, false, 'không truy vấn nhật ký của người khác');
            assert.ok(calls.some(c => c.kind === 'reply'), 'từ chối ngay, không defer');
        } finally { khoiPhuc(); }
    });
});
