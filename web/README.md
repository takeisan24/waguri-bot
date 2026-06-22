# Waguri Web

Landing page, dashboard, và bảng xếp hạng công khai cho Discord bot **Waguri**.

**Production:** https://waguri-bot.vercel.app

## Tính năng

- Trang chủ giới thiệu bot (landing page)
- Danh sách lệnh: `/commands`
- Bảng xếp hạng: `/leaderboard` (tài sản / cấp / tình cảm)
- Hồ sơ người chơi công khai: `/profile/[userId]`
- Trang duyệt đơn Premium (owner-only)

## Công nghệ

- **Next.js App Router** (TypeScript)
- **Tailwind CSS**
- **Supabase** (Postgres + Auth)

## Chạy local

```bash
cd web
npm install
npm run dev
```

Mở http://localhost:3000.

## Biến môi trường

Sao chép `.env.example` thành `.env.local` và điền giá trị thật — xem comment trong file đó.

```bash
cp .env.example .env.local
```

## Deploy

Deploy tự động qua Vercel khi push lên nhánh `master`.
Khai báo biến môi trường trong Vercel Project Settings (KHÔNG commit `.env.local`).
