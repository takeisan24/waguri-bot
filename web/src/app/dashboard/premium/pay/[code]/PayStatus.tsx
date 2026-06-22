"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Hỏi trạng thái đơn mỗi 4s; khi PayOS báo đã trả -> refresh để server render màn "thành công".
export default function PayStatus({ code }: { code: string }) {
  const router = useRouter();
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    let alive = true;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/premium/${code}`, { cache: "no-store" });
        if (!alive) return;
        const j = await r.json();
        if (j.status === "paid") {
          router.refresh();
          return;
        }
      } catch {
        /* lỗi mạng -> thử lại lần sau */
      }
      if (alive) setWaited((w) => w + 4);
    }, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [code, router]);

  return (
    <div className="flex items-center justify-center gap-2 text-sm text-pink-200/80">
      <span className="inline-block w-4 h-4 rounded-full border-2 border-pink-300/40 border-t-pink-300 animate-spin" />
      Đang chờ thanh toán… tự nhận khi tiền vào{waited >= 60 ? " (đã chờ hơi lâu — kiểm tra lại nội dung CK nhé)" : ""}
    </div>
  );
}
