const { SlashCommandBuilder } = require('discord.js');
const { runCouple } = require('../../lib/couple');

const LINES = {
    hug: {
        emoji: '🤗',
        love: 2,
        set: [
            '{a} ôm {b} thật chặt, ấm áp ghê~ 🤗',
            '{a} dành cho {b} một cái ôm dịu dàng 🥰',
            '{a} ôm choàng lấy {b}, không muốn buông ra luôn 💕',
            '{a} ôm {b} một cái cho hết mệt mỏi nhé~'
        ]
    },
    kiss: {
        emoji: '💋',
        love: 3,
        set: [
            '{a} trao cho {b} một nụ hôn nhẹ lên má~ 💋',
            '{a} khẽ hôn lên trán {b} thật tình cảm 🥰',
            '{a} bất ngờ hôn lên môi {b} ngượng ngùng 💕'
        ]
    },
    pat: {
        emoji: '🫳',
        love: 1,
        set: [
            '{a} xoa xoa đầu {b} một cách nuông chiều~ 🥰',
            '{a} khẽ xoa đầu {b}: "Ngoan ngoan nhé, tớ ở đây rồi~" 🌸',
            '{a} đưa tay xoa nhẹ mái tóc {b} dịu dàng ✨'
        ]
    },
    poke: {
        emoji: '👉',
        love: 1,
        set: [
            '{a} chọc nhẹ vào má {b} tinh nghịch~ 😜',
            '{a} gõ nhẹ vào vai {b} trêu chọc: "Này này~" 🤭',
            '{a} lén chọc chọc vào eo {b} trêu đùa ⚡'
        ]
    },
    slap: {
        emoji: '😤',
        love: -1,
        set: [
            '{a} dỗi hờn tát/phát nhẹ vào tay {b}: "Đừng nghịch nữa mà~" 😤',
            '{a} tát yêu {b} một phát: "Cho chừa tội chọc ghẹo tớ nhé!" 💢',
            '{a} quay mặt đi dỗi {b}: "Hứ, ghét cậu ghê á!" 😾'
        ]
    }
};

const { getInteractionLanguage, t } = require('../../lib/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('action')
        .setDescription('Tương tác với bạn bè hoặc người ấy 💞')
        .addStringOption(o => o.setName('type').setDescription('Hành động tương tác').setRequired(true)
            .addChoices(
                { name: 'Ôm 🤗', value: 'hug' },
                { name: 'Hôn 💋', value: 'kiss' },
                { name: 'Xoa đầu 🫳', value: 'pat' },
                { name: 'Chọc 👉', value: 'poke' },
                { name: 'Tát yêu/Dỗi 😤', value: 'slap' }
            ))
        .addUserOption(o => o.setName('user').setDescription('Người cậu muốn tương tác').setRequired(true)),
    async execute(interaction) {
        const locale = await getInteractionLanguage(interaction);
        const type = interaction.options.getString('type');
        const act = LINES[type];

        // Đọc danh sách câu từ locales (trả về mảng). Fallback về act.set nếu thiếu.
        const localizedSet = t(locale, `commands.action.${type}`);
        const set = (Array.isArray(localizedSet) && localizedSet.length > 0) ? localizedSet : act.set;

        return runCouple(interaction, { emoji: act.emoji, lines: set, love: act.love }, locale);
    },
};
