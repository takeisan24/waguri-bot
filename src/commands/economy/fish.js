const { SlashCommandBuilder } = require('discord.js');
const config = require('../../config');
const FISH = require('../../data/fish');
const { t } = require('../../lib/i18n');
const { petBuffValue } = require('../../data/pets');
const { runGather } = require('../../lib/gather');

const FISH_NAMES = {
    'Rác / lốp xe cũ': { en: 'Trash / Old Tire', vi: 'Rác / lốp xe cũ' },
    'Cá lòng tong': { en: 'Small Fish', vi: 'Cá lòng tong' },
    'Cá rô phi': { en: 'Tilapia', vi: 'Cá rô phi' },
    'Cá lóc bự': { en: 'Big Snakehead Fish', vi: 'Cá lóc bự' },
    'Cá hiếm': { en: 'Rare Fish', vi: 'Cá hiếm' },
    'Rương kho báu': { en: 'Treasure Chest', vi: 'Rương kho báu' }
};

// Cấp vật phẩm rồi CHỈ khoe khi cấp được THẬT — nay đi qua `moSoTrao` ở lib/gather.js, một
// cửa dùng chung với /mine và /chop. Bản `traoCa` cục bộ trước đây CÓ kiểm kết quả (nên
// /fish không nói sai), nhưng không ghi log và không nói gì với người chơi: mẻ Cá Rồng Kim
// Long 0,1% hụt thì biến mất không dấu vết, trong khi LƯỢT CÂU ĐÃ BỊ TIÊU.

