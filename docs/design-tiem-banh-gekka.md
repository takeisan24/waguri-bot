# BLUEPRINT: Tiệm Bánh Gekka (月下) — Hệ kinh doanh thụ động

> Bản thiết kế v2 — **grounded vào codebase thật** (catalog `0043_seed_catalog`, template RPC `0004/0005/0039`).
> Nguyên tắc chủ đạo: tiệm bánh **KHÔNG bịa hệ mới**, mà (a) là *endgame tự nhiên* của thang nghề Gekka đã có,
> (b) **đóng các "vòng hở"** của ecosystem (cá/hoa/trái/thịt/đồ-craft đang chỉ để bán), (c) tái dùng tối đa hạ tầng.

---

## 0. Khảo sát codebase (căn cứ thiết kế)

**Đã có sẵn — TÁI DÙNG (không tạo mới):**
| Thứ | Bằng chứng | Dùng cho tiệm bánh |
|---|---|---|
| Bánh làm item buff | `ve_vip` "Bánh Kem Dâu Gekka" (20k, buff+50%/6h); `ve_dai_gia` "Cheesecake Gekka" (35k, buff+100%/8h) — `0043` | **Sản phẩm đầu ra** của tiệm |
| Bộ dụng cụ làm bánh | `bo_do_sua_xe` "Bộ Dụng Cụ Làm Bánh Gekka" (8k, tool) — `0043` | **Giấy phép** mở tiệm (như cần câu cho /fish) |
| Cả thang nghề = sự nghiệp Gekka | phụ việc→thợ nướng→quản lý→**chủ chuỗi Gekka** — `0043` jobs | Sở hữu tiệm = **endgame narrative** của career |
| Orphan outputs (chỉ để bán) | `trai_1500..3500`, `hoa_1500..3500`, `thit_heo_*`, `noi_that`, `trang_suc` — `0043` | **Nguyên liệu / trang trí** → đóng vòng hở |
| Template RPC lazy-accrual | `regen_energy`/`spend_energy` — `0004` | Nền cho `bakery_collect` (tính doanh thu theo thời gian) |
| Template charge+create+jsonb | `pig_buy`/`pig_mature`/`pig_claim_sale` (FOR UPDATE, jsonb) — `0039` | Nền cho `bakery_open/upgrade/stock` |
| Leaderboard | `leaderboard_rows` (SQL function) — `0005` | Thêm BXH tiệm |
| Season/Event, Premium, Quest, Achievements, Web, AI | rải rác | Điểm tích hợp |

**Vòng hở cần đóng (từ audit):** 🎣 câu cá (ra tiền, **không ra item**) · 🌸 hoa · 🍓 trái · 🪵 noi_that/trang_suc (chỉ bán) · 🐾 pet (nuôi bằng tiền).

**Migration kế tiếp:** `0066_bakery.sql` (cao nhất hiện tại: `0065_disease.sql`).

---

## 1. Định vị & vòng lặp cốt lõi

Tiệm bánh = **nguồn thu THỤ ĐỘNG có trần + bể tiêu tiền endgame + "gian bếp" tiêu thụ orphan outputs**.

```
        NGUYÊN LIỆU                          SẢN XUẤT (thụ động, lazy)                THU
 orphan: trai_/hoa_/thit_heo/cá  ──nhập──►  Tiệm tự nướng theo thời gian    ──/thu──► doanh thu → ví
 staple: bột/đường/trứng (shop)             (tốn NL, có TRẦN theo cấp)        + đôi khi ra BÁNH (ve_vip/ve_dai_gia)
        ▲                                          │  hết NL/đầy két → DỪNG            │
        └── farm/shop/market (cầu) ◄───────────────┘                                  ▼
                                                                         nâng cấp/thuê/trang trí (sink)
```

**3 chốt cân bằng (chống idle-game):** ① **trần két** (đầy thì dừng → buộc login) · ② **gate nguyên liệu** (hết thì dừng → tạo cầu) · ③ **passive < active** (xem §3 sim).

---

## 2. Cơ chế chi tiết

### 2.1 Mở tiệm — `/tiembanh mo`
- Điều kiện: **Level ≥ 15** + sở hữu **`bo_do_sua_xe`** (8k, mua /shop) + phí **50.000** VNĐ.
- Tạo dòng `bakeries` cấp 1, két rỗng, kho NL rỗng. RPC `bakery_open`.

