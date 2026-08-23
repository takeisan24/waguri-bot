// ============================================================
// test/i18n_song_song.test.js — tra ngôn ngữ không được ăn hết ngân sách ack.
//
// VÌ SAO CÓ: `getInteractionLanguage` chạy TRƯỚC `command.execute()` ở
// `interactionCreate.js:96`, tức trước cả `deferReply()`. Discord chỉ cho 3 giây.
//
// Tới 2026-08-23 nó tra DB hai lần NỐI TIẾP, mỗi lần trần 800ms -> tối đa 1600ms tiêu trước
// khi lệnh kịp mở miệng. Cộng vòng gọi mạng của defer là chạm trần 3 giây.
//
// Đã vỡ thật: /trongcay ở guild 1533401930024353792 — cảnh báo ack nổ ở 2500ms rồi
// deferReply ném `DiscordAPIError[10062] Unknown interaction`. Đọc mã thì trongcay vô can,
// deferReply là DÒNG ĐẦU của execute.
//
// Kiểu hỏng này khó thấy vì nó phụ thuộc ĐỘ TRỄ chứ không phụ thuộc dữ liệu: máy nhà nhanh
// thì không bao giờ tái hiện, chỉ người dùng thật ở xa mới dính.
// ============================================================
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const DUONG_DB = require.resolve('../src/database');
const DUONG_I18N = require.resolve('../src/lib/i18n');

/**
 * Nạp lại i18n với một `database` giả mà mỗi truy vấn chậm `treMs`.
 * Trả về { locale, tongMs, soLanGoi }.
 */
async function doVoiDbCham(treMs, { guildLanguage = null, userLocale = null } = {}) {
    const cacheDbCu = require.cache[DUONG_DB];
    const goiLuc = [];

    const cham = (giaTri) => new Promise(res => setTimeout(() => res(giaTri), treMs));

    require.cache[DUONG_DB] = {
        id: DUONG_DB, filename: DUONG_DB, loaded: true, exports: {
            getGuildSettings: (...a) => { goiLuc.push(['gs', Date.now()]); return cham(guildLanguage ? { language: guildLanguage } : {}); },
            getUser: (...a) => { goiLuc.push(['user', Date.now()]); return cham(userLocale ? { locale: userLocale } : {}); },
            updateUserLocale: async () => {},
        }
    };
    delete require.cache[DUONG_I18N];

    const t0 = Date.now();
    let locale;
    try {
        const { getInteractionLanguage } = require('../src/lib/i18n');
        locale = await getInteractionLanguage({
            // user/guild ngẫu nhiên để không dính bộ đệm 60 giây của lần chạy trước
            user: { id: 'u' + Math.random().toString(36).slice(2) },
            guildId: 'g' + Math.random().toString(36).slice(2),
            locale: 'vi',
        });
    } finally {
        delete require.cache[DUONG_I18N];
        if (cacheDbCu) require.cache[DUONG_DB] = cacheDbCu; else delete require.cache[DUONG_DB];
    }
    return { locale, tongMs: Date.now() - t0, soLanGoi: goiLuc.length };
}

test('hai lần tra DB chạy SONG SONG, không cộng dồn thời gian', async () => {
    const TRE = 300;
    const r = await doVoiDbCham(TRE);

    assert.strictEqual(r.soLanGoi, 2, 'Phải gọi đúng hai truy vấn (guild settings + user).');
    assert.ok(r.tongMs < TRE * 1.8,
        `Mất ${r.tongMs}ms cho hai truy vấn ${TRE}ms — đang chạy NỐI TIẾP. `
        + 'Nối tiếp thì trần là 1600ms tiêu trước khi lệnh kịp deferReply, và Discord chỉ cho 3000ms.');
});

test('tổng thời gian nằm trong ngân sách ack kể cả khi DB chậm hết mức', async () => {
    const { ACK_LOOKUP_TIMEOUT } = require('../src/lib/timeout');
    // Giả lập DB chậm hơn cả trần -> withTimeout phải cắt, và vì song song nên tổng vẫn ~1 trần.
    const r = await doVoiDbCham(ACK_LOOKUP_TIMEOUT + 400);

    assert.ok(r.tongMs < ACK_LOOKUP_TIMEOUT * 1.8,
        `Mất ${r.tongMs}ms trong khi trần mỗi truy vấn là ${ACK_LOOKUP_TIMEOUT}ms. `
        + 'Song song thì tổng phải xấp xỉ MỘT trần, không phải hai.');
    assert.ok(r.tongMs < 2000,
        `Mất ${r.tongMs}ms trước khi lệnh kịp chạy — còn lại quá ít trong 3000ms của Discord.`);
});

test('thứ tự ưu tiên KHÔNG đổi: cấu hình server thắng ngôn ngữ đã nhớ của người dùng', async () => {
    const r = await doVoiDbCham(10, { guildLanguage: 'en', userLocale: 'vi' });
    assert.strictEqual(r.locale, 'en',
        'Admin chủ động đặt /config language phải thắng ngôn ngữ ngầm định học được của cá nhân.');
});

test('không có cấu hình server thì dùng ngôn ngữ đã nhớ của người dùng', async () => {
    const r = await doVoiDbCham(10, { guildLanguage: null, userLocale: 'en' });
    assert.strictEqual(r.locale, 'en');
});

test('một truy vấn hỏng không kéo sập lần tra còn lại', async () => {
    // Promise.allSettled: một nhánh ném thì nhánh kia vẫn dùng được.
    const cacheDbCu = require.cache[DUONG_DB];
    require.cache[DUONG_DB] = {
        id: DUONG_DB, filename: DUONG_DB, loaded: true, exports: {
            getGuildSettings: async () => { throw new Error('DB sập'); },
            getUser: async () => ({ locale: 'en' }),
            updateUserLocale: async () => {},
        }
    };
    delete require.cache[DUONG_I18N];
    try {
        const { getInteractionLanguage } = require('../src/lib/i18n');
        const locale = await getInteractionLanguage({ user: { id: 'u-loi-' + Math.random() }, guildId: 'g-loi', locale: 'vi' });
        assert.strictEqual(locale, 'en',
            'getGuildSettings ném lỗi mà vẫn phải đọc được locale của người dùng.');
    } finally {
        delete require.cache[DUONG_I18N];
        if (cacheDbCu) require.cache[DUONG_DB] = cacheDbCu; else delete require.cache[DUONG_DB];
    }
});

test('interactionCreate vẫn tra ngôn ngữ TRƯỚC khi gọi execute — nên chỗ này còn nằm trên đường ack', () => {
    // Nếu ai đó dời lời gọi xuống sau execute thì test độ trễ ở trên hết ý nghĩa,
    // và người sửa cần biết điều đó.
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'events', 'interactionCreate.js'), 'utf8');
    const iLang = src.indexOf('await getInteractionLanguage(interaction)');
    const iExec = src.indexOf('await command.execute(interaction)');
    assert.ok(iLang !== -1 && iExec !== -1, 'Không đọc được hai mốc — test cần cập nhật.');
    assert.ok(iLang < iExec,
        'getInteractionLanguage nay chạy SAU execute — tốt cho ngân sách ack, nhưng hãy cập nhật '
        + 'lại các test độ trễ ở trên cho khớp thực tế mới.');
});
