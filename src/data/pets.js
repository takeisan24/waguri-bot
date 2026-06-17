// Thú cưng: danh sách loài + công thức level. Level = floor(sqrt(exp/30)) + 1.
const SPECIES = [
    { id: 'meo', name: 'Mèo con', emoji: '🐱' },
    { id: 'cun', name: 'Cún con', emoji: '🐶' },
    { id: 'rong', name: 'Rồng con', emoji: '🐲' },
    { id: 'cao', name: 'Cáo nhỏ', emoji: '🦊' },
    { id: 'tho', name: 'Thỏ con', emoji: '🐰' },
    { id: 'gau', name: 'Gấu con', emoji: '🐻' },
];

const petLevel = exp => Math.floor(Math.sqrt(Math.max(0, exp) / 30)) + 1;
const expForLevel = lvl => 30 * (lvl - 1) * (lvl - 1);
const findSpecies = id => SPECIES.find(s => s.id === id);

module.exports = { SPECIES, petLevel, expForLevel, findSpecies };