// Drop nguyên liệu Tiệm Bánh Gekka theo loại cá — copy nguyên văn từ fish.js cũ.
async function fishDrops({ userId, c, userPet, locale, so }) {
    const en = !!locale?.startsWith('en');
    let desc = '';
    let daTrao = false;   // cấp được món vừa rồi hay không
    if (c.max > 0) {
        const rand = Math.random();
        if (c.name === 'Cá lòng tong' && rand < 0.35) {
            daTrao = await so.trao(userId, 'ca_tuoi', 1, 'fish');
            const iName = t(locale, 'data.items.ca_tuoi.name') || 'Cá Tươi';
            if (daTrao) desc += en
                ? `\n🐟 Your bucket has **1× ${iName}** *(ingredient for \`/bakery\`)*`
                : `\n🐟 Giỏ cá có thêm **1× Cá Tươi** *(nguyên liệu \`/bakery\`)*`;
        } else if (c.name === 'Cá rô phi' && rand < 0.45) {
            daTrao = await so.trao(userId, 'ca_tuoi', 1, 'fish');
            const iName = t(locale, 'data.items.ca_tuoi.name') || 'Cá Tươi';
            if (daTrao) desc += en
                ? `\n🐟 Your bucket has **1× ${iName}** *(ingredient for \`/bakery\`)*`
                : `\n🐟 Giỏ cá có thêm **1× Cá Tươi** *(nguyên liệu \`/bakery\`)*`;
        } else if (c.name === 'Cá lóc bự') {
            if (rand < 0.30) {
                daTrao = await so.trao(userId, 'ca_ngon', 1, 'fish');
                const iName = t(locale, 'data.items.ca_ngon.name') || 'Cá Ngon';
                if (daTrao) desc += en
                    ? `\n✨ Your bucket has **1× ${iName}** *(special bakery ingredient!)*`
                    : `\n✨ Giỏ cá có thêm **1× Cá Ngon** *(nguyên liệu làm bánh đặc biệt!)*`;
            } else if (rand < 0.70) {
                daTrao = await so.trao(userId, 'ca_tuoi', 1, 'fish');
                const iName = t(locale, 'data.items.ca_tuoi.name') || 'Cá Tươi';
                if (daTrao) desc += en
                    ? `\n🐟 Your bucket has **1× ${iName}** *(ingredient for \`/bakery\`)*`
                    : `\n🐟 Giỏ cá có thêm **1× Cá Tươi** *(nguyên liệu \`/bakery\`)*`;
            }
        } else if (c.name === 'Cá hiếm') {
            const petSkills = userPet?.skills || {};
            const fishingLuckLvl = petSkills.fishing_luck || 0;
            let fishingLuckBuff = 0;
            if (fishingLuckLvl === 1) fishingLuckBuff = 0.03;
            else if (fishingLuckLvl === 2) fishingLuckBuff = 0.07;
            else if (fishingLuckLvl === 3) fishingLuckBuff = 0.15;

            const dropRates = config.COLLECTIONS?.DROP_RATES || { FISH_CA_RONG_VANG: 0.10 };
            if (rand < (dropRates.FISH_CA_RONG_VANG + fishingLuckBuff)) {
                daTrao = await so.trao(userId, 'ca_rong_vang', 1, 'fish');
                const iName = t(locale, 'data.items.ca_rong_vang.name') || 'Cá Rồng Kim Long';
                if (daTrao) desc += en
                    ? `\n🏮 Your bucket has **1× ${iName}** 👑 *(super rare Epic item!)*`
                    : `\n🏮 Giỏ cá có thêm **1× Cá Rồng Kim Long** 👑 *(vật phẩm Sử Thi siêu hiếm!)*`;
            } else if (rand < 0.40) {
                daTrao = await so.trao(userId, 'ca_hiem', 1, 'fish');
                const iName = t(locale, 'data.items.ca_hiem.name') || 'Cá Hiếm';
                if (daTrao) desc += en
                    ? `\n🌟 Your bucket has **1× ${iName}** *(rare ingredient for bakery!)*`
                    : `\n🌟 Giỏ cá có thêm **1× Cá Hiếm** *(nguyên liệu siêu hiếm cho tiệm!)*`;
            } else {
                daTrao = await so.trao(userId, 'ca_ngon', 1, 'fish');
                const iName = t(locale, 'data.items.ca_ngon.name') || 'Cá Ngon';
                if (daTrao) desc += en
                    ? `\n✨ Your bucket has **1× ${iName}** *(special bakery ingredient!)*`
                    : `\n✨ Giỏ cá có thêm **1× Cá Ngon** *(nguyên liệu làm bánh đặc biệt!)*`;
            }
        } else if (c.name === 'Rương kho báu') {
            const petSkills = userPet?.skills || {};
            const fishingLuckLvl = petSkills.fishing_luck || 0;
            let fishingLuckBuff = 0;
            if (fishingLuckLvl === 1) fishingLuckBuff = 0.03;
            else if (fishingLuckLvl === 2) fishingLuckBuff = 0.07;
            else if (fishingLuckLvl === 3) fishingLuckBuff = 0.15;

            const dropRates = config.COLLECTIONS?.DROP_RATES || { FISH_CA_KOI_NHAT: 0.10 };
            if (rand < (dropRates.FISH_CA_KOI_NHAT + fishingLuckBuff)) {
                daTrao = await so.trao(userId, 'ca_koi_nhat', 1, 'fish');
                const iName = t(locale, 'data.items.ca_koi_nhat.name') || 'Cá Koi Hoàng Gia';
                if (daTrao) desc += en
                    ? `\n👑 Your bucket has **1× ${iName}** ⭐ *(super rare LEGENDARY item!)*`
                    : `\n👑 Giỏ cá có thêm **1× Cá Koi Hoàng Gia** ⭐ *(vật phẩm HUYỀN THOẠI cực hiếm!)*`;
            }
        }
    }
    return desc;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fish')
        .setDescription('Đi câu cá kiếm tiền (tốn năng lượng)'),
    execute: (interaction) => runGather(interaction, {
        key: 'fish',
        tool: { id: 'can_cau', name: 'Cần câu cá', nameEn: 'Fishing Rod', emoji: '🎣' },
        energyCost: config.FISH.ENERGY_COST,
        table: FISH,
        title: (en) => en ? '🎣・Go Fishing' : '🎣・Đi câu cá',
        name: (c, en) => (FISH_NAMES[c.name]?.[en ? 'en' : 'vi']) || c.name,
        toolMissing: (_toolNameTrans, _tool, en) => en
            ? 'You need to buy a **Fishing Rod** 🎣 at `/store` first! 🌸'
            : 'Cậu cần mua **Cần câu cá** 🎣 ở `/store` mới đi câu được nhé~ 🌸',
        // harvest 🌾 (Gấu con / Kim Quy): tỉ lệ nâng mẻ thường lên "Cá hiếm" TRƯỚC khi tính
        // tiền. Ngưỡng Lv.5 cũ đã bỏ; tỉ lệ nay nhân theo bậc (10% Thường → 20% Thần Thoại).
        onPick: (c, userPet, _en) => {
            const bonus = petBuffValue(userPet, 'harvest');
            if (bonus > 0 && c.name !== 'Cá hiếm' && c.name !== 'Rương kho báu') {
                if (Math.random() < bonus) return FISH.find(f => f.name === 'Cá hiếm') || c;
            }
            return c;
        },
        sold: (c, nm, payoutStr, ex, en) => en
            ? `You caught ${c.emoji} **${nm}** and sold it for **+${payoutStr}** ${config.CURRENCY}!${ex.grossStr}${ex.premStr}${ex.evStr}`
            : `Cậu câu được ${c.emoji} **${nm}** và bán được **+${payoutStr}** ${config.CURRENCY}!${ex.grossStr}${ex.premStr}${ex.evStr}`,
        empty: (c, nm, en) => en
            ? `You only caught ${c.emoji} **${nm}**... and got nothing 😅 Better luck next time~`
            : `Cậu chỉ câu phải ${c.emoji} **${nm}**... chẳng được gì cả 😅 Lần sau may hơn nhé~`,
        thoNote: (petLabel, pct, en) => en
            ? `\n${petLabel} nimbly helped you save ${pct}% energy!`
            : `\n${petLabel} nhanh nhẹn giúp cậu tiết kiệm ${pct}% năng lượng!`,
        toolLine: (_toolNameTrans, _tool, toolResult, en) => {
            const brokenStr = toolResult.broken ? (en ? ' *(broken! Need repair or buy new)*' : ' *(đã hỏng! Cần mua mới hoặc sửa)*') : '';
            return en
                ? `\nFishing rod durability: **${toolResult.durability}/100** 🎣${brokenStr}`
                : `\nĐộ bền Cần câu: **${toolResult.durability}/100** 🎣${brokenStr}`;
        },
        onDrops: fishDrops,
    }),
};
