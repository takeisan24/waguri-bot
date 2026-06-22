"use client";

import React, { useState } from "react";

// Nút copy nhỏ gắn cạnh giá trị (số TK / nội dung / số tiền).
export default function CopyHint({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard bị chặn -> bỏ qua */
        }
      }}
      className="ml-2 text-[10px] font-bold text-pink-300/80 hover:text-pink-200 align-middle"
      aria-label="Sao chép"
    >
      {done ? "✓ đã chép" : "📋"}
    </button>
  );
}
