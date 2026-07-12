"use client";

import React, { useState } from "react";
import { likeBakeryAction } from "../actions";

type LikeButtonProps = {
  ownerId: string;
  initialLikes: number;
  locale: string;
  ownerName: string;
};

export default function LikeButton({ ownerId, initialLikes, locale, ownerName }: LikeButtonProps) {
  const [likes, setLikes] = useState(initialLikes);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"success" | "error" | null>(null);

  const handleLike = async () => {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    setStatus(null);

    const res = await likeBakeryAction(ownerId);
    setLoading(false);

    if (res.success) {
      setLikes((prev) => prev + 1);
      setStatus("success");
      setMessage(
        locale === "en"
          ? `Successfully liked ${ownerName}'s bakery! ❤️`
          : `Đã thả tim tiệm bánh của ${ownerName} thành công! ❤️`
      );
    } else {
      setStatus("error");
      if (res.error === "unauthenticated") {
        setMessage(
          locale === "en"
            ? "Please log in to like this bakery! 🌸"
            : "Cậu cần đăng nhập để thả tim tiệm bánh nha~ 🌸"
        );
      } else if (res.error === "self_like") {
        setMessage(
          locale === "en"
            ? "You cannot like your own bakery! 🌸"
            : "Cậu không thể tự thả tim tiệm bánh của mình nha~ 🌸"
        );
      } else if (res.error === "limit_reached") {
        setMessage(
          locale === "en"
            ? "You have reached your 3-like daily limit! ❤️"
            : "Hôm nay cậu đã hết lượt thả tim rồi (tối đa 3 lần/ngày)! ❤️"
        );
      } else if (res.error === "already_liked_today") {
        setMessage(
          locale === "en"
            ? "You have already liked this bakery today! 🌸"
            : "Hôm nay cậu đã thả tim tiệm bánh này rồi nha~ 🌸"
        );
      } else {
        setMessage(
          locale === "en"
            ? "An error occurred, please try again later! 🥺"
            : "Có lỗi xảy ra, cậu thử lại sau nhé! 🥺"
        );
      }
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={handleLike}
        disabled={loading}
        className={`relative flex items-center gap-3 px-8 py-4 rounded-full font-extrabold text-white shadow-lg transition-all duration-300 transform active:scale-95 ${
          loading
            ? "bg-rose-900/50 cursor-not-allowed border border-rose-700/50"
            : "bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 hover:shadow-rose-500/25 hover:shadow-2xl border border-rose-400/20"
        }`}
      >
        <span className="text-xl animate-pulse">❤️</span>
        <span>
          {locale === "en" ? "Like Gekka Bakery" : "Thả tim tiệm bánh"} ({likes})
        </span>
      </button>
      {message && (
        <span
          className={`text-sm font-semibold px-4 py-2 rounded-xl backdrop-blur-md border ${
            status === "success"
              ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/20"
              : "text-rose-400 bg-rose-950/20 border-rose-500/20"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
