// Thứ tự ưu tiên chọn ngôn ngữ — test HỒI QUY.
//
// Bối cảnh: tính năng đa ngôn ngữ chết âm thầm vì HAI lỗi khoá nhau:
//   · cột `users.locale` chưa từng tồn tại trên DB (migration 0080 không được áp)
//   · `guildLocale` được xét TRƯỚC `interaction.locale`, mà bậc `interaction.locale` lại là
//     nơi DUY NHẤT gọi `updateUserLocale()` -> trong server bậc đó không bao giờ chạy
//     -> không ai ghi vào DB, kể cả khi cột có tồn tại.
// Sửa một nửa thì tính năng vẫn chết, nên phải có test khoá CẢ thứ tự.
//
// Thứ tự đã chốt (PA-A): chủ động thắng ngầm định; trong ngầm định, cá nhân thắng môi trường.
//   1. gs.language  2. u.locale  3. interaction.locale  4. guildLocale  5. 'vi'

const test = require('node:test');
const assert = require('node:assert');

const { stubDb } = require('./helpers/mockInteraction');
const db = require('../src/database.js');
const { getInteractionLanguage, getLanguage, invalidateLocaleCache } = require('../src/lib/i18n');

const GUILD = '900000000000000001';
let stt = 0;
// Mỗi ca một userId riêng: tầng i18n có cache 60s theo (userId, guildId), dùng lại id sẽ
// khiến ca sau đọc trúng kết quả ca trước.
const nguoiMoi = () => `zz_i18n_${++stt}`;

const boiCanh = ({ userId, locale = null, guildLocale = null, guildId = GUILD }) => ({
    user: { id: userId },
    guildId,
    locale,
    guildLocale,
});

test('i18n — thứ tự ưu tiên chọn ngôn ngữ', async t => {

    await t.test('bậc 1: admin đặt /config language thì THẮNG tất cả', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({ language: 'en' }),
            getUser: async () => ({ locale: 'vi' }),      // người dùng là vi
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: 'vi', guildLocale: 'vi' }));
            assert.strictEqual(kq, 'en', 'cấu hình admin phải thắng mọi tín hiệu khác');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 2: không có cấu hình admin -> dùng ngôn ngữ đã nhớ trong DB', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: 'en' }),
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: 'vi', guildLocale: 'vi' }));
            assert.strictEqual(kq, 'en', 'ngôn ngữ đã nhớ phải thắng tín hiệu Discord');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    // ĐÂY là ca hồi quy chính. Trước bản vá, `guildLocale` xét trước nên kết quả là 'en'.
    await t.test('bậc 3 THẮNG bậc 4: ngôn ngữ người dùng thắng ngôn ngữ server', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: null }),      // chưa học được gì
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: 'vi', guildLocale: 'en-US' }));
            assert.strictEqual(kq, 'vi', 'người Việt trong server tiếng Anh phải được nói tiếng Việt');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 3 CÓ HỌC lại vào DB (nếu không, cột locale vĩnh viễn rỗng)', async () => {
        const id = nguoiMoi();
        let daGhi = null;
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: null }),
            updateUserLocale: async (u, l) => { daGhi = { u, l }; return true; },
        });
        try {
            await getInteractionLanguage(boiCanh({ userId: id, locale: 'en-US', guildLocale: 'vi' }));
            assert.ok(daGhi, 'phải gọi updateUserLocale để lần sau lệnh prefix biết');
            assert.strictEqual(daGhi.u, id);
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 4: không biết gì về người dùng -> mới dùng ngôn ngữ server', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: null }),
            updateUserLocale: async () => true,
        });
        try {
            // locale = null mô phỏng đường prefix (`w!`): không có tín hiệu nào từ Discord
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: null, guildLocale: 'en-US' }));
            assert.strictEqual(kq, 'en', 'không có tín hiệu cá nhân thì mới theo server');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 5: không có tín hiệu nào -> mặc định tiếng Việt', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: null }),
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: null, guildLocale: null }));
            assert.strictEqual(kq, 'vi');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    // Mã Discord luôn kèm vùng ('en-US'). Phép so `locale === 'en'` cũ trong
    // updateUserLocale đẩy MỌI người dùng tiếng Anh xuống 'vi' -> ghi sai vĩnh viễn.
    await t.test('chuẩn hoá mã ngôn ngữ có vùng', () => {
        assert.strictEqual(getLanguage('en-US'), 'en', 'en-US phải là en, KHÔNG phải vi');
        assert.strictEqual(getLanguage('en-GB'), 'en');
        assert.strictEqual(getLanguage('vi-VN'), 'vi');
        assert.strictEqual(getLanguage('fr'), 'vi', 'ngôn ngữ không hỗ trợ -> mặc định vi');
        assert.strictEqual(getLanguage(null), 'vi');
    });

    // Đường prefix không có tín hiệu Discord nào; nếu shim điền sẵn 'vi' thì tầng i18n sẽ
    // tưởng đó là ngôn ngữ thật rồi HỌC vào DB, khoá cứng người dùng tiếng Anh vào tiếng Việt.
    await t.test('đường prefix: chưa biết thì KHÔNG được bịa ra rồi ghi vào DB', async () => {
        const id = nguoiMoi();
        let daGhi = false;
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: null }),
            updateUserLocale: async () => { daGhi = true; return true; },
        });
        try {
            await getInteractionLanguage(boiCanh({ userId: id, locale: null, guildLocale: null }));
            assert.strictEqual(daGhi, false, 'không có tín hiệu thật thì không được ghi gì vào DB');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });
});
