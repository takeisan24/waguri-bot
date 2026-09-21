// ============================================================
// lib/storyCondition.js — Bộ Kiểm Tra Điều Kiện Cốt Truyện Hồi Ký Kikyo
// ============================================================

const db = require('../database');
const { getLevelFromExp } = require('./leveling');
const { createWaguriBar } = require('./embed');

/**
 * Kiểm tra điều kiện thỏa mãn để mở khóa/nhận thưởng của từng tiết đoạn cốt truyện.
 * @param {string} userId - Discord ID người chơi
 * @param {number} chapterId - Số thứ tự Hồi (1..5)
 * @param {number} nodeId - Số thứ tự Tiết (1..4)
 * @param {object} user - Bản ghi user hiện tại từ db.getUser
 * @param {string} locale - Ngôn ngữ hiển thị (vi/en)
 * @returns {Promise<{
 *   pass: boolean,
 *   guideText: string,
 *   progressText?: string,
 *   actionButton?: { customId: string, label: string, style: number, emoji?: string } | null
 * }>}
 */
async function checkStoryNodeCondition(userId, chapterId, nodeId, user, locale = 'vi') {
    const isEn = locale && locale.startsWith('en');
    const ch = Number(chapterId || 1);
    const nd = Number(nodeId || 1);

    // Tiết 4 của mọi Hồi là tiết kết thúc hồi (Đại thắng / Kỷ vật / Tốt nghiệp) -> Luôn mở để người chơi nhận kỷ vật
    if (nd === 4) {
        return {
            pass: true,
            guideText: isEn
                ? '🌸 You have conquered this chapter! Waguri is ready to present the chapter relic to you.'
                : '🌸 Cậu đã chinh phục trọn vẹn Hồi này! Waguri đang háo hức trao kỷ vật cho cậu nè.'
        };
    }

    try {
        // ========================================================
        // HỒI 1: CON HẺM NGÁT HƯƠNG (Làm quen & Khởi đầu)
        // ========================================================
        if (ch === 1) {
            if (nd === 1) {
                // Tiết 1: Thẻ học sinh mới (/profile)
                const pass = user && user.onboarded !== false;
                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🌸 Identity card confirmed!' : '🌸 Thẻ danh tính học sinh mới của cậu đã sẵn sàng!')
                        : (isEn ? '🌸 Please use `/profile` to check your student identity card first.' : '🌸 Cậu hãy gõ lệnh `/profile` để kiểm tra thẻ danh tính học sinh mới trước nhé.')
                };
            }
            if (nd === 2) {
                // Tiết 2: Điểm danh buổi sáng (/daily)
                const pass = Boolean(user && user.last_daily);
                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🌸 Morning allowance received!' : '🌸 Gói trợ cấp sinh hoạt buổi sáng đã nhận thành công!')
                        : (isEn ? '🌸 Please use `/daily` to claim your morning allowance.' : '🌸 Cậu hãy gõ lệnh `/daily` để nhận gói quà trợ cấp sinh hoạt buổi sáng nhen!')
                };
            }
            if (nd === 3) {
                // Tiết 3: Kiếm việc làm thêm (/work)
                const exp = Number(user?.exp || 0);
                const pass = exp >= 50 || Boolean(user?.last_work) || Boolean(user?.job_id);
                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🌸 Honest work completed!' : '🌸 Cậu đã hoàn thành công việc làm thêm đầu tiên rồi!')
                        : (isEn ? '🌸 Please use `/work` to earn your first honest wages together with Waguri.' : '🌸 Cậu hãy gõ lệnh `/work` để cùng Waguri đi làm thêm kiếm những đồng tiền chân chính đầu tiên nhé!')
                };
            }
        }

        // ========================================================
        // HỒI 2: BỜ SÔNG SAU GIỜ HỌC (Tài nguyên & Thử thách Subaru)
        // ========================================================
        if (ch === 2) {
            if (nd === 1) {
                // Tiết 1: Cần câu trúc (/fish)
                const hasRod = await db.hasItem(userId, 'can_cau');
                return {
                    pass: Boolean(hasRod),
                    guideText: hasRod
                        ? (isEn ? '🎣 Bamboo fishing rod is in your backpack!' : '🎣 Cần câu trúc đã sẵn sàng trong balo của cậu rồi!')
                        : (isEn ? '🎣 You need a bamboo rod (`/store buy can_cau` or from Chapter 1 Node 2) to fish by the river.' : '🎣 Cậu cần một chiếc cần câu trúc nhen (nhận từ Tiết trước hoặc mua tại `/store buy can_cau`) để ra bờ sông câu cá cùng Subaru nhé!')
                };
            }
            if (nd === 2) {
                // Tiết 2: Cuốc sắt đào mỏ (/mine)
                const hasPickaxe = await db.hasItem(userId, 'cuoc_sat');
                return {
                    pass: Boolean(hasPickaxe),
                    guideText: hasPickaxe
                        ? (isEn ? '⛏️ Iron pickaxe is ready!' : '⛏️ Chiếc cuốc sắt đã sẵn sàng để vào hang đá!')
                        : (isEn ? '⛏️ You need an iron pickaxe (`/store buy cuoc_sat` or from Chapter 1 Node 3) to mine ores in the cave.' : '⛏️ Cậu cần mang theo một chiếc cuốc sắt nhen (nhận từ Tiết trước hoặc mua tại `/store buy cuoc_sat`) để vào hang đá đào quặng nhé!')
                };
            }
            if (nd === 3) {
                // Tiết 3: Gieo mầm hy vọng (/trongcay muagiong)
                const plant = await db.getPlant(userId);
                const pass = Boolean(plant);
                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🌱 The seedling is growing in your garden!' : '🌱 Mầm cây hy vọng đang lớn lên trong khu vườn của cậu rồi!')
                        : (isEn ? '🌱 Visit the agriculture shop with `/trongcay muagiong` to plant your very first seed.' : '🌱 Cậu hãy ghé tiệm nông sản gieo mầm bằng lệnh `/trongcay muagiong` để cùng Waguri chăm sóc mầm cây đầu tiên nhé!')
                };
            }
        }

        // ========================================================
        // HỒI 3: ÁNH LỬA LÒ GEKKA (Cấp 5 & Mở Tiệm Bánh Gekka)
        // ========================================================
        if (ch === 3) {
            const bakery = await db.getBakery(userId);
            if (nd === 1) {
                // Tiết 1: Mở tiệm bánh Gekka (/tiembanh mo)
                if (bakery) {
                    return {
                        pass: true,
                        guideText: isEn ? '🍰 Gekka bakery hearth is lit and ready!' : '🍰 Bếp lò tiệm Gekka đã rực lửa và sẵn sàng nướng bánh!'
                    };
                }

                const exp = Number(user?.exp || 0);
                const level = getLevelFromExp(exp);
                const wallet = Number(user?.wallet || 0);

                if (level < 5) {
                    const bar = createWaguriBar(exp, 1600, 8);
                    const progressPct = Math.min(100, Math.floor((exp / 1600) * 100));
                    return {
                        pass: false,
                        guideText: isEn
                            ? `🌸 You need to reach Level 5 (1,600 EXP) to open the bakery hearth with Waguri! Try \`/work\` or \`/fish\` to level up.`
                            : `🌸 Cậu cần đạt Cấp 5 (1.600 EXP) để cùng Waguri phụ trách lò nướng tại Tiệm Gekka nhé~ Hãy làm thêm \`/work\` hoặc câu cá \`/fish\` nhen!`,
                        progressText: `📊 [${bar}] ${progressPct}% (${exp.toLocaleString('vi-VN')}/1.600 EXP)`
                    };
                }

                if (wallet < 10000) {
                    return {
                        pass: false,
                        guideText: isEn
                            ? `🌸 Level 5 reached! We still need 10,000 coins for initial baking supplies (you have ${wallet.toLocaleString('en-US')} coins).`
                            : `🌸 Cậu đã đạt Cấp 5 rồi! Chúng mình cần thêm 10.000 xu tiền vốn để chuẩn bị lò bánh nhen (hiện có: ${wallet.toLocaleString('vi-VN')} xu).`,
                        progressText: `🪙 ${wallet.toLocaleString('vi-VN')} / 10.000 xu`
                    };
                }

                // Đủ Cấp 5 và đủ 10.000 xu -> Cung cấp Nút 1-Click mở tiệm ngay!
                return {
                    pass: false,
                    guideText: isEn
                        ? '✨ Conditions met! Click [🍰 Open Bakery Now] below or use `/tiembanh mo` to light the hearth!'
                        : '✨ Đã đủ điều kiện! Cậu hãy bấm nút [🍰 Mở Tiệm Bánh Ngay] bên dưới hoặc gõ `/tiembanh mo` để nhóm lửa lò Gekka nhé! 🧁',
                    actionButton: {
                        customId: 'quest_quick_open_bakery',
                        label: isEn ? '🍰 Open Bakery Now' : '🍰 Mở Tiệm Bánh Ngay',
                        style: 1 // ButtonStyle.Primary
                    }
                };
            }

            if (nd === 2) {
                // Tiết 2: Nạp nguyên liệu bánh (/tiembanh nhapnl)
                const pass = Boolean(bakery && Number(bakery.stock || 0) > 0);
                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🥖 Ingredients stocked in the oven!' : '🥖 Nguyên liệu đã được nạp đầy vào lò nướng rồi!')
                        : (isEn ? '🥖 Please restock the bakery with `/tiembanh nhapnl` (use surplus bread or crops).' : '🥖 Cậu hãy nạp nguyên liệu vào lò bánh bằng lệnh `/tiembanh nhapnl` (dùng bánh mì hoặc nông sản dư) để lò bắt đầu nướng nhé!')
                };
            }

            if (nd === 3) {
                // Tiết 3: Thu hoạch mẻ bánh đầu mùa (/tiembanh thu)
                const pass = Boolean(bakery && Number(bakery.level || 0) >= 1);
                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🥐 First batch of warm pastries collected!' : '🥐 Mùi thơm nức mũi của những mẻ bánh nướng đầu mùa!')
                        : (isEn ? '🥐 Collect your baked goods using `/tiembanh thu`.' : '🥐 Cậu hãy gõ lệnh `/tiembanh thu` để thu hoạch những mẻ bánh nướng thơm ngon đầu tiên nhé!')
                };
            }
        }

        // ========================================================
        // HỒI 4: ĐÈN KHUYA MÙA THI (Pomodoro & Thú Cưng)
        // ========================================================
        if (ch === 4) {
            if (nd === 1) {
                // Tiết 1: 25 phút Pomodoro (/study start)
                const totalMins = Number(user?.total_study_minutes || 0);
                const streak = Number(user?.study_streak || 0);
                const points = Number(user?.study_points || 0);
                const pass = totalMins > 0 || streak > 0 || points > 0;

                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '📚 Focus study session finished!' : '📚 Cậu đã hoàn thành phiên học tập trung cùng Waguri rồi!')
                        : (isEn ? '📚 Exams are coming! Click [⏳ Start Pomodoro 25m] or type `/study start`.' : '📚 Kỳ thi đến rồi, cậu hãy bấm [⏳ Vào Học Pomodoro 25p] hoặc gõ `/study start` để cùng Waguri tập trung 25 phút nhen!'),
                    actionButton: !pass ? {
                        customId: 'quest_quick_study_start',
                        label: isEn ? '⏳ Start Pomodoro 25m' : '⏳ Vào Học Pomodoro 25p',
                        style: 1 // ButtonStyle.Primary
                    } : null
                };
            }

            if (nd === 2) {
                // Tiết 2: Nhận nuôi thú cưng (/pet view / adopt)
                const pet = await db.getPet(userId);
                const pass = Boolean(pet);

                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🐱 Your lovely companion is happily purring!' : '🐱 Bạn nhỏ bốn chân đang ngoan ngoãn bên cạnh cậu rồi!')
                        : (isEn ? '🐱 A tiny stray kitten is shivering under the rain! Click [🐾 Adopt Kitten] to give it a warm home.' : '🐱 Một bé mèo nhỏ đang run rẩy dưới hiên mưa kìa, cậu hãy bấm [🐾 Nhận Nuôi Bé Mèo] để đón bé về chăm sóc nhé!'),
                    actionButton: !pass ? {
                        customId: 'quest_quick_adopt_pet',
                        label: isEn ? '🐾 Adopt Kitten' : '🐾 Nhận Nuôi Bé Mèo',
                        style: 1 // ButtonStyle.Primary
                    } : null
                };
            }

            if (nd === 3) {
                // Tiết 3: Cho thú cưng ăn bánh (/pet feed)
                const pet = await db.getPet(userId);
                const pass = Boolean(pet && pet.fed_at);

                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🐟 Your pet has been lovingly fed!' : '🐟 Bé cưng đã được ăn no nê những mẩu bánh thơm ngon rồi!')
                        : (isEn ? '🐟 Feed your hungry pet with freshly baked pastries using `/pet feed`.' : '🐟 Bé mèo đang đói bụng kìa, cậu hãy nướng chút bánh ở tiệm Gekka rồi gõ `/pet feed` cho bé ăn nhé!')
                };
            }
        }

        // ========================================================
        // HỒI 5: NHỊP CẦU NỐI HAI TRƯỜNG (Thương Hội & Đỉnh Cao)
        // ========================================================
        if (ch === 5) {
            if (nd === 1) {
                // Tiết 1: Biến động thị trường (/market prices)
                const exp = Number(user?.exp || 0);
                const wallet = Number(user?.wallet || 0);
                const pass = exp >= 3000 || wallet >= 5000;

                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '📈 Market price trends examined!' : '📈 Cậu đã nắm bắt được quy luật biến động của sàn thương hội!')
                        : (isEn ? '📈 Check real-time crop price fluctuations using `/market prices`.' : '📈 Cậu hãy gõ `/market prices` để xem biểu đồ biến động giá nông sản theo giờ tại thương hội nhé!')
                };
            }

            if (nd === 2) {
                // Tiết 2: Chuyến hàng lớn (/market sell)
                const exp = Number(user?.exp || 0);
                const wallet = Number(user?.wallet || 0);
                const pass = exp >= 3500 || wallet >= 10000;

                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '💰 Big trading profits secured!' : '💰 Những chuyến hàng nông sản thắng lớn đã mang lại lợi nhuận cao!')
                        : (isEn ? '💰 Sell your harvest during green price peaks using `/market sell`.' : '💰 Hãy tận dụng lúc giá xanh đỉnh điểm để bán nông sản qua lệnh `/market sell` nhen!')
                };
            }

            if (nd === 3) {
                // Tiết 3: Mái nhà chung bang hội (/clan)
                const exp = Number(user?.exp || 0);
                const pass = Boolean(user?.clan_id) || exp >= 4000;

                return {
                    pass,
                    guideText: pass
                        ? (isEn ? '🛡️ United under the Clan banner!' : '🛡️ Mái nhà chung gắn kết bạn bè hai trường đã được xây đắp!')
                        : (isEn ? '🛡️ Join or create a clan with `/clan` to unite students from both schools.' : '🛡️ Hãy gia nhập hoặc lập một Bang hội qua lệnh `/clan` để cùng bạn bè hai trường gắn kết nhen!')
                };
            }
        }

        // Mặc định cho phép tiếp tục
        return { pass: true, guideText: '🌸 Sẵn sàng tiếp bước hành trình!' };
    } catch (e) {
        console.error('[STORY CONDITION ERROR] checkStoryNodeCondition:', e);
        // Fail-safe: Không làm hỏng trải nghiệm người chơi khi gặp sự cố
        return { pass: true, guideText: '🌸 Tiếp tục hành trình cùng Waguri nhé!' };
    }
}

module.exports = {
    checkStoryNodeCondition
};
