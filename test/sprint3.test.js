const test = require('node:test');
const assert = require('node:assert');
const config = require('../src/config');

test('Sprint 3: Vehicle configurations and cost validation', () => {
    assert.ok(config.VEHICLES);
    // energy_cost càng thấp = càng xịn (giá càng cao). Cơ bản /work tốn 10.
    assert.strictEqual(config.VEHICLES.xe_dap.energy_cost, 9);
    assert.strictEqual(config.VEHICLES.xe_wave.energy_cost, 8);
    assert.strictEqual(config.VEHICLES.xe_vespa.energy_cost, 6);
    assert.strictEqual(config.VEHICLES.o_to_vinfast.energy_cost, 5);
    assert.strictEqual(config.VEHICLES.sh.energy_cost, 4);
    assert.strictEqual(config.VEHICLES.o_to_cu.energy_cost, 4);
    assert.strictEqual(config.VEHICLES.mercedes.energy_cost, 3);
    assert.strictEqual(config.VEHICLES.xe_wave.name, 'Xe Honda Wave');
    assert.strictEqual(config.VEHICLES.xe_vespa.name, 'Xe Vespa Hồng Cute');
    assert.strictEqual(config.VEHICLES.o_to_vinfast.name, 'Ô tô VinFast VF3');
    // Mọi xe phải có energy_cost dương và < chi phí work cơ bản (để có lợi khi đi làm).
    for (const [id, v] of Object.entries(config.VEHICLES)) {
        assert.ok(v.energy_cost > 0 && v.energy_cost < config.ENERGY.COST_PER_WORK, `${id} energy_cost hợp lệ`);
        assert.ok(typeof v.name === 'string' && v.name.length > 0, `${id} có tên`);
    }
});

test('Sprint 3: Vehicle selection priority logic (xe energy thấp nhất đang sở hữu)', () => {
    // Khớp logic trong work.js: chọn xe có energy_cost thấp nhất trong số đang sở hữu.
    function getBestVehicle(inv) {
        const vehKeys = Object.keys(config.VEHICLES);
        const owned = inv.filter(i => vehKeys.includes(i.item_id)).map(i => i.item_id);
        if (!owned.length) return null;
        return owned.reduce((best, id) =>
            config.VEHICLES[id].energy_cost < config.VEHICLES[best].energy_cost ? id : best, owned[0]);
    }

    assert.strictEqual(getBestVehicle([{ item_id: 'xe_wave' }, { item_id: 'xe_vespa' }]), 'xe_vespa');
    assert.strictEqual(getBestVehicle([{ item_id: 'xe_wave' }, { item_id: 'o_to_vinfast' }, { item_id: 'xe_vespa' }]), 'o_to_vinfast');
    assert.strictEqual(getBestVehicle([{ item_id: 'xe_wave' }, { item_id: 'mercedes' }, { item_id: 'sh' }]), 'mercedes');
    assert.strictEqual(getBestVehicle([{ item_id: 'can_cau' }]), null);
    assert.strictEqual(getBestVehicle([]), null);
});
