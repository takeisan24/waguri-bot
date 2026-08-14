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
            // Cùng họ với `no-undef` ở trên: định danh giải sai, chỉ lộ khi người dùng chạy
            // tới đúng nhánh đó. `/eco-admin trace` từng crash vì `const C` khai báo ở CUỐI
            // hàm còn nhánh trace nằm TRƯỚC -> chạm vào biến trong vùng chết (TDZ).
            // `functions`/`classes` = false: hàm được hoisted đầy đủ, gọi trước khai báo là
            // hợp lệ và là văn phong sẵn có trong repo. Chỉ soi `variables` — đúng lớp lỗi.
            // Bật lúc toàn repo đã 0 vi phạm, nên KHÔNG cần allowlist như các gate khác.
            'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
            'no-unused-vars': 'off', // nhiều biến đặt tên có chủ đích; tránh nhiễu
        },
    },
];
