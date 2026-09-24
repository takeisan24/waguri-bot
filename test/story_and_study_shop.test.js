const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const { STORY_CHAPTERS } = require('../src/data/story_chapters');

test('CÂN BẰNG TIỆM BÁNH GEKKA: mở ở Cấp 3, phí 3,000 xu và dùng được banh_mi', () => {
    assert.strictEqual(config.BAKERY.MIN_LEVEL, 3, 'Cấp mở tiệm phải là 3');
    assert.strictEqual(config.BAKERY.OPEN_COST, 3000, 'Phí mở tiệm phải là 3,000 xu');
    assert.ok(config.BAKERY.FILLINGS.includes('banh_mi'), 'FILLINGS phải chứa banh_mi để giải cứu kho tồn');
});

test('CỐT TRUYỆN HỒI KÝ KIKYO: Có đủ 5 Hồi với dữ liệu hoàn chỉnh', () => {
    assert.strictEqual(STORY_CHAPTERS.length, 5, 'Phải có đúng 5 Hồi cốt truyện');

    for (let i = 0; i < STORY_CHAPTERS.length; i++) {
        const ch = STORY_CHAPTERS[i];
        assert.strictEqual(ch.id, i + 1, `ID của Hồi ${i + 1} phải khớp index`);
        assert.ok(ch.title && ch.title.length > 0, `Hồi ${ch.id} phải có tiêu đề`);
        assert.ok(ch.summary && ch.summary.length > 0, `Hồi ${ch.id} phải có tóm tắt`);
        assert.strictEqual(ch.nodes.length, 4, `Hồi ${ch.id} phải có đúng 4 Tiết đoạn`);

        for (let j = 0; j < ch.nodes.length; j++) {
            const nd = ch.nodes[j];
            assert.strictEqual(nd.id, j + 1, `ID của Tiết ${j + 1} trong Hồi ${ch.id} phải khớp index`);
            assert.ok(nd.title && nd.title.length > 0, `Tiết ${nd.id} phải có tiêu đề`);
            assert.ok(nd.intro && nd.intro.length > 0, `Tiết ${nd.id} phải có dẫn nhập`);
            assert.ok(nd.dialogue && nd.dialogue.length > 0, `Tiết ${nd.id} phải có lời thoại Waguri`);
            assert.ok(nd.command && nd.command.startsWith('/'), `Lệnh dẫn dắt phải bắt đầu bằng /: ${nd.command}`);
            assert.ok(nd.reward, `Tiết ${nd.id} phải có phần thưởng`);
            assert.ok(nd.reward.coins >= 0, 'Thưởng xu không được âm');
            assert.ok(nd.reward.exp >= 0, 'Thưởng exp không được âm');
            assert.ok(nd.reward.affection >= 0, 'Thưởng hảo cảm không được âm');
            assert.ok(nd.rewardText && nd.rewardText.length > 0, 'Phải có mô tả thưởng');
        }
    }
});

test('TIỆM TRI THỨC VẬT PHẨM: Đảm bảo các item cốt lõi đã được định nghĩa', () => {
    const expectedItems = [
        'tra_lofi',
        'men_no_co_truyen',
        'bot_ngu_coc_pet',
        'so_tay_ngu_nghiep',
        'bi_pho_dia_chat',
        'sach_tam_tri',
        'tui_lua_mach_kikyo',
        'khay_nuong_hoang_kim',
        'kinh_tri_thuc',
        'title_dai_hoc_si'
    ];
    const catalogJson = require('../scripts/db-catalog-ids.json');
    for (const id of expectedItems) {
        assert.ok(catalogJson.items.includes(id), `Catalog phải chứa item ${id}`);
    }
});

