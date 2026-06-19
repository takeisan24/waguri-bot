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

function getWaguriQuote() {
    return WAGURI_QUOTES[Math.floor(Math.random() * WAGURI_QUOTES.length)];
}

function getWaguriFooter(client) {
    return {
        text: `🌸 Waguri • Trợ lý Tiệm bánh Gekka`,
        iconURL: client?.user?.displayAvatarURL()
    };
}

function createWaguriBar(cur, max, size = 10) {
    const ratio = max > 0 ? Math.min(cur / max, 1) : 0;
    const filled = Math.round(ratio * size);
    return '▰'.repeat(filled) + '▱'.repeat(size - filled);
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

    // Ảnh/GIF Waguri theo type (config.WAGURI_IMAGES) -> hiển thị dạng ẢNH LỚN (image).
    const imgKey = { info: 'MAIN', success: 'SUCCESS', error: 'ERROR', warning: 'WARNING', jackpot: 'JACKPOT' }[type] || 'MAIN';
    const typeImg = config.WAGURI_IMAGES?.[imgKey];
    const botAvatar = interaction.client?.user?.displayAvatarURL();

    const embed = new EmbedBuilder()
        .setColor(colorMap[type] || config.COLORS.INFO)
        .setFooter(getWaguriFooter(interaction.client));

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
    buildWaguriEmbed
};
