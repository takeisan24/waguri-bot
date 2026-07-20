// ESLint tối giản cho bot (CommonJS thuần). MỤC TIÊU HẸP: bắt các lỗi thực thi ẩn mà test
// không lộ được — trên hết là `no-undef` (biến/định danh chưa khai báo). Chính lỗi này đã làm
// /loto & /bingo crash lúc mở phòng (`hostId` không khai báo) mà chỉ hiện khi user chạy tới.
// KHÔNG bật rule style để tránh nhiễu; chỉ giữ vài rule đúng-sai giá trị cao.
const globals = require('globals');

module.exports = [
    {
        files: ['src/**/*.js', 'index.js', 'shard.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'commonjs',
            globals: { ...globals.node },
        },
        rules: {
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'no-unused-vars': 'off', // nhiều biến đặt tên có chủ đích; tránh nhiễu
        },
    },
];