test('ANTI-SYBIL GUARDRAIL: Chặn acc clone cày quà tân thủ chuyển tiền', () => {
    const { getLevelFromExp } = require('../src/lib/leveling');
    function isTransferAllowed(exp, chapter) {
        const level = getLevelFromExp(exp);
        if (level < 5 && chapter < 4) return false;
        return true;
    }

    // Newbie Level 1, Chapter 1: KHÔNG ĐƯỢC
    assert.strictEqual(isTransferAllowed(0, 1), false, 'Level 1, Chapter 1 phải bị chặn');
    // Newbie Level 2, Chapter 2: KHÔNG ĐƯỢC
    assert.strictEqual(isTransferAllowed(100, 2), false, 'Level 2, Chapter 2 phải bị chặn');
    // Newbie Level 4, Chapter 3: KHÔNG ĐƯỢC
    assert.strictEqual(isTransferAllowed(500, 3), false, 'Level 4, Chapter 3 phải bị chặn');

    // Đạt Level >= 5 (từ 1600 EXP): ĐƯỢC
    assert.strictEqual(isTransferAllowed(1600, 1), true, 'Level >= 5 phải được phép');
    // Đã qua Hồi 3 (Chapter >= 4): ĐƯỢC
    assert.strictEqual(isTransferAllowed(200, 4), true, 'Chapter >= 4 phải được phép');
});

