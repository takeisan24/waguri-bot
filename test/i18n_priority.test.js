// Thứ tự ưu tiên chọn ngôn ngữ — test HỒI QUY.
//
// Bối cảnh: tính năng đa ngôn ngữ chết âm thầm vì HAI lỗi khoá nhau:
//   · cột `users.locale` chưa từng tồn tại trên DB (migration 0080 không được áp)
//   · `guildLocale` được xét TRƯỚC `interaction.locale`, mà bậc `interaction.locale` lại là
//     nơi DUY NHẤT gọi `updateUserLocale()` -> trong server bậc đó không bao giờ chạy
//     -> không ai ghi vào DB, kể cả khi cột có tồn tại.
// Sửa một nửa thì tính năng vẫn chết, nên phải có test khoá CẢ thứ tự.
//
// Thứ tự đã chốt (PA-A): chủ động thắng ngầm định; cá nhân thắng môi trường.
//   1. u.locale + locale_chosen (`/language`)  2. gs.language  3. interaction.locale
//   4. u.locale học được (chỉ đường prefix)    5. guildLocale  6. 'vi'
//
// Lỗi thứ hai (2026-10-21): bậc "học được" từng đứng TRÊN app Discord, mà chỉ ghi khi rỗng
// -> ngôn ngữ của lần đầu dùng bot bị KHOÁ VĨNH VIỄN, người Việt lỡ để app tiếng Anh một
// lần là bị nói tiếng Anh mãi. Ca "bậc 4 KHÔNG thắng app Discord" dưới đây khoá lỗi đó.

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

    await t.test('bậc 1: người dùng TỰ CHỌN qua /language thắng cả cấu hình server', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({ language: 'en' }),
            getUser: async () => ({ locale: 'vi', locale_chosen: true }),
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: 'en-US', guildLocale: 'en-US' }));
            assert.strictEqual(kq, 'vi', 'người Việt để app tiếng Anh, server tiếng Anh, đã chọn vi -> vi');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 2: admin đặt /config language thắng mọi tín hiệu NGẦM ĐỊNH', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({ language: 'en' }),
            getUser: async () => ({ locale: 'vi', locale_chosen: false }),  // vi chỉ là học được
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: 'vi', guildLocale: 'vi' }));
            assert.strictEqual(kq, 'en', 'cấu hình admin phải thắng ngôn ngữ học được và app Discord');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    // Ca hồi quy của lỗi KHOÁ: trước bản vá kết quả là 'en' mãi mãi.
    await t.test('bậc 4 KHÔNG thắng app Discord: đổi app sang tiếng Việt thì bot theo', async () => {
        const id = nguoiMoi();
        let daGhi = null;
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: 'en', locale_chosen: false }),  // học từ lần đầu
            updateUserLocale: async (u, l) => { daGhi = { u, l }; return true; },
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: 'vi', guildLocale: 'vi' }));
            assert.strictEqual(kq, 'vi', 'app Discord hiện tại phải thắng ngôn ngữ học từ lần đầu');
            assert.deepStrictEqual(daGhi, { u: id, l: 'vi' }, 'phải học lại để đường prefix theo kịp');
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 3 không ghi DB khi ngôn ngữ không đổi (lượt thường không tốn lần ghi)', async () => {
        const id = nguoiMoi();
        let daGhi = false;
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: 'en', locale_chosen: false }),
            updateUserLocale: async () => { daGhi = true; return true; },
        });
        try {
            await getInteractionLanguage(boiCanh({ userId: id, locale: 'en-US', guildLocale: 'vi' }));
            assert.strictEqual(daGhi, false);
        } finally { khoiPhuc(); invalidateLocaleCache(id); }
    });

    await t.test('bậc 4: đường prefix (không có app Discord) dùng ngôn ngữ đã học', async () => {
        const id = nguoiMoi();
        const khoiPhuc = stubDb(db, {
            getGuildSettings: async () => ({}),
            getUser: async () => ({ locale: 'en', locale_chosen: false }),
            updateUserLocale: async () => true,
        });
        try {
            const kq = await getInteractionLanguage(boiCanh({ userId: id, locale: null, guildLocale: 'vi' }));
            assert.strictEqual(kq, 'en', 'ngôn ngữ học được phải thắng ngôn ngữ server ở đường prefix');
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
