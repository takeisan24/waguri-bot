// test/pet_rarity.test.js — Bậc độ hiếm thú cưng (thuần, KHÔNG cần DB).
//
// Cố ý chỉ chạm `src/data/pets.js`: module này không có phụ thuộc ngoài nên bộ test
// chạy được cả trong worktree chưa `npm install`. Phần cần DB (ascend_pet /
// hatch_pet_egg của migration 0142) nằm ở bộ test tích hợp riêng.
//
// Vì sao cần bộ này: trước bản vá, "buff loài" nằm rải rác ở 5 tệp dưới dạng so chuỗi
// `pet.species === 'meo'` kèm ngưỡng `>= 5` chép tay. Đo trên prod: 0/2 pet từng chạm
// Lv.5 -> KHÔNG buff nào từng chạy, và không test nào phát hiện ra.

const test = require('node:test');
const assert = require('node:assert');

const {
    SPECIES, RARITY, RARITY_ORDER, BUFFS, EGGS, AUTO_RARITY_CAP,
    petLevel, expForLevel, findSpecies,
    petRarity, buffOf, rarityMult, petBuffValue, petThiefFineCut, nextRarity, rarityRank,
} = require('../src/data/pets');

const pet = (species, exp = 0, ascended_to = null) => ({ species, exp, ascended_to });

test('Công thức cấp khớp mốc bậc', () => {
    assert.strictEqual(petLevel(0), 1);
    assert.strictEqual(petLevel(479), 4);
    assert.strictEqual(petLevel(480), 5, 'Lv.5 = 480 exp (mốc bậc Hiếm)');
    assert.strictEqual(petLevel(2430), 10, 'Lv.10 = mốc Sử Thi');
    assert.strictEqual(petLevel(10830), 20, 'Lv.20 = mốc Thần Thoại');
    assert.strictEqual(petLevel(-999), 1, 'exp âm không được làm vỡ công thức');
    for (const lvl of [1, 5, 10, 15, 20]) {
        assert.strictEqual(petLevel(expForLevel(lvl)), lvl, `expForLevel(${lvl}) phải quay về đúng cấp`);
    }
});

test('Buff BẬT NGAY khi nhận nuôi — ngưỡng Lv.5 cũ đã bỏ', () => {
    // Đây là mấu chốt của cả bản vá: trước đây giá trị này là 0 cho tới Lv.5,
    // mà chưa ai từng tới Lv.5.
    assert.strictEqual(petBuffValue(pet('gau', 0), 'harvest'), 0.10);
    assert.strictEqual(petBuffValue(pet('meo', 0), 'jackpot'), 0.05);
    assert.strictEqual(petBuffValue(pet('cun', 0), 'guard'), 0.20);
});

test('Cấp chỉ tự đưa lên tới trần AUTO_RARITY_CAP', () => {
    assert.strictEqual(petRarity(pet('gau', 0)).key, 'common');
    assert.strictEqual(petRarity(pet('gau', 480)).key, 'rare');
    // Cày tới cấp vô cực cũng không tự lên Sử Thi — phải làm lễ.
    assert.strictEqual(petRarity(pet('gau', 9_999_999)).key, AUTO_RARITY_CAP);
});

test('Làm lễ nâng bậc, và KHÔNG hạ được bậc', () => {
    assert.strictEqual(petRarity(pet('gau', 10830, 'mythic')).key, 'mythic');
    assert.strictEqual(petBuffValue(pet('gau', 10830, 'mythic'), 'harvest'), 0.20);
    // Loài khởi điểm cao mà "lễ" ghi bậc thấp -> vẫn giữ bậc cao.
    assert.strictEqual(petRarity(pet('kim_quy', 0, 'common')).key, 'mythic');
    // Giá trị rác trong cột không được làm tụt bậc.
    assert.strictEqual(petRarity(pet('gau', 480, 'sieu_cap')).key, 'rare');
    assert.strictEqual(petRarity(pet('gau', 480, '')).key, 'rare');
});

test('Loài nở từ trứng khởi điểm đúng bậc của trứng', () => {
    for (const [eggId, egg] of Object.entries(EGGS)) {
        const matches = SPECIES.filter(s => s.rarity === egg.rarity && !s.adoptable);
        assert.ok(matches.length >= 1, `${eggId} phải có ít nhất 1 loài để nở ra`);
        for (const s of matches) {
            assert.strictEqual(petRarity(pet(s.id, 0)).key, egg.rarity);
        }
    }
});