### 2.2 Nguyên liệu — `/tiembanh nhapnl <loại> <sl>`
**Đóng vòng hở** — công thức bánh ăn orphan outputs + staple rẻ:
| Nguyên liệu | Nguồn | Ghi chú |
|---|---|---|
| 🍓 `trai_*` (trái) | thu hoạch **cây** | *trái hết cụt* — thành nhân bánh ngọt |
| 🌸 `hoa_*` (hoa) | thu hoạch **cây** | *hoa hết cụt* — bánh hoa / trang trí |
| 🍖 `thit_heo_*` | **nuôi heo** | bánh bao nhân thịt (bánh mặn) |
| 🐟 `ca_*` (MỚI) | **câu cá** — thêm drop item vào /fish | *lần đầu câu cá có đầu ra!* (bánh pate cá) |
| 🌾 `bot_mi`,`duong`,`trung` (MỚI, 3 staple rẻ) | /shop | nền cho mọi loại bánh |

→ Chỉ thêm **3 staple + 1 dòng cá**; phần còn lại tái dùng orphan. Nhập NL = trừ tiền (mua) hoặc lấy từ kho (đã farm).

### 2.3 Sản xuất & doanh thu (TRÁI TIM — lazy như `regen_energy`)
Tính **lúc `/thu`** (không cron):
```
elapsed   = now - last_collect_at                       (giây)
rate      = BASE_RATE(cấp) × staff × decor × event/premium   (VNĐ/phút)
cap_t     = capacity(cấp) / rate                        (phút để đầy két)
nl_t      = số_mẻ_NL_hiện_có × PHÚT_MỖI_MẺ              (hết NL thì dừng)
eff_t     = min(elapsed, cap_t, nl_t)
doanh_thu = floor(eff_t × rate)                         (cộng vào ví)
tiêu_NL   = floor(eff_t / PHÚT_MỖI_MẺ) mẻ               (trừ đúng số mẻ đã nướng)
BÁNH ra   = ~1 chiếc ve_vip/ve_dai_gia mỗi N mẻ (xác suất) → item buff giữ lại/tặng/bán
```

### 2.4 Nâng cấp — `/tiembanh nangcap` (bể tiêu endgame)
| Cấp | BASE_RATE (VNĐ/ph) | Capacity | Phí nâng cấp | +Vật liệu |
|---|---|---|---|---|
| 1 | 20 | 12.000 | (mở 50k) | — |
| 2 | 30 | 24.000 | 60.000 | 2 `noi_that` |
| 3 | 45 | 48.000 | 140.000 | 4 `noi_that` |
| 4 | 68 | 96.000 | 320.000 | 6 `noi_that`+2 `trang_suc` |
| 5 | 100 | 190.000 | 700.000 | 10 `noi_that`+4 `trang_suc` |
| 6→10 | ×1.5/cấp | ×2/cấp | ×2.2/cấp | tăng dần |

→ `noi_that`/`trang_suc` **có công dụng thật** (nâng cấp/trang trí) thay vì chỉ bán.

### 2.5 Nhân viên NPC — `/tiembanh thue <npc>` (lore + sink lương)
Tối đa 3 nhân viên; phí thuê 1 lần + **ăn % doanh thu** (lương = sink ngầm):
| NPC | Bonus | Lương |
|---|---|---|
| 🧑‍🍳 Rintaro Tsumugi | +15% doanh thu | 8% |
| 👓 Subaru Hoshina | +25% capacity | 5% |
| 😆 Usami | +10% rate | 4% |
| 🤫 Saku / 🎯 Madoka | −hao hụt / +tỉ lệ ra bánh xịn | 3% |

### 2.6 Trang trí — `/tiembanh trangtri <món>`
Mua nội thất (**tái dùng `noi_that`** + món trang trí mới): +% nhỏ "khách hài lòng" (rate) + hiện trên `/profile` & **web /tiem/[id]**. Thuần flex.

### 2.7 Sự kiện Waguri (dùng `eventCalendar`/`season` sẵn có)
- "Tiệm đông khách — x2 doanh thu 2h", "Rintaro làm mẻ đặc biệt".
- **Mùa lễ:** Tết → bánh chưng, Trung Thu → bánh nướng (bánh mùa giá cao, cần NL mùa).
- **AI:** đưa trạng thái tiệm vào context Waguri → nối "trí nhớ Waguri".

---

## 3. Cân bằng kinh tế + MÔ PHỎNG (phần trước thiếu)

**Mốc thu nhập hiện có (căn cứ `0043`/config):** /work nghề giữa ~320–900/lần (nong_dan/tho_sua_xe), /daily 1.000–6.800, /fish 20–6.000/lần, bán heo 4.000–8.000/chu kỳ, pigbox net ~+? (cost 2400, EV có lãi nhẹ). **Sink lớn:** cosmetic 15–20k, clan 50k, luxury 200k–10M.