test('ĐIỀU KIỆN CỐT TRUYỆN: checkStoryNodeCondition cho cả 5 Hồi', async (t) => {
    const db = require('../src/database');
    const { checkStoryNodeCondition } = require('../src/lib/storyCondition');

    // Mock các hàm DB
    const origHasItem = db.hasItem;
    const origGetPlant = db.getPlant;
    const origGetBakery = db.getBakery;
    const origGetPet = db.getPet;

    t.after(() => {
        db.hasItem = origHasItem;
        db.getPlant = origGetPlant;
        db.getBakery = origGetBakery;
        db.getPet = origGetPet;
    });

    // 1. Tiết 4 của mọi Hồi phải luôn pass
    for (let c = 1; c <= 5; c++) {
        const res = await checkStoryNodeCondition('user1', c, 4, {});
        assert.strictEqual(res.pass, true, `Hồi ${c} Tiết 4 phải luôn mở`);
    }

    // 2. Hồi 1 Tiết 1 & 2 & 3
    const h1n1 = await checkStoryNodeCondition('user1', 1, 1, { onboarded: true });
    assert.strictEqual(h1n1.pass, true, 'Hồi 1 Tiết 1 đã onboarded phải pass');

    const h1n2Fail = await checkStoryNodeCondition('user1', 1, 2, { last_daily: null });
    assert.strictEqual(h1n2Fail.pass, false, 'Hồi 1 Tiết 2 chưa daily phải fail');

    const h1n2Pass = await checkStoryNodeCondition('user1', 1, 2, { last_daily: new Date().toISOString() });
    assert.strictEqual(h1n2Pass.pass, true, 'Hồi 1 Tiết 2 đã daily phải pass');

    const h1n3Fail = await checkStoryNodeCondition('user1', 1, 3, { exp: 0, last_work: null });
    assert.strictEqual(h1n3Fail.pass, false, 'Hồi 1 Tiết 3 chưa work phải fail');

    const h1n3Pass = await checkStoryNodeCondition('user1', 1, 3, { exp: 60 });
    assert.strictEqual(h1n3Pass.pass, true, 'Hồi 1 Tiết 3 exp >= 50 phải pass');

    // 3. Hồi 2: Thử thách câu cá, đào khoáng, trồng cây
    db.hasItem = async (uid, item) => item === 'can_cau';
    const h2n1Pass = await checkStoryNodeCondition('user1', 2, 1, {});
    assert.strictEqual(h2n1Pass.pass, true, 'Có can_cau phải pass Hồi 2 Tiết 1');

    db.hasItem = async (uid, item) => false;
    const h2n2Fail = await checkStoryNodeCondition('user1', 2, 2, {});
    assert.strictEqual(h2n2Fail.pass, false, 'Không có cuoc_sat phải fail Hồi 2 Tiết 2');

    db.getPlant = async () => null;
    const h2n3Fail = await checkStoryNodeCondition('user1', 2, 3, {});
    assert.strictEqual(h2n3Fail.pass, false, 'Chưa trồng cây phải fail Hồi 2 Tiết 3');

    db.getPlant = async () => ({ id: 1, tier: 1 });
    const h2n3Pass = await checkStoryNodeCondition('user1', 2, 3, {});
    assert.strictEqual(h2n3Pass.pass, true, 'Đã trồng cây phải pass Hồi 2 Tiết 3');

    // 4. Hồi 3 Tiết 1: Mở tiệm bánh Gekka
    db.getBakery = async () => null;
    // Cấp < 3 (exp 200): Không pass, có progress bar
    const h3n1LowLvl = await checkStoryNodeCondition('user1', 3, 1, { exp: 200, wallet: 20000 });
    assert.strictEqual(h3n1LowLvl.pass, false);
    assert.ok(h3n1LowLvl.progressText.includes('EXP'));
    assert.strictEqual(h3n1LowLvl.actionButton, undefined);

    // Cấp >= 3 (exp 400) nhưng thiếu tiền (< 3,000 xu)
    const h3n1Poor = await checkStoryNodeCondition('user1', 3, 1, { exp: 400, wallet: 1000 });
    assert.strictEqual(h3n1Poor.pass, false);
    assert.ok(h3n1Poor.progressText.includes('3.000 xu'));

    // Cấp >= 3 và đủ tiền (>= 3,000 xu) -> CÓ Nút 1-Click mở tiệm!
    const h3n1Ready = await checkStoryNodeCondition('user1', 3, 1, { exp: 400, wallet: 3000 });
    assert.strictEqual(h3n1Ready.pass, false);
    assert.ok(h3n1Ready.actionButton, 'Phải có action button');
    assert.strictEqual(h3n1Ready.actionButton.customId, 'quest_quick_open_bakery');

    // Đã mở tiệm -> Pass
    db.getBakery = async () => ({ level: 1, stock: 100 });
    const h3n1Done = await checkStoryNodeCondition('user1', 3, 1, { exp: 400, wallet: 3000 });
    assert.strictEqual(h3n1Done.pass, true);

    // 5. Hồi 4: Pomodoro & Thú cưng
    const h4n1NoStudy = await checkStoryNodeCondition('user1', 4, 1, { total_study_minutes: 0, study_streak: 0, study_points: 0 });
    assert.strictEqual(h4n1NoStudy.pass, false);
    assert.strictEqual(h4n1NoStudy.actionButton.customId, 'quest_quick_study_start');

    const h4n1Studied = await checkStoryNodeCondition('user1', 4, 1, { total_study_minutes: 25 });
    assert.strictEqual(h4n1Studied.pass, true);

    db.getPet = async () => null;
    const h4n2NoPet = await checkStoryNodeCondition('user1', 4, 2, {});
    assert.strictEqual(h4n2NoPet.pass, false);
    assert.strictEqual(h4n2NoPet.actionButton.customId, 'quest_quick_adopt_pet');

    db.getPet = async () => ({ species: 'meo', fed_at: null });
    const h4n2HasPet = await checkStoryNodeCondition('user1', 4, 2, {});
    assert.strictEqual(h4n2HasPet.pass, true);

    // Tiết 3: Cho pet ăn
    const h4n3NotFed = await checkStoryNodeCondition('user1', 4, 3, {});
    assert.strictEqual(h4n3NotFed.pass, false);

    db.getPet = async () => ({ species: 'meo', fed_at: new Date().toISOString() });
    const h4n3Fed = await checkStoryNodeCondition('user1', 4, 3, {});
    assert.strictEqual(h4n3Fed.pass, true, 'User mangoya.38_ với pet đã ăn phải pass');

    // 6. Hồi 5: Thị trường & Bang hội
    const h5n1Pass = await checkStoryNodeCondition('user1', 5, 1, { exp: 3500 });
    assert.strictEqual(h5n1Pass.pass, true);

    const h5n3Pass = await checkStoryNodeCondition('user1', 5, 3, { clan_id: 123 });
    assert.strictEqual(h5n3Pass.pass, true);
});


