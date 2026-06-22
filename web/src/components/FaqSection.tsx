"use client";

import { useState } from "react";

const FAQS: [string, string][] = [
  ["Waguri có miễn phí không?", "Hoàn toàn miễn phí! Mời bot và chơi thả ga. Gói Premium chỉ là tùy chọn ủng hộ để nhận thêm quyền lợi."],
  ["Bắt đầu chơi như thế nào?", "Mời Waguri vào server, gõ /start để tạo nhân vật và nhận quà chào mừng, rồi /daily mỗi ngày để tích vốn."],
  ["Tiền và dữ liệu của tôi có an toàn không?", "Có. Mọi giao dịch tiền chạy bằng RPC nguyên tử trên PostgreSQL (chống lỗi & gian lận), dữ liệu lưu an toàn trên Supabase."],
  ["Ví tiền có dùng chung giữa các server không?", "Có! Ví tiền dùng chung trên mọi server. Bảng xếp hạng có cả toàn cầu lẫn theo từng server."],
  ["Premium gồm những gì?", "150 lượt chat AI/ngày, +10% thu nhập mọi lệnh kiếm tiền, huy hiệu 💎 và ưu tiên trải nghiệm tính năng mới."],
  ["Gặp lỗi hoặc mất tiền thì làm sao?", "Vào server hỗ trợ mở /ticket hoặc báo ở kênh #báo-lỗi. Lỗi hợp lệ còn có thể được thưởng 💝."],
];

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="w-full py-16 md:py-20">
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
        <h2 className="text-3xl md:text-4xl font-extrabold text-white">Câu hỏi thường gặp</h2>
        <p className="text-slate-400 text-sm md:text-base">Vài thắc mắc phổ biến trước khi bắt đầu cùng Waguri 🌸</p>
      </div>
      <div className="max-w-2xl mx-auto space-y-3">
        {FAQS.map(([q, a], i) => {
          const isOpen = open === i;
          return (
            <div key={q} className="glass-panel rounded-2xl border border-pink-300/10 overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-bold text-white text-sm md:text-base">{q}</span>
                <span className={`text-pink-300 text-xl transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
              </button>
              {isOpen ? <p className="px-5 pb-4 text-slate-400 text-sm leading-relaxed">{a}</p> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
