// Bảng câu cá: weight = trọng số xác suất, min/max = khoảng tiền nhận.
// 'junk' (min=max=0) là câu trượt. Tổng weight không cần =100.
module.exports = [
    { name: 'Rác / lốp xe cũ', emoji: '🗑️', weight: 15, min: 0,    max: 0 },
    { name: 'Cá lòng tong',    emoji: '🐟', weight: 45, min: 10,   max: 60 },
    { name: 'Cá rô phi',       emoji: '🐠', weight: 25, min: 50,   max: 150 },
    { name: 'Cá lóc bự',       emoji: '🐡', weight: 10, min: 150,  max: 400 },
    { name: 'Cá hiếm',         emoji: '🦈', weight: 4,  min: 400,  max: 1000 },
    { name: 'Rương kho báu',   emoji: '💰', weight: 1,  min: 1000, max: 5000 },
];
