// Thành tựu — điều kiện tính từ trạng thái hiện tại (ctx). Mở khóa 1 lần, có thưởng.
// ctx = { level, networth, jobId, items: Set<item_id> }
module.exports = [
    { id: 'lv5',          name: '🌱 Tập Sự',     desc: 'Đạt Level 5',                 reward: 1000,   check: c => c.level >= 5 },
    { id: 'lv15',         name: '💼 Chuyên Nghiệp', desc: 'Đạt Level 15',             reward: 3000,   check: c => c.level >= 15 },
    { id: 'lv30',         name: '👑 Bậc Thầy',   desc: 'Đạt Level 30',                reward: 10000,  check: c => c.level >= 30 },
    { id: 'rich_100k',    name: '💰 Khá Giả',    desc: 'Tổng tài sản 100.000',        reward: 2000,   check: c => c.networth >= 100000 },
    { id: 'rich_1m',      name: '💸 Triệu Phú',  desc: 'Tổng tài sản 1.000.000',      reward: 10000,  check: c => c.networth >= 1000000 },
    { id: 'rich_10m',     name: '🏦 Tỷ Phú',     desc: 'Tổng tài sản 10.000.000',     reward: 50000,  check: c => c.networth >= 10000000 },
    { id: 'job_chutich',  name: '🎩 Chủ Tịch',   desc: 'Làm nghề Chủ Tịch Giả Danh',  reward: 5000,   check: c => c.jobId === 'chu_tich' },
    { id: 'job_daigia',   name: '🏛️ Đại Gia',    desc: 'Làm nghề Đại Gia Bất Động Sản', reward: 20000, check: c => c.jobId === 'dai_gia' },
    { id: 'own_mercedes', name: '🚙 Xe Sang',    desc: 'Sở hữu Mercedes G63',         reward: 5000,   check: c => c.items.has('mercedes') },
    { id: 'own_sieuxe',   name: '🏎️ Tốc Độ',     desc: 'Sở hữu Siêu Xe Lamborghini',  reward: 30000,  check: c => c.items.has('sieu_xe') },
    { id: 'own_duthuyen', name: '🛥️ Dân Chơi',   desc: 'Sở hữu Du Thuyền',            reward: 100000, check: c => c.items.has('du_thuyen') },
];