**Mô phỏng tiệm (lvl1, luôn đủ NL, thu 2 lần/ngày):**
```
rate 20/ph, capacity 12.000  → đầy sau 10h
Gross/ngày (2 lần thu ~12h)  ≈ 12.000 × 2 = 24.000
Chi phí NL (~55% gross)      ≈ 13.200
Lương nhân viên (nếu có)     ≈ 8–17% gross
NET/ngày lvl1                ≈ 8.000–10.000
```
→ **Passive net ~8–10k/ngày < active grind** (/work nghề giữa dễ 15–30k+/ngày). Passive = *bonus daily*, không thay thế cày. ✅

**Chống lạm phát:** doanh thu **có trần cứng/cấp** (không in tiền vô hạn) · NL **mua bằng tiền** (một phần doanh thu chỉ là tái tuần hoàn, không phải tiền mới) · lương nhân viên = sink · số qua config để tune.

**Chống lạm dụng:** alt cần 50k+`bo_do_sua_xe`+NL liên tục → ROI thấp · tiệm **không steal-able** (khoản đầu tư lớn, khác heo/cây cố ý) · NL rẻ nhất từ farm → khuyến khích cày, không phải mua-shop-lãi-suông (đặt giá staple > margin như nguyên tắc `recipes` hiện có).

---

## 4. BLUEPRINT KỸ THUẬT (theo đúng convention repo)

### 4.1 Bảng `bakeries` (migration `0066_bakery.sql`)
```sql
CREATE TABLE IF NOT EXISTS bakeries (
    user_id         TEXT PRIMARY KEY,
    level           INT NOT NULL DEFAULT 1,
    revenue_pending BIGINT NOT NULL DEFAULT 0,       -- két đang chờ /thu (để hiện, thực tính lazy)
    ingredients     JSONB NOT NULL DEFAULT '{}',     -- {trai_2000:int, hoa_1500:int, bot_mi:int, ...}
    staff           JSONB NOT NULL DEFAULT '[]',     -- ['rintaro','subaru']
    decor           JSONB NOT NULL DEFAULT '[]',
    last_collect_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 Items mới (chỉ 4 dòng — staple + cá; style `0043`)
```sql
INSERT INTO items (id,name,description,price,type,effect_type,effect_value,effect_duration_hours,shop_hidden) VALUES
 ('bot_mi','Bột Mì','Nguyên liệu nền làm bánh tại tiệm Gekka.',80,'material','none',0,1,false),
 ('duong','Đường','Vị ngọt cho mọi loại bánh.',60,'material','none',0,1,false),
 ('trung','Trứng Gà','Nguyên liệu tươi cho bánh bông lan.',120,'material','none',0,1,false),
 ('ca_tuoi','Cá Tươi','Câu được từ /fish — làm nhân bánh mặn/pate.',300,'material','none',0,1,true)
ON CONFLICT (id) DO NOTHING;
-- (tuỳ chọn: thêm 1 tier bánh giữa 'banh_su_kem' buff+30% nếu muốn 3 bậc sản phẩm)
```
> Kèm sửa `/fish` (src/commands/economy/fish.js): xác suất rơi thêm `ca_tuoi` (đóng vòng hở câu cá).

### 4.3 RPC (plpgsql, FOR UPDATE, jsonb — như `0039`)
```
bakery_open(p_user, p_cost, p_min_level)      → 'ok'|'has'|'poor'|'low_level'|'no_tool'
   (kiểm level + tồn tại bo_do_sua_xe trong inventory + trừ tiền + insert bakeries)
bakery_stock(p_user, p_item, p_qty, p_cost)   → bool  (trừ tiền HOẶC trừ kho + cộng ingredients jsonb)
bakery_collect(p_user, p_base_rate, p_cap,
   p_min_per_batch, p_bonuses jsonb)          → jsonb {revenue, consumed, cakes, capped}
   (LAZY: eff_t = min(elapsed, cap/rate, nl/…); cộng ví; trừ ingredients; set last_collect_at)
