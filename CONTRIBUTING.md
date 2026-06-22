# Hướng dẫn đóng góp

Cảm ơn bạn đã muốn đóng góp cho Waguri!

## Quy trình

1. **Fork & clone**
   ```bash
   git clone https://github.com/<your-username>/waguri-bot.git
   cd waguri-bot
   npm install
   ```

2. **Tạo branch mới** từ `master`
   ```bash
   git checkout -b feat/ten-tinh-nang
   # hoặc
   git checkout -b fix/ten-loi
   ```

3. **Viết code** — giữ thay đổi nhỏ và tập trung vào 1 việc. Match style hiện có (CommonJS, discord.js v14, Supabase RPC).

4. **Chạy test trước khi PR**
   ```bash
   npm test
   ```
   Không để test đỏ. Nếu thêm logic mới có thể test được, hãy thêm file test vào `test/`.

5. **Commit theo Conventional Commits**
   ```
   feat(economy): thêm lệnh /heo nuôi heo đất
   fix(loto): sửa race condition khi mua vé đồng thời
   docs: cập nhật README thêm lệnh mới
   chore: bump discord.js lên 14.x
   ```

6. **Mở Pull Request** vào nhánh `master`. Điền đầy đủ template PR (mô tả, loại thay đổi, checklist).

## Quy tắc chung

- KHÔNG commit file `.env` hoặc bất kỳ secret nào.
- Mọi thao tác tiền/EXP/kho phải dùng RPC Supabase nguyên tử — không update trực tiếp từ bot.
- Lệnh mới đặt vào đúng thư mục `src/commands/{economy,games,fun,utility,admin}/`.
- Migration DB mới: tạo file `supabase/migrations/<số tiếp theo>_<tên>.sql`, thiết kế idempotent.

## Báo lỗi / Đề xuất

Dùng [GitHub Issues](https://github.com/takeisan24/waguri-bot/issues) với template có sẵn.
