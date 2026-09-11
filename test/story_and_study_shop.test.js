const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');
const { STORY_CHAPTERS } = require('../src/data/story_chapters');

test('CÂN BẰNG TIỆM BÁNH GEKKA: mở ở Cấp 5, phí 10,000 xu và dùng được banh_mi', () => {
    assert.strictEqual(config.BAKERY.MIN_LEVEL, 5, 'Cấp mở tiệm phải là 5');
    assert.strictEqual(config.BAKERY.OPEN_COST, 10000, 'Phí mở tiệm phải là 10,000 xu');
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

