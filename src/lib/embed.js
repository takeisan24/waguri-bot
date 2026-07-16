const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const WAGURI_QUOTES = [
    "Bánh kem dâu của Rintaro làm ở tiệm Gekka luôn là ngon nhất! 🍰",
    "Subaru-chan luôn bảo vệ tớ chu đáo, tớ thật may mắn khi có cậu ấy! 👭",
    "Nhìn Rintaro tóc vàng trông hơi ngầu nhưng anh ấy là người dịu dàng nhất tớ từng biết đó~ 🥰",
    "Hôm nay cậu đã học bài chưa? Coi chừng bị Subaru-chan nhắc nhở đó nha! 📖",
    "Usami-kun lúc nào cũng ồn ào chọc cười mọi người hết á, vui ghê! 😆",
    "Saku-kun tuy ít nói nhưng lại rất chu đáo, cậu ấy hợp cạ với Subaru-chan lắm~ 🤫",
    "Madoka-kun tinh tế cực kỳ luôn, lúc nào cũng nhận ra mọi thứ trước tiên. ✨",
    "Học ở Kikyo tuy bài vở nhiều nhưng tớ luôn có mọi người bên cạnh động viên! 🌸",
    "Bánh ngọt và cậu là điều ngọt ngào nhất ngày hôm nay! 🧁",
    "Chỉ cần cắn một miếng bánh kem dâu là mọi mệt mỏi của tớ đều bay biến hết! 🍰✨",
    "Cậu đừng làm việc quá sức nha, nghỉ tay ghé tiệm Gekka ăn bánh với tớ đi! 🍵",
    "Ước gì mỗi ngày đều được cùng cậu ăn bánh ngọt và trò chuyện thế này~ 💕",
    "Dù bức tường giữa Kikyo và Chidori có cao đến đâu, chỉ cần chúng mình chân thành thì sẽ vượt qua hết! 🧱🌸",
    "Rintaro nói bánh ngọt là để mang lại nụ cười cho mọi người, tớ tin anh ấy làm được! 😊🍰",
    "Cố lên nhé! Hôm nay cậu đã vất vả rồi, tớ luôn ở sau cổ vũ cậu! 💪🌸"
];

function getWaguriQuote(locale) {
    const cleanLang = locale && locale.startsWith('en') ? 'en' : 'vi';
    if (cleanLang === 'en') {
        const enQuotes = [
            "Rintaro's strawberry shortcake at Gekka is always the best! 🍰",
            "Subaru-chan always protects me, I'm so lucky to have her! 👭",
            "Rintaro looks a bit cool with his blonde hair, but he is the gentlest person I know~ 🥰",
            "Have you studied today? Watch out or Subaru-chan might remind you! 📖",
            "Usami-kun is always making everyone laugh, so fun! 😆",
            "Saku-kun is quiet but very thoughtful, he gets along so well with Subaru-chan~ 🤫",
            "Madoka-kun is extremely delicate, always noticing things first. ✨",
            "Kikyo has a lot of schoolwork, but I always have everyone by my side! 🌸",
            "Sweets and you are the sweetest things today! 🧁",
            "Just one bite of strawberry shortcake and all my tiredness blows away! 🍰✨",
            "Don't overwork yourself, take a break and eat cake with me at Gekka! 🍵",
            "I wish we could eat sweets and chat like this every day~ 💕",
            "No matter how high the wall between Kikyo and Chidori is, as long as we are sincere, we'll overcome it! 🧱🌸",
            "Rintaro said sweets are to bring smiles to everyone, I believe he can do it! 😊🍰",
            "Keep it up! You worked hard today, I'm always cheering for you! 💪🌸"
        ];
        return enQuotes[Math.floor(Math.random() * enQuotes.length)];
    }
    return WAGURI_QUOTES[Math.floor(Math.random() * WAGURI_QUOTES.length)];
}

function getWaguriFooter(client, locale) {
    const { t } = require('./i18n');
    return {
        text: t(locale, 'common.embed_footer'),
        iconURL: client?.user?.displayAvatarURL()
    };
}

function createWaguriBar(cur, max, size = 10) {
    const ratio = max > 0 ? Math.min(cur / max, 1) : 0;
    const filled = Math.round(ratio * size);
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

/**
 * Lấy NGẪU NHIÊN 1 ảnh Waguri theo trạng thái (xoay tua cho đỡ nhàm).
 * Hỗ trợ cả pool dạng mảng (mới) lẫn 1 chuỗi URL (cũ) để khỏi vỡ tương thích.
 * @param {'MAIN'|'SUCCESS'|'ERROR'|'WARNING'|'JACKPOT'} key
 * @returns {string|undefined} URL ảnh, hoặc undefined nếu pool rỗng.
 */
function pickWaguriImage(key = 'MAIN') {
    const pool = config.WAGURI_IMAGES?.[key];
    if (!pool) return undefined;
    if (Array.isArray(pool)) {
        const list = pool.filter(Boolean);
        if (!list.length) return undefined;
        const img = list[Math.floor(Math.random() * list.length)];
        if (img && img.startsWith('/')) {
            return `${config.WEB_URL}${img}`;
        }
        return img;
    }
    const single = pool;
    if (single && single.startsWith('/')) {
        return `${config.WEB_URL}${single}`;
    }
    return single;
}

/**
 * Tạo và trang trí Embed theo chuẩn Waguri
 * @param {object} interaction - Command interaction
 * @param {'info'|'success'|'error'|'warning'|'jackpot'} type - Trạng thái kết quả
 * @param {object} opts - { title, description, fields, thumbnail, image }
 * @returns {EmbedBuilder}
 */
function buildWaguriEmbed(interaction, type = 'info', opts = {}) {
    const { title, description, fields, thumbnail, image } = opts;
    const colorMap = {
        info: config.COLORS.INFO,
        success: config.COLORS.SUCCESS,
        error: config.COLORS.ERROR,
        warning: config.COLORS.WARNING,
        jackpot: config.COLORS.JACKPOT
    };

    // Ảnh/GIF Waguri theo type -> RANDOM trong pool để mỗi lần 1 ảnh khác (xoay tua).
    const imgKey = { info: 'MAIN', success: 'SUCCESS', error: 'ERROR', warning: 'WARNING', jackpot: 'JACKPOT' }[type] || 'MAIN';
    const typeImg = pickWaguriImage(imgKey);
    const botAvatar = interaction.client?.user?.displayAvatarURL();

    const locale = opts.locale || (interaction ? (interaction.locale || interaction.guildLocale || 'vi') : 'vi');
    const embed = new EmbedBuilder()
        .setColor(colorMap[type] || config.COLORS.INFO)
        .setFooter(getWaguriFooter(interaction?.client, locale));

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (fields && fields.length) embed.addFields(fields);

    // Ảnh lớn: custom image > ảnh Waguri theo trạng thái
    const big = image || typeImg;
    if (big) embed.setImage(big);

    // Thumbnail nhỏ: chỉ khi lệnh truyền riêng (vd avatar người dùng); nếu không có ảnh lớn thì dùng avatar bot
    if (thumbnail) embed.setThumbnail(thumbnail);
    else if (!big && botAvatar) embed.setThumbnail(botAvatar);

    return embed;
}

module.exports = {
    WAGURI_QUOTES,
    getWaguriQuote,
    getWaguriFooter,
    createWaguriBar,
    pickWaguriImage,
    buildWaguriEmbed
};