bakery_upgrade(p_user, p_cost, p_mats jsonb)  → 'ok'|'poor'|'no_mats'|'max'
bakery_hire(p_user, p_npc, p_cost)            → 'ok'|'poor'|'full'|'has'
bakery_decorate(p_user, p_item, p_cost)       → 'ok'|'poor'
```
> Mọi phép tiền/kho nằm TRỌN trong RPC (nguyên tử) — KHÔNG đọc-sửa-ghi ở JS (đúng luật repo).

### 4.4 Lớp `database.js` (wrapper try/catch trả data, như các hàm pig/plant)
`bakeryOpen, bakeryStock, bakeryCollect, bakeryUpgrade, bakeryHire, bakeryDecorate, getBakery`.

### 4.5 Config (`src/config/index.js` — thêm block)
```js
BAKERY: {
  OPEN_COST: 50000, MIN_LEVEL: 15, TOOL: 'bo_do_sua_xe',
  LEVELS: [ /* {rate, capacity, upCost, mats} × 10 */ ],
  MIN_PER_BATCH_SEC: 60, INGREDIENT_COST_RATIO: 0.55,
  STAFF: { rintaro:{rev:0.15,wage:0.08}, subaru:{cap:0.25,wage:0.05}, usami:{rate:0.10,wage:0.04}, ... },
  CAKE_EVERY_BATCHES: 40, CAKES: ['ve_vip','ve_dai_gia'],
},
```

### 4.6 Lệnh `/tiembanh` (subcommand + prefix)
`xem · mo · nhapnl <loai> <sl> · thu · nangcap · thue <npc> · duoi <npc> · trangtri <mon>`
- File: `src/commands/economy/tiembanh.js` (mẫu subcommand như `/vay`, `/bank` vừa làm).
- Prefix: `w!tiembanh`, alias `w!thubanh→tiembanh thu`, `w!nhapnl→tiembanh nhapnl` (dùng cơ chế `PREFIX_ALIASES` {cmd,sub} đã có trong messageCreate).

### 4.7 Tích hợp hệ sẵn có
- **check-command-sync + web:** thêm `["tiembanh", ...]` vào `CommandsExplorer.tsx` (nếu không CI đỏ) + mục wiki.
- **Quest:** thêm key `bake`/`bakery_collect` vào POOL (`src/data/quests.js`) + `db.questIncr` khi `/thu`.
- **Achievements:** mở tiệm · tiệm cấp 5 · thuê Rintaro · doanh thu tích luỹ 1 triệu (`src/data/achievements.js`).
- **Leaderboard:** RPC `bakery_leaderboard(p_sort, p_limit)` (theo level/tổng doanh thu) — mẫu `leaderboard_rows`.
- **Premium:** cộng `PREMIUM.INCOME_BONUS` vào `p_bonuses` khi collect (hoặc trang trí/nhân viên premium-only).
- **Web:** trang `web/src/app/tiem/[id]/page.tsx` khoe tiệm (cấp, trang trí, nhân viên, sản phẩm) — API mở rộng `voteServer.js /api/*`.
- **AI:** thêm trạng thái tiệm vào context persona.

---

## 5. Lộ trình phân đợt (ship sớm, verify từng bước)
- **Phase 1 — MVP core loop** (~1 migration + 1 lệnh):
  bảng + 4 item + `mo/xem/nhapnl(shop staple+kho orphan)/thu/nangcap` (cấp 1–5). RPC open/stock/collect/upgrade. Thêm drop `ca_tuoi` vào /fish. **Test đơn vị hàm thuần (tính accrual) + sim số.**
- **Phase 2 — chiều sâu:** nhân viên + trang trí + sự kiện Waguri + ra bánh item.
- **Phase 3 — nối hệ:** BXH tiệm + trang web + quest/achievement + AI + bánh mùa lễ.

## 6. Rủi ro & kế hoạch verify (nhớ bài học "verify tĩnh chưa đủ")
| Rủi ro | Verify |
|---|---|
| **Số passive lệch** (in tiền / vô dụng) | **Bảng mô phỏng** §3 + chỉnh config trước khi bật; theo dõi tổng cung tiền (telemetry) |
| Accrual sai (cap/NL/thời gian) | **Unit test hàm thuần tính eff_t/revenue** (tách logic khỏi DB như `disease.js`/`leveling.js`) |
| RPC không nguyên tử | Test RPC trên Supabase test (integration — đúng gap B.1.2) |
| Phình lệnh/ngợp | Gộp trong 1 lệnh `/tiembanh`; onboard qua tip `/work` khi Lv15 |
| CI đỏ | web CommandsExplorer + check-command-sync + web build |

---

## 7. Vì sao blueprint này ĐÚNG & KHÁC bản v1
- **Đóng vòng hở** (cá/hoa/trái/thịt/noi_that có công dụng) thay vì thêm 5 item rời.
- **Tái dùng bánh & toolkit & career Gekka đã có** → ít item mới (chỉ 4), khớp lore sẵn.
- **Có mô phỏng kinh tế** (thứ v1 thiếu) + template RPC chính xác từ codebase.
- **Kế hoạch verify** gồm unit test hàm thuần + integration + telemetry (không lặp lỗi "verify tĩnh").