test('Không có pet / sai buff / loài lạ đều trả 0, không ném lỗi', () => {
    assert.strictEqual(petBuffValue(null, 'harvest'), 0);
    assert.strictEqual(petBuffValue(undefined, 'harvest'), 0);
    assert.strictEqual(rarityMult(null), 1, 'không pet -> nhân 1, điểm gọi vô hại');
    assert.strictEqual(petBuffValue(pet('meo', 480), 'harvest'), 0, 'Mèo không mang buff harvest');
    assert.strictEqual(buffOf(pet('khong_ton_tai', 0)), null);
    assert.strictEqual(petBuffValue(pet('khong_ton_tai', 0), 'harvest'), 0);
    assert.strictEqual(petThiefFineCut(pet('gau', 0)), 0, 'Gấu không có vế giảm phạt');
});

test('Hệ số bậc đơn điệu tăng và kịch trần ×2,0', () => {
    let prev = 0;
    for (const key of RARITY_ORDER) {
        const m = RARITY[key].mult;
        assert.ok(m > prev, `${key} phải cao hơn bậc trước`);
        prev = m;
    }
    assert.strictEqual(RARITY.common.mult, 1.0);
    assert.strictEqual(RARITY.mythic.mult, 2.0, 'bậc cao nhất gấp đôi bậc thường, không hơn');
    assert.strictEqual(rarityRank('khong_ton_tai'), -1);
});

test('nextRarity dẫn đúng một bậc rồi dừng ở trần', () => {
    assert.strictEqual(nextRarity(pet('gau', 0)).key, 'rare');
    assert.strictEqual(nextRarity(pet('gau', 480)).key, 'epic');
    assert.strictEqual(nextRarity(pet('kim_quy', 0)), null, 'Thần Thoại là hết đường');
});

test('Sáu loài nhận nuôi được đều khởi điểm Thường', () => {
    const adoptable = SPECIES.filter(s => s.adoptable);
    assert.strictEqual(adoptable.length, 6);
    for (const s of adoptable) {
        // Nếu một loài nhận nuôi miễn phí lại khởi điểm bậc cao thì ai cũng chọn nó
        // và toàn bộ thang bậc mất ý nghĩa.
        assert.strictEqual(s.rarity, 'common', `${s.id} nhận nuôi miễn phí thì phải khởi điểm Thường`);
    }
});

test('Mọi loài khai buff hợp lệ, mọi buff đều có loài mang', () => {
    const used = new Set();
    for (const s of SPECIES) {
        assert.ok(BUFFS[s.buff], `${s.id} khai buff không tồn tại: ${s.buff}`);
        assert.ok(RARITY[s.rarity], `${s.id} khai bậc không tồn tại: ${s.rarity}`);
        assert.ok(findSpecies(s.id), `${s.id} phải tra ngược được`);
        used.add(s.buff);
    }
    for (const id of Object.keys(BUFFS)) {
        assert.ok(used.has(id), `buff ${id} không loài nào mang -> code chết`);
    }
    assert.strictEqual(new Set(SPECIES.map(s => s.id)).size, SPECIES.length, 'id loài phải duy nhất');
});

test('Tỉ lệ trứng: hiếm hơn thì rơi ít hơn, và neo dưới thang sẵn có', () => {
    const order = ['trung_su_thi', 'trung_huyen_thoai', 'trung_than_thoai'];
    for (let i = 1; i < order.length; i++) {
        assert.ok(EGGS[order[i]].rate < EGGS[order[i - 1]].rate,
            `${order[i]} phải hiếm hơn ${order[i - 1]}`);
    }
    // Thần Thoại không được phổ biến hơn Cá Koi (thực tế 0,1%) quá nhiều.
    assert.ok(EGGS.trung_than_thoai.rate <= 0.002, 'trứng Thần Thoại phải thực sự hiếm');
    // Nhưng cũng không được hiếm tới mức bất khả thi: nhịp cày thật là 36 lượt/7 người.
    assert.ok(EGGS.trung_than_thoai.rate >= 0.001, 'hiếm quá thì thành bậc không tồn tại');
});
