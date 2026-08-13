-- ============================================================
-- 0100_hide_rare_drops_from_shop.sql
-- Đóng 2 máy in tiền qua CHẾ TẠO — có từ migration 0078, KHÔNG liên quan sự cố chợ.
--
-- PHÁT HIỆN (bởi test bất biến `KINH TẾ #7`, 2026-08-13):
--   · tram_huong_vong : mua ky_nam 15.000 + 2× thoi_sat 1.000 = 16.000
--                       -> /craft -> /store sell 22.500        = +41%/vòng, lặp vô hạn
--   · vuong_mieng_gold: mua vang_dong_tren 5.000 + 2× thoi_sat 1.000
--                       + 6× da 240 + trang_suc 6.000 = 12.240
--                       -> /craft -> /store sell 60.000        = +390%/vòng, lặp vô hạn
--
-- NGUYÊN NHÂN GỐC: `0078_rarity_and_items.sql` thêm 6 vật phẩm bằng
--   INSERT INTO items (id, name, type, category, price, description, rarity)
-- tức KHÔNG có cột `shop_hidden` -> rơi về mặc định `false` (đặt ở 0039) -> BÁN TRONG TIỆM.
-- Hệ quả kép:
--   1) Vỡ thiết kế độ hiếm: `config.COLLECTIONS.DROP_RATES` định nghĩa các món này là
--      drop 0,5%–1% khi /mine /chop /fish. Mua thẳng 15.000 xu thì cày làm gì?
--   2) Vì giá catalog < 2× giá bán lại của sản phẩm chế tạo -> arbitrage vô hạn.
--
-- CÁCH SỬA: 4 nguyên liệu siêu hiếm chỉ được rơi khi CÀY, không bán trong tiệm.
-- Sản phẩm chế tạo (tram_huong_vong, vuong_mieng_gold) VẪN mua được — mua rồi bán lại
-- chỉ thu về 50% nên không tạo vòng lặp.
--
-- Idempotent.
-- ============================================================

UPDATE public.items
SET shop_hidden = true
WHERE id IN (
    'ky_nam',          -- Kỳ Nam            — rơi 0,5% khi /chop
    'vang_dong_tren',  -- Vàng Đông Triều   — rơi 1,0% khi /mine
    'ca_koi_nhat',     -- Cá Koi Hoàng Gia  — rơi ~0,1% khi /fish
    'ca_rong_vang'     -- Cá Rồng Kim Long  — rơi ~0,4% khi /fish
)
AND shop_hidden IS DISTINCT FROM true;

-- ============================================================
-- VERIFY sau khi áp:
--
-- SELECT id, name, price, shop_hidden FROM public.items
-- WHERE id IN ('ky_nam','vang_dong_tren','ca_koi_nhat','ca_rong_vang');
--   -> shop_hidden = true cả 4
--
-- -- Không còn công thức nào mua-được-toàn-bộ-nguyên-liệu mà chế ra có lãi:
-- -- (chạy `npm run check-economy` ở repo — bất biến #7 phải xanh)
--
-- GHI CHÚ CÂN BẰNG (chưa xử lý, để cậu quyết sau):
--   `vuong_mieng_gold` bán được 60.000 nhưng chỉ cần 1× vang_dong_tren (drop 1% khi /mine).
--   Nghĩa là một cú may 1% quy đổi thành ~53.000 xu sau khi trừ nguyên liệu mua được.
--   Không còn là exploit (đã chặn vòng lặp), nhưng vẫn khiến drop hiếm chi phối thu nhập.
--   Nếu muốn siết: hạ giá vuong_mieng_gold, hoặc tăng số vang_dong_tren cần dùng.
-- ============================================================
